'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

const watcher  = require('./agents/watcher');
const analyst  = require('./agents/analyst');
const reporter = require('./agents/reporter');
const dispatch = require('./agents/dispatch');
const cerebras = require('./lib/cerebras');
const gemini   = require('./lib/gemini');
const { getScenario } = require('./lib/scenarios');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function emit(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

function ndjsonHeaders(res) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

// ─── Full agent pipeline ──────────────────────────────────────────────────────
app.post('/api/respond', async (req, res) => {
  ndjsonHeaders(res);

  const { frame, scenario: scenarioName = 'aerial' } = req.body;
  if (!frame) {
    emit(res, { type: 'error', message: 'No frame provided' });
    return res.end();
  }

  const startTime = Date.now();

  try {
    // 1. Watcher — multimodal detection
    emit(res, { type: 'agent_start', agent: 'watcher', ts: Date.now() });
    const watcherResult = await watcher.analyze(frame, scenarioName);
    emit(res, { type: 'agent_complete', agent: 'watcher', result: watcherResult, duration_ms: watcherResult._duration });

    if (!watcherResult.incident_detected || watcherResult.confidence < 0.30) {
      emit(res, { type: 'no_incident', confidence: watcherResult.confidence, description: watcherResult.description });
      return res.end();
    }

    // 2. Analyst — threat assessment
    emit(res, { type: 'agent_start', agent: 'analyst', ts: Date.now() });
    const analystResult = await analyst.assess(watcherResult, scenarioName);
    emit(res, { type: 'agent_complete', agent: 'analyst', result: analystResult, duration_ms: analystResult._duration });

    // 3. Reporter — streaming incident brief
    emit(res, { type: 'agent_start', agent: 'reporter', ts: Date.now() });
    const reporterResult = await reporter.generate(
      watcherResult,
      analystResult,
      scenarioName,
      (token) => emit(res, { type: 'reporter_token', token })
    );
    emit(res, {
      type: 'agent_complete',
      agent: 'reporter',
      result: reporterResult,
      duration_ms: reporterResult._duration,
      ttft_ms: reporterResult._ttft,
      tps: reporterResult._tps
    });

    // 4. Dispatch — deterministic multi-unit (kind + terrain + AI-detected location)
    emit(res, { type: 'agent_start', agent: 'dispatch', ts: Date.now() });
    const dispatchResult = dispatch.findDispatch(
      reporterResult,
      scenarioName,
      watcherResult.kind,
      watcherResult.terrain       || 'road',
      watcherResult.location_hint || 'paris_center'
    );
    emit(res, { type: 'dispatch', result: dispatchResult, duration_ms: 1 });
    emit(res, { type: 'agent_complete', agent: 'dispatch', result: dispatchResult, duration_ms: 1 });

    emit(res, { type: 'complete', total_ms: Date.now() - startTime });
  } catch (err) {
    console.error('Pipeline error:', err);
    emit(res, { type: 'error', message: err.message });
  }

  res.end();
});

// ─── Speed race: Cerebras vs GPU baseline ─────────────────────────────────────
app.post('/api/race', async (req, res) => {
  ndjsonHeaders(res);

  const { frame, scenario: scenarioName = 'aerial' } = req.body;
  if (!frame) {
    emit(res, { type: 'error', message: 'No frame provided' });
    return res.end();
  }

  const scenario = getScenario(scenarioName);
  const RACE_SYSTEM = `You are an emergency surveillance AI. Analyze this camera frame for any emergency requiring rescue. Report what you detect: type of incident, number of subjects, severity, and immediate actions needed. Be thorough and specific.`;
  const RACE_USER = `Scene context: ${scenario.context}\n\nAnalyze this frame. Report the incident type, severity, visible subjects, hazards, and what rescue units should do. Be detailed.`;

  let cerebrasComplete = false;
  let geminiComplete = false;

  const tryEnd = () => {
    if (cerebrasComplete && geminiComplete) {
      emit(res, { type: 'race_complete' });
      res.end();
    }
  };

  // Cerebras stream
  const cerebrasRace = cerebras.streamChatWithImage(
    frame, 'image/jpeg',
    RACE_SYSTEM, RACE_USER,
    (token, ttft) => emit(res, { type: 'cerebras_token', token, ttft_ms: ttft }),
    { reasoning_effort: 'none', max_tokens: 350 }
  ).then(result => {
    emit(res, { type: 'cerebras_complete', content: result.content, ttft_ms: result.ttft_ms, total_ms: result.total_ms, tps: result.tps });
  }).catch(err => {
    console.error('Cerebras race error:', err.message);
    emit(res, { type: 'cerebras_error', message: err.message });
  }).finally(() => {
    cerebrasComplete = true;
    tryEnd();
  });

  // Gemini stream (GPU baseline)
  const geminiRace = (async () => {
    if (!process.env.GEMINI_API_KEY) {
      emit(res, { type: 'gemini_token', token: '[Add GEMINI_API_KEY to .env to enable live GPU baseline comparison]', ttft_ms: 0 });
      emit(res, { type: 'gemini_complete', content: 'GPU baseline not configured', ttft_ms: null, total_ms: null, tps: null, simulated: true });
      geminiComplete = true;
      tryEnd();
      return;
    }

    try {
      const result = await gemini.streamWithImage(
        frame, 'image/jpeg',
        RACE_SYSTEM, RACE_USER,
        (token, ttft) => emit(res, { type: 'gemini_token', token, ttft_ms: ttft })
      );
      emit(res, { type: 'gemini_complete', content: result.content, ttft_ms: result.ttft_ms, total_ms: result.total_ms, tps: result.tps });
    } catch (err) {
      console.error('Gemini race error:', err.message);
      emit(res, { type: 'gemini_error', message: err.message });
    }

    geminiComplete = true;
    tryEnd();
  })();

  await Promise.allSettled([cerebrasRace, geminiRace]);
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: 'gemma-4-31b',
    cerebras: !!process.env.CEREBRAS_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    geminiModel: require('./lib/gemini').getModel()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚁 AeroSwarm AI running → http://localhost:${PORT}\n`);
  console.log(`  Cerebras key : ${process.env.CEREBRAS_API_KEY ? '✓ set' : '✗ MISSING — add to .env'}`);
  console.log(`  Gemini key   : ${process.env.GEMINI_API_KEY  ? '✓ set' : '○ not set (race baseline shows placeholder)'}`);
  console.log('');
});
