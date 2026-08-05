import { pool } from "../db/pool.js";

export type AnalysisGenerationResult = {
  problemAnalysis: string;
  impactAnalysis: string;
};

export async function generateAnalysisFromEmail(
  emailContext: string,
  emailSubject?: string
): Promise<AnalysisGenerationResult> {
  if (!emailContext || !emailContext.trim()) {
    throw new Error("Email context is empty. Please fetch email content first.");
  }

  // Get OpenRouter settings from DB or env
  const { rows } = await pool.query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('openrouter_api_key', 'openrouter_model', 'ai_instruction_email', 'ai_instruction_problem', 'ai_instruction_impact')`
  );

  const settingsMap = rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {} as Record<string, string>);

  const apiKey = settingsMap.openrouter_api_key || process.env.OPENROUTER_API_KEY || "";
  const model = settingsMap.openrouter_model || process.env.OPENROUTER_MODEL || "openrouter/auto";
  const problemInstructions = settingsMap.ai_instruction_problem || "";
  const impactInstructions = settingsMap.ai_instruction_impact || "";
  const generalInstructions = settingsMap.ai_instruction_email || "";

  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please configure OpenRouter API Key in Master Data & Settings -> AI Instructions.");
  }

  const systemPrompt = `You are an expert IT Business Analyst & SAP Consultant.
Your task is to analyze raw email communications regarding an IT/SAP issue or Change Request and generate two distinct sections:

1. Problem Analysis: Concise technical description of the reported issue, error message, system behavior, line/program affected, and root cause if mentioned.
${problemInstructions ? `[MANDATORY INSTRUCTION FOR PROBLEM ANALYSIS]:\n${problemInstructions}\n` : ""}
2. Impact Analysis: Business or operational impact, affected users/processes, urgency, and potential consequences if not resolved.
${impactInstructions ? `[MANDATORY INSTRUCTION FOR IMPACT ANALYSIS]:\n${impactInstructions}\n` : ""}
${generalInstructions ? `[GENERAL GUIDELINES]:\n${generalInstructions}\n` : ""}
IMPORTANT: You MUST respond ONLY with a valid JSON object strictly matching this schema, without any markdown formatting or commentary:
{
  "problemAnalysis": "your problem analysis text here",
  "impactAnalysis": "your impact analysis text here"
}`;

  const userPrompt = `Email Subject: ${emailSubject || "N/A"}

Email Content & History:
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
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";

  try {
    // Strip markdown JSON wrapping if present
    const cleanedJson = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleanedJson);
    return {
      problemAnalysis: parsed.problemAnalysis || rawContent,
      impactAnalysis: parsed.impactAnalysis || ""
    };
  } catch {
    // Fallback if parsing failed
    return {
      problemAnalysis: rawContent,
      impactAnalysis: ""
    };
  }
}
