'use strict';

const cerebras = require('../lib/cerebras');
const { getScenario } = require('../lib/scenarios');

const SYSTEM = `You are AeroSwarm Analyst — tactical threat assessment AI.
You receive detection reports and produce razor-sharp situation assessments for rescue commanders.
Write 3 tight sentences maximum. Be clinical and action-oriented.
Focus on: severity, immediate life risk, complicating factors, what responders must know.
No bullet points. No headers. Just the essential assessment a commander reads in under 10 seconds.`;

async function assess(watcherResult, scenarioName = 'aerial') {
  const scenario = getScenario(scenarioName);

  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Watcher detection:
Kind: ${watcherResult.kind}
Subjects: ${watcherResult.subjects}
Confidence: ${(watcherResult.confidence * 100).toFixed(0)}%
Immediate threat: ${watcherResult.immediate_threat}
Description: ${watcherResult.description}

Scene context: ${scenario.context}

Assess: severity level, life risk timeline, key complications, what responding units must prioritize on approach.`
    }
  ];

  const t0 = Date.now();
  let result;

  try {
    result = await cerebras.chat(messages, {
      reasoning_effort: 'medium',
      max_tokens: 200
    });
  } catch (err) {
    console.error('Analyst API error:', err.message);
    const fallbacks = {
      aerial: 'Subject is in immediate life danger — cold water exposure accelerates incapacitation within minutes. Rising tide compounds extraction difficulty; water rescue unit must approach from the seaward side to avoid surge. Condition is critical — every 30 seconds without rescue decreases survival probability.',
      traffic: 'Collision severity is high with confirmed occupant entrapment and active fuel leak creating fire risk. Secondary collision hazard from blocked intersection requires police to establish perimeter before medics advance. Responders should approach from upwind on the western access route.'
    };
    return {
      assessment: fallbacks[scenarioName] || fallbacks.aerial,
      _duration: Date.now() - t0,
      _error: err.message
    };
  }

  return {
    assessment: result.content,
    _duration: result.duration_ms
  };
}

module.exports = { assess };
