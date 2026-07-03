import { agentRouting } from "../../config/agent-routing.mjs";

export function routeQuestion(question, routing = agentRouting) {
  const normalized = normalize(question);
  const routeScores = routing.routes.map((route) => {
    const matchedKeywords = route.keywords.filter((keyword) => matchesKeyword(normalized, keyword));
    return {
      intent: route.intent,
      agent: route.agent,
      score: matchedKeywords.length,
      matchedKeywords
    };
  }).filter((route) => route.score > 0);

  routeScores.sort((left, right) => right.score - left.score || left.intent.localeCompare(right.intent));

  const multiAgentMatches = routing.multiAgentPatterns.map((pattern) => {
    const matchedKeywords = pattern.keywords.filter((keyword) => matchesKeyword(normalized, keyword));
    return {
      intent: pattern.intent,
      agents: pattern.agents,
      minMatches: pattern.minMatches || 1,
      score: matchedKeywords.length,
      matchedKeywords
    };
  }).filter((pattern) => pattern.score >= (pattern.minMatches || 1));

  multiAgentMatches.sort((left, right) => right.score - left.score || left.intent.localeCompare(right.intent));

  const primaryAgent = routeScores[0]?.agent || routing.defaultAgent;
  const supportingAgents = unique([
    ...(multiAgentMatches[0]?.agents || []),
    ...routeScores.slice(1, 4).map((route) => route.agent)
  ]).filter((agent) => agent !== primaryAgent);

  return {
    primaryAgent,
    supportingAgents,
    matchedRoutes: routeScores,
    matchedMultiAgentPatterns: multiAgentMatches,
    needsClarification: routeScores.length === 0,
    safetyMode: "READ_ONLY"
  };
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesKeyword(text, keyword) {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;
  if (/^[a-z0-9]{2,10}$/.test(normalizedKeyword)) {
    return new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`).test(text);
  }
  return text.includes(normalizedKeyword);
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
