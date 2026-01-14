import fetch from 'node-fetch';

export interface DeepSeekRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
}

export async function callDeepSeek(req: DeepSeekRequest) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const e: any = new Error('DeepSeek API key not configured on server');
    e.status = 500;
    throw e;
  }

  const base = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
  const resp = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: req.model || 'deepseek-chat', messages: req.messages }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err: any = new Error(`DeepSeek provider error: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  // Normalize response: return text content if present
  const content = data?.choices?.[0]?.message?.content ?? data;
  return { content, raw: data };
}

export default callDeepSeek;
