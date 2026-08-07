import { pool } from "../db/pool.js";

export type AnalysisGenerationResult = {
  issueName: string;
  requestDescription?: string;
  problemAnalysis: string;
  impactAnalysis: string;
  participants?: Record<string, string>;
  timeline?: Record<string, string>;
};

export async function generateAnalysisFromEmail(
  emailContext: string,
  emailSubject?: string,
  issueName?: string
): Promise<AnalysisGenerationResult> {
  if (!emailContext || !emailContext.trim()) {
    throw new Error("Email context is empty. Please fetch email content first.");
  }

  // Get OpenRouter settings from DB or env
  const { rows } = await pool.query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('openrouter_api_key', 'openrouter_model', 'ai_instruction_glpi', 'ai_instruction_email', 'ai_instruction_issue_name', 'ai_instruction_problem', 'ai_instruction_impact')`
  );

  const settingsMap = rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {} as Record<string, string>);

  const apiKey = settingsMap.openrouter_api_key || process.env.OPENROUTER_API_KEY || "";
  const model = settingsMap.openrouter_model || process.env.OPENROUTER_MODEL || "openrouter/auto";
  const glpiInstructions = settingsMap.ai_instruction_glpi || "";
  const issueNameInstructions = settingsMap.ai_instruction_issue_name || "";
  const problemInstructions = settingsMap.ai_instruction_problem || "";
  const impactInstructions = settingsMap.ai_instruction_impact || "";
  const generalInstructions = settingsMap.ai_instruction_email || "";

  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please configure OpenRouter API Key in Master Data & Settings -> AI Instructions.");
  }

  const systemPrompt = `You are an expert IT Business Analyst & SAP Consultant.
Your task is to analyze raw email communications, GLPI ticket details, and discussion logs regarding an IT/SAP issue or Change Request, and generate/extract the following structured data:

1. Issue Name: A short, concise, and clear title summarizing the issue (maximum 60 characters).
${issueNameInstructions ? `[MANDATORY INSTRUCTION FOR ISSUE NAME]:\n${issueNameInstructions}\n` : ""}
2. Request Description: A concise summary of the requested change / SAP request description (maximum 55 characters). Follow the EXACT SAME rules and instructions as Issue Name.
${issueNameInstructions ? `[MANDATORY INSTRUCTION FOR REQUEST DESCRIPTION (SAME AS ISSUE NAME)]:\n${issueNameInstructions}\n` : ""}
3. Problem Analysis: Concise technical description of the reported issue, error message, system behavior, line/program affected, and root cause if mentioned.
${problemInstructions ? `[MANDATORY INSTRUCTION FOR PROBLEM ANALYSIS]:\n${problemInstructions}\n` : ""}
4. Impact Analysis: Business or operational impact, affected users/processes, urgency, and potential consequences if not resolved.
${impactInstructions ? `[MANDATORY INSTRUCTION FOR IMPACT ANALYSIS]:\n${impactInstructions}\n` : ""}
5. Participants (People Involved): Infer/extract person names (full name or username/nickname) from the email/GLPI context for roles:
   - requester: Person requesting the issue/CR
   - abaper: ABAP Developer/Technician assigned
   - dev_tester: DEV Tester
   - dev_evaluator: DEV Evaluator
   - qa_transporter: QA Transporter
   - qa_tester: QA Tester
   - qa_evaluator: QA Evaluator
   - prd_requester: PRD Requester
   - prd_evaluator: PRD Evaluator
   - approval: PRD Approver
   - executor: PRD Transporter
6. Timeline Dates: Extract any mentioned dates for:
   - dev_tested_date (YYYY-MM-DD HH:MM:SS or YYYY-MM-DD)
   - dev_evaluated_date
   - qa_tested_date
   - qa_evaluated_date
   - prd_requested_date
   - prd_evaluated_date
   - approval_date

${glpiInstructions ? `[CR DAN GLPI GENERATION GUIDELINES]:\n${glpiInstructions}\n` : ""}
${generalInstructions ? `[GENERAL GUIDELINES]:\n${generalInstructions}\n` : ""}

IMPORTANT: You MUST respond ONLY with a valid JSON object strictly matching this schema, without any markdown formatting or commentary:
{
  "issueName": "concise issue name",
  "requestDescription": "concise request description for SAP CR (max 55 chars)",
  "problemAnalysis": "problem analysis text",
  "impactAnalysis": "impact analysis text",
  "participants": {
    "requester": "Name or empty string",
    "abaper": "Name or empty string",
    "dev_tester": "Name or empty string",
    "dev_evaluator": "Name or empty string",
    "qa_transporter": "Name or empty string",
    "qa_tester": "Name or empty string",
    "qa_evaluator": "Name or empty string",
    "prd_requester": "Name or empty string",
    "prd_evaluator": "Name or empty string",
    "approval": "Name or empty string",
    "executor": "Name or empty string"
  },
  "timeline": {
    "dev_tested_date": "date string or empty string",
    "dev_evaluated_date": "date string or empty string",
    "qa_tested_date": "date string or empty string",
    "qa_evaluated_date": "date string or empty string",
    "prd_requested_date": "date string or empty string",
    "prd_evaluated_date": "date string or empty string",
    "approval_date": "date string or empty string"
  }
}`;

  const userPrompt = `Issue Name: ${issueName || "N/A"}
Email Subject / Ref: ${emailSubject || "N/A"}

Context & Background Data (Email & GLPI Tickets):
${emailContext}`;

  const siteUrl = process.env.OPENROUTER_SITE_URL || "https://github.com/willfebrian/cr-management-system";
  const appTitle = process.env.OPENROUTER_APP_NAME || "CR Management System";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": siteUrl,
      "X-Title": appTitle,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`OpenRouter Error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

  if (!rawContent) {
    throw new Error(`AI Model (${model}) returned an empty response. Please try clicking Generate AI again.`);
  }

  try {
    // Strip markdown JSON wrapping if present
    const cleanedJson = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleanedJson);
    
    const issueName = parsed.issueName || parsed.issue_name || "";
    const requestDescription = parsed.requestDescription || parsed.request_description || "";
    const problemAnalysis = parsed.problemAnalysis || parsed.problem_analysis || "";
    const impactAnalysis = parsed.impactAnalysis || parsed.impact_analysis || "";
    const participants = typeof parsed.participants === "object" && parsed.participants ? parsed.participants : undefined;
    const timeline = typeof parsed.timeline === "object" && parsed.timeline ? parsed.timeline : undefined;

    if (!problemAnalysis && !impactAnalysis && !issueName && !requestDescription) {
      throw new Error(`AI response JSON did not contain expected fields. Raw output: ${rawContent.slice(0, 150)}...`);
    }

    return {
      issueName,
      requestDescription,
      problemAnalysis: problemAnalysis || rawContent,
      impactAnalysis,
      participants,
      timeline
    };
  } catch (err: any) {
    if (err.message && err.message.startsWith("AI response JSON")) {
      throw err;
    }
    // If JSON parsing fails but we have text, return text in problemAnalysis
    if (rawContent && rawContent.length > 10) {
      return {
        issueName: "",
        problemAnalysis: rawContent,
        impactAnalysis: ""
      };
    }
    throw new Error(`Failed to parse AI response: ${err.message}. Raw output: ${rawContent.slice(0, 100)}...`);
  }
}
