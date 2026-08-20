import { pool } from "../db/pool.js";

export type AnalysisGenerationResult = {
  issueName: string;
  requestDescription?: string;
  problemAnalysis: string;
  impactAnalysis: string;
  participants?: Record<string, string>;
  timeline?: Record<string, string>;
  providerUsed?: string;
};

export type TestProviderParams = {
  provider: "9router" | "openrouter";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
};

function normalizeChatEndpoint(baseUrl: string): string {
  let clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/chat/completions")) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

function parseOpenAiCompatibleResponse(text: string): { content: string; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { content: "" };
  }

  // Case 1: Server-Sent Events (SSE) stream (lines starting with 'data:')
  if (trimmed.includes("data:") || trimmed.includes("data :")) {
    const lines = trimmed.split("\n");
    let accumulatedContent = "";
    let capturedError = "";

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine === "data: [DONE]" || cleanLine === "data:[DONE]") {
        continue;
      }
      if (cleanLine.startsWith("data:") || cleanLine.startsWith("data :")) {
        const jsonStr = cleanLine.replace(/^data\s*:\s*/, "").trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const chunk = JSON.parse(jsonStr);
          if (chunk.error) {
            capturedError = chunk.error.message || JSON.stringify(chunk.error);
          }
          const deltaContent =
            chunk.choices?.[0]?.delta?.content ??
            chunk.choices?.[0]?.message?.content ??
            chunk.choices?.[0]?.text ??
            "";
          if (deltaContent) {
            accumulatedContent += deltaContent;
          }
        } catch {
          // Ignore individual chunk JSON parsing errors
        }
      }
    }

    if (capturedError && !accumulatedContent) {
      return { content: "", error: capturedError };
    }

    return { content: accumulatedContent.trim() };
  }

  // Case 2: Standard JSON response
  try {
    const data = JSON.parse(trimmed);
    if (data.error) {
      return { content: "", error: data.error.message || JSON.stringify(data.error) };
    }
    const content =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.delta?.content ??
      data.choices?.[0]?.text ??
      "";
    return { content: typeof content === "string" ? content.trim() : JSON.stringify(content) };
  } catch {
    // If not standard JSON, return raw text
    return { content: trimmed };
  }
}

