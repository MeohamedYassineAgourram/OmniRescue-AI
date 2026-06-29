'use strict';

const CEREBRAS_BASE = 'https://api.cerebras.ai/v1';

async function _request(endpoint, body) {
  const res = await fetch(`${CEREBRAS_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cerebras ${res.status}: ${text}`);
  }

  return res;
}

function _buildBody(messages, opts) {
  const body = {
    model: 'gemma-4-31b',
    messages,
    reasoning_effort: opts.reasoning_effort || 'none',
    max_completion_tokens: opts.max_tokens || 512
  };

  if (opts.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: opts.schemaName || 'response',
        strict: true,
        schema: opts.schema
      }
    };
  }

  if (opts.stream) body.stream = true;
  return body;
}

async function chatWithImage(base64, mimeType = 'image/jpeg', systemPrompt, userText, opts = {}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: 'text', text: userText }
      ]
    }
  ];

  const t0 = Date.now();
  const res = await _request('/chat/completions', _buildBody(messages, opts));
  const data = await res.json();

  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    time_info: data.time_info || {},
    duration_ms: Date.now() - t0
  };
}

async function chat(messages, opts = {}) {
  const t0 = Date.now();
  const res = await _request('/chat/completions', _buildBody(messages, opts));
  const data = await res.json();

  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    time_info: data.time_info || {},
    duration_ms: Date.now() - t0
  };
}

async function streamChatWithImage(base64, mimeType = 'image/jpeg', systemPrompt, userText, onToken, opts = {}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: 'text', text: userText }
      ]
    }
  ];

  return streamChat(messages, onToken, opts);
}

async function streamChat(messages, onToken, opts = {}) {
  const t0 = Date.now();
  const res = await _request('/chat/completions', _buildBody(messages, { ...opts, stream: true }));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ttft = null;
  let full = '';
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (chunk === '[DONE]') continue;

      try {
        const parsed = JSON.parse(chunk);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          if (ttft === null) ttft = Date.now() - t0;
          full += delta;
          tokenCount++;
          if (onToken) onToken(delta, ttft);
        }
      } catch {}
    }
  }

  const total = Date.now() - t0;
  return {
    content: full,
    ttft_ms: ttft,
    total_ms: total,
    tps: total > 0 ? Math.round((tokenCount / total) * 1000) : 0,
    tokens: tokenCount
  };
}

module.exports = { chatWithImage, chat, streamChat, streamChatWithImage };
