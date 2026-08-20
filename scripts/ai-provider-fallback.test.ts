import test from "node:test";
import assert from "node:assert/strict";

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
    return { content: trimmed };
  }
}

function cleanAiJson(rawContent: string): any {
  const cleanedJson = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  return JSON.parse(cleanedJson);
}

test("normalizes 9Router base URL to chat completions endpoint", () => {
  assert.equal(
    normalizeChatEndpoint("http://192.168.88.83:20128/v1"),
    "http://192.168.88.83:20128/v1/chat/completions"
  );
  assert.equal(
    normalizeChatEndpoint("http://192.168.88.83:20128/v1/"),
    "http://192.168.88.83:20128/v1/chat/completions"
  );
  assert.equal(
    normalizeChatEndpoint("http://localhost:8080/v1/chat/completions"),
    "http://localhost:8080/v1/chat/completions"
  );
});

test("correctly parses SSE stream responses from 9Router proxies", () => {
  const sseResponse = `data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"OK"}}]}
data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" - Connected"}}]}
data: [DONE]`;

  const parsed = parseOpenAiCompatibleResponse(sseResponse);
  assert.equal(parsed.content, "OK - Connected");
  assert.equal(parsed.error, undefined);
});

test("correctly parses standard JSON response", () => {
  const jsonResponse = JSON.stringify({
    id: "chatcmpl-2",
    choices: [{ message: { content: "OK" } }]
  });

  const parsed = parseOpenAiCompatibleResponse(jsonResponse);
  assert.equal(parsed.content, "OK");
});

test("cleans markdown json wrap from AI responses", () => {
  const markdownWrapped = "```json\n{\n  \"issueName\": \"Test Issue\",\n  \"problemAnalysis\": \"Sample problem\"\n}\n```";
  const parsed = cleanAiJson(markdownWrapped);
  assert.equal(parsed.issueName, "Test Issue");
  assert.equal(parsed.problemAnalysis, "Sample problem");
});

test("verifies provider fallback precedence logic", async () => {
  const callLogs: string[] = [];

  const fakeCallProvider = async (provider: string): Promise<string> => {
    callLogs.push(provider);
    if (provider === "9router") {
      throw new Error("Connection refused: 9Router unreachable");
    }
    if (provider === "openrouter") {
      return JSON.stringify({ issueName: "Fallback success", problemAnalysis: "OK" });
    }
    throw new Error("Unknown provider");
  };

  const primary = "9router";
  const fallback = "openrouter";
  let finalResult = "";

  try {
    finalResult = await fakeCallProvider(primary);
  } catch {
    if (fallback && fallback !== primary) {
      finalResult = await fakeCallProvider(fallback);
    }
  }

  assert.deepEqual(callLogs, ["9router", "openrouter"]);
  assert.match(finalResult, /Fallback success/);
});
