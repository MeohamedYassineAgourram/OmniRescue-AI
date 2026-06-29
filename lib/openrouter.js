'use strict';

const BASE = 'https://openrouter.ai/api/v1';
// Same model as Cerebras (Gemma 4 31B) but running on GPU via OpenRouter — true hardware comparison
const GPU_MODEL = 'google/gemma-4-31b-it:free';

async function streamWithImage(base64, mimeType = 'image/jpeg', systemPrompt, userText, onToken) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const body = {
    model: GPU_MODEL,
    stream: true,
    max_tokens: 350,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: userText }
        ]
      }
    ]
  };

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://omnirescue-ai.com',
      'X-Title': 'OmniRescue-AI'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `OpenRouter ${res.status}`;
    try { msg = JSON.parse(text).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf  = '';
  let full = '';
  let ttft = null;
  let tokCount = 0;
  const t0 = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (chunk === '[DONE]') break;
      try {
        const parsed = JSON.parse(chunk);
        const token  = parsed.choices?.[0]?.delta?.content;
        if (token) {
          if (ttft === null) ttft = Date.now() - t0;
          full += token;
          tokCount++;
          if (onToken) onToken(token, ttft);
        }
      } catch {}
    }
  }

  const total = Date.now() - t0;
  return {
    content: full,
    ttft_ms: ttft ?? total,
    total_ms: total,
    tps: total > 0 ? Math.round((tokCount / total) * 1000) : 0,
    model: GPU_MODEL
  };
}

module.exports = { streamWithImage, GPU_MODEL };
