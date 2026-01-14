/**
 * Lightweight client for Anthropic Claude HTTP API.
 * This is intentionally small and only used for simple chat calls from the client.
 */
export interface ClaudeOptions {
  model?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaudeChat(prompt: string, apiKey: string, opts: ClaudeOptions = {}) {
  if (!apiKey || apiKey.trim() === "") throw new Error("Claude API key missing");

  const body = {
    model: opts.model || "claude-3-opus",
    prompt,
    max_tokens_to_sample: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.0,
  } as any;

  const res = await fetch("https://api.anthropic.com/v1/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  // Anthropic returns `completion` (text) and `model` etc depending on API.
  return data;
}

export default callClaudeChat;
