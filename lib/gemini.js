'use strict';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Configurable via GEMINI_MODEL env var; defaults to gemini-2.0-flash
function getModel() {
  return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

async function _doRequest(key, model, body) {
  const res = await fetch(
    `${GEMINI_BASE}/${model}:streamGenerateContent?key=${key}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  return res;
}

function _parseError(status, text) {
  let message = `Gemini API error (HTTP ${status})`;
  try {
    const errJson = JSON.parse(text);
    const detail = errJson.error?.message || errJson.message;
    if (detail) message = detail;
  } catch {}
  if (status === 429) message = `Gemini rate limit — wait a moment and try again`;
  if (status === 403) message = `Gemini API key unauthorized — check GEMINI_API_KEY`;
  if (status === 404) message = `Gemini model "${getModel()}" not found — set GEMINI_MODEL in .env`;
  return message;
}

async function streamWithImage(base64, mimeType = 'image/jpeg', systemPrompt, userText, onToken) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = getModel();

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: userText }
      ]
    }],
    generationConfig: { maxOutputTokens: 512, temperature: 0.2 }
  };

  const t0 = Date.now();
  let res = await _doRequest(key, model, body);

  // Retry once on 429 after 2s
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await _doRequest(key, model, body);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(_parseError(res.status, text));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ttft = null;
  let full = '';
  let charCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      try {
        const parsed = JSON.parse(chunk);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          if (ttft === null) ttft = Date.now() - t0;
          full += text;
          charCount += text.length;
          if (onToken) onToken(text, ttft);
        }
      } catch {}
    }
  }

  const total = Date.now() - t0;
  return {
    content: full,
    ttft_ms: ttft,
    total_ms: total,
    tps: total > 0 ? Math.round((charCount / 4 / total) * 1000) : 0,
    model
  };
}

module.exports = { streamWithImage, getModel };