async function callNineRouter(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 30000
): Promise<string> {
  const endpoint = normalizeChatEndpoint(baseUrl || "http://192.168.88.83:20128/v1");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream, text/plain, */*",
  };

  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "ag/gemini-3.7-flash-medium",
        messages,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text().catch(() => "");

    if (!response.ok) {
      throw new Error(`9Router Error (${response.status}): ${responseText || response.statusText}`);
    }

    const { content, error } = parseOpenAiCompatibleResponse(responseText);

    if (error) {
      throw new Error(`9Router Error: ${error}`);
    }

    if (!content) {
      throw new Error(`9Router (${model}) returned an empty response. Raw output: ${responseText.slice(0, 100)}`);
    }

    return content;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`9Router connection timed out after ${timeoutMs / 1000}s. Check endpoint: ${endpoint}`);
    }
    throw err;
  }
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  fallbackModel: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 45000
): Promise<{ content: string; modelUsed: string }> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API Key is missing. Please configure OpenRouter API Key in Settings.");
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL || "https://github.com/willfebrian/cr-management-system";
  const appTitle = process.env.OPENROUTER_APP_NAME || "CR Management System";
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";

  const executeCall = async (modelToUse: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "HTTP-Referer": siteUrl,
          "X-Title": appTitle,
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream, text/plain, */*",
        },
        body: JSON.stringify({
          model: modelToUse,
          messages,
          temperature: 0.3,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => "");

      if (!response.ok) {
        throw new Error(`OpenRouter API Error (${response.status}): ${responseText || response.statusText}`);
      }

      const { content, error } = parseOpenAiCompatibleResponse(responseText);

      if (error) {
        throw new Error(`OpenRouter Error: ${error}`);
      }

      if (!content) {
        throw new Error(`OpenRouter (${modelToUse}) returned an empty response. Raw: ${responseText.slice(0, 100)}`);
      }

      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`OpenRouter connection timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    }
  };

  const primaryModel = model || "openrouter/auto";
  try {
    const content = await executeCall(primaryModel);
    return { content, modelUsed: primaryModel };
  } catch (primaryErr: any) {
    const errMessage = primaryErr?.message || "";
    if (
      fallbackModel &&
      fallbackModel !== primaryModel &&
      (errMessage.includes("402") ||
        errMessage.includes("429") ||
        errMessage.toLowerCase().includes("credit") ||
        errMessage.toLowerCase().includes("rate limit") ||
        errMessage.toLowerCase().includes("quota"))
    ) {
      console.warn(`[AI Service] OpenRouter primary model (${primaryModel}) failed with credit/rate limit. Retrying with fallback model (${fallbackModel})...`);
      const content = await executeCall(fallbackModel);
      return { content, modelUsed: fallbackModel };
    }
    throw primaryErr;
  }
}

export async function testAiProviderConnection(params: TestProviderParams): Promise<{ ok: boolean; message: string; output?: string }> {
  const testMessages = [
    { role: "system", content: "You are a test assistant. Respond strictly with 'OK'." },
    { role: "user", content: "Test ping" },
  ];

  if (params.provider === "9router") {
    const baseUrl = params.baseUrl || "http://192.168.88.83:20128/v1";
    const model = params.model || "ag/gemini-3.7-flash-medium";
    const apiKey = params.apiKey || "";

    const raw = await callNineRouter(baseUrl, model, apiKey, testMessages, 10000);
    return {
      ok: true,
      message: `Successfully connected to 9Router (${model})!`,
      output: raw.slice(0, 100),
    };
  } else if (params.provider === "openrouter") {
    const apiKey = params.apiKey || "";
    const model = params.model || "openrouter/auto";
    const fallbackModel = "openrouter/free";

    const { content, modelUsed } = await callOpenRouter(apiKey, model, fallbackModel, testMessages, 15000);
    return {
      ok: true,
      message: `Successfully connected to OpenRouter (${modelUsed})!`,
      output: content.slice(0, 100),
    };
  }

  throw new Error(`Unsupported provider: ${params.provider}`);
}

export async function generateAnalysisFromEmail(
  emailContext: string,
  emailSubject?: string,
  issueName?: string
): Promise<AnalysisGenerationResult> {
  if (!emailContext || !emailContext.trim()) {
    throw new Error("Email context is empty. Please fetch email content first.");
  }

  // Retrieve all relevant settings from DB
  const { rows } = await pool.query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (
      'ai_primary_provider',
      'ai_fallback_provider',
      'nine_router_enabled',
      'nine_router_base_url',
      'nine_router_model',
      'nine_router_api_key',
      'openrouter_enabled',
      'openrouter_api_key',
      'openrouter_model',
      'openrouter_fallback_model',
      'ai_instruction_glpi',
      'ai_instruction_email',
      'ai_instruction_issue_name',
      'ai_instruction_problem',
      'ai_instruction_impact'
    )`
  );

  const settingsMap = rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {} as Record<string, string>);

  const primaryProvider = settingsMap.ai_primary_provider || "9router";
  const fallbackProvider = settingsMap.ai_fallback_provider || "openrouter";

  const nineRouterEnabled = settingsMap.nine_router_enabled !== "false";
  const nineRouterBaseUrl = settingsMap.nine_router_base_url || process.env.NINEROUTER_BASE_URL || "http://192.168.88.83:20128/v1";
  const nineRouterModel = settingsMap.nine_router_model || process.env.NINEROUTER_MODEL || "ag/gemini-3.7-flash-medium";
  const nineRouterApiKey = settingsMap.nine_router_api_key || process.env.NINEROUTER_API_KEY || "";

  const openrouterEnabled = settingsMap.openrouter_enabled !== "false";
  const openrouterApiKey = settingsMap.openrouter_api_key || process.env.OPENROUTER_API_KEY || "";
  const openrouterModel = settingsMap.openrouter_model || process.env.OPENROUTER_MODEL || "openrouter/auto";
  const openrouterFallbackModel = settingsMap.openrouter_fallback_model || "openrouter/free";

  const glpiInstructions = settingsMap.ai_instruction_glpi || "";
  const issueNameInstructions = settingsMap.ai_instruction_issue_name || "";
  const problemInstructions = settingsMap.ai_instruction_problem || "";
  const impactInstructions = settingsMap.ai_instruction_impact || "";
  const generalInstructions = settingsMap.ai_instruction_email || "";

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

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let rawContent = "";
  let providerUsed = "";
  const errorLogs: string[] = [];

  const tryProvider = async (provider: string): Promise<boolean> => {
    if (provider === "9router") {
      if (!nineRouterEnabled) {
        errorLogs.push("9Router is disabled in settings.");
        return false;
      }
      try {
        console.info(`[AI Service] Attempting generation with 9Router (${nineRouterModel}) at ${nineRouterBaseUrl}...`);
        rawContent = await callNineRouter(nineRouterBaseUrl, nineRouterModel, nineRouterApiKey, messages);
        providerUsed = `9Router (${nineRouterModel})`;
        return true;
      } catch (err: any) {
        const msg = `9Router error: ${err.message}`;
        console.warn(`[AI Service] ${msg}`);
        errorLogs.push(msg);
        return false;
      }
    }

    if (provider === "openrouter") {
      if (!openrouterEnabled) {
        errorLogs.push("OpenRouter is disabled in settings.");
        return false;
      }
      if (!openrouterApiKey) {
        errorLogs.push("OpenRouter API key is not configured.");
        return false;
      }
      try {
        console.info(`[AI Service] Attempting generation with OpenRouter (${openrouterModel})...`);
        const result = await callOpenRouter(openrouterApiKey, openrouterModel, openrouterFallbackModel, messages);
        rawContent = result.content;
        providerUsed = `OpenRouter (${result.modelUsed})`;
        return true;
      } catch (err: any) {
        const msg = `OpenRouter error: ${err.message}`;
        console.warn(`[AI Service] ${msg}`);
        errorLogs.push(msg);
        return false;
      }
    }

    return false;
  };

  // Step 1: Try Primary Provider
  let success = await tryProvider(primaryProvider);

  // Step 2: Try Fallback Provider if Primary failed and fallback is distinct
  if (!success && fallbackProvider && fallbackProvider !== "none" && fallbackProvider !== primaryProvider) {
    console.warn(`[AI Service] Primary provider '${primaryProvider}' failed. Engaging automatic fallback to '${fallbackProvider}'...`);
    success = await tryProvider(fallbackProvider);
  }

  if (!success || !rawContent) {
    const fullError = errorLogs.join(" | ");
    throw new Error(`AI Generation failed across all configured providers. Details: ${fullError || "No provider available or configured."}`);
  }

  try {
    // Strip markdown JSON wrapping if present
    const cleanedJson = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleanedJson);

    const extractedIssueName = parsed.issueName || parsed.issue_name || "";
    const requestDescription = parsed.requestDescription || parsed.request_description || "";
    const problemAnalysis = parsed.problemAnalysis || parsed.problem_analysis || "";
    const impactAnalysis = parsed.impactAnalysis || parsed.impact_analysis || "";
    const participants = typeof parsed.participants === "object" && parsed.participants ? parsed.participants : undefined;
    const timeline = typeof parsed.timeline === "object" && parsed.timeline ? parsed.timeline : undefined;

    if (!problemAnalysis && !impactAnalysis && !extractedIssueName && !requestDescription) {
      throw new Error(`AI response JSON did not contain expected fields. Raw output: ${rawContent.slice(0, 150)}...`);
    }

    return {
      issueName: extractedIssueName,
      requestDescription,
      problemAnalysis: problemAnalysis || rawContent,
      impactAnalysis,
      participants,
      timeline,
      providerUsed,
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
        impactAnalysis: "",
        providerUsed,
      };
    }
    throw new Error(`Failed to parse AI response from ${providerUsed}: ${err.message}. Raw output: ${rawContent.slice(0, 100)}...`);
  }
}
