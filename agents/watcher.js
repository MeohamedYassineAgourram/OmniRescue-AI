'use strict';

const cerebras = require('../lib/cerebras');
const { getScenario } = require('../lib/scenarios');

// Keep system prompt lean — json_schema is NOT used for image calls (API conflict)
const SYSTEM = `You are AeroSwarm Watcher, an emergency-detection AI for Paris surveillance cameras.
Your job: analyze a frame and return a single JSON object — nothing else. No markdown, no code fences, no explanation before or after the JSON.`;

async function analyze(base64, scenarioName = 'paris') {
  const scenario = getScenario(scenarioName);

  const userText = `Scene context: ${scenario.context}

Look at this surveillance frame. Decide if an emergency requiring rescue is visible.

CLASSIFICATION — choose exactly one "kind":
  "person_in_distress"  → person in water, drowning, capsized boat, swimmer struggling, waving from water
  "vehicle_accident"    → car crash, road collision, overturned vehicle, pedestrian struck by a vehicle
  "fire"                → visible flames or heavy black/grey smoke from a burning vehicle or building
  "flooding"            → floodwater on streets, people stranded by rising water
  "multiple_casualties" → several injured people on the ground, mass casualty scene
  "none"                → scene is normal, no emergency visible

Return ONLY this JSON (replace values — keep exact key names):
{"incident_detected":BOOL,"kind":"KIND","subjects":INT,"confidence":FLOAT,"immediate_threat":BOOL,"description":"TEXT","bbox":[X1,Y1,X2,Y2]}

Rules:
- incident_detected: true if any emergency is clearly visible
- confidence: 0.0–1.0 (use ≥ 0.80 if you are certain)
- bbox: [x_min%, y_min%, x_max%, y_max%] as 0–100 percentages of the frame
- If scene is safe: {"incident_detected":false,"kind":"none","subjects":0,"confidence":0.95,"immediate_threat":false,"description":"No emergency visible","bbox":[0,0,0,0]}`;

  const t0 = Date.now();

  let result;
  try {
    result = await cerebras.chatWithImage(
      base64,
      'image/jpeg',
      SYSTEM,
      userText,
      {
        reasoning_effort: 'none',
        max_tokens: 220
        // NO schema option — json_schema + multimodal image = API conflict on Cerebras
      }
    );
  } catch (err) {
    console.error('[Watcher] API call failed:', err.message);
    return {
      incident_detected: false,
      kind: 'none',
      subjects: 0,
      confidence: 0,
      immediate_threat: false,
      description: `Watcher API error: ${err.message}`,
      bbox: [0, 0, 0, 0],
      _duration: Date.now() - t0,
      _error: err.message
    };
  }

  const raw = result.content || '';
  console.log('[Watcher] raw response:', raw.slice(0, 400));

  const parsed = extractJSON(raw);

  if (!parsed || typeof parsed.incident_detected !== 'boolean') {
    console.warn('[Watcher] Could not parse JSON from response:', raw.slice(0, 300));
    return {
      incident_detected: false,
      kind: 'none',
      subjects: 0,
      confidence: 0,
      immediate_threat: false,
      description: 'Detection parse failed — raw: ' + raw.slice(0, 120),
      bbox: [0, 0, 0, 0],
      _duration: result.duration_ms,
      _parse_error: true
    };
  }

  return {
    ...parsed,
    _duration: result.duration_ms,
    _ttft: result.time_info?.time_to_first_token
  };
}

/**
 * Robustly extract the first valid JSON object from LLM output.
 * Handles: raw JSON, markdown code fences, leading prose before the {.
 */
function extractJSON(text) {
  if (!text) return null;

  // 1. Direct parse (ideal case)
  try { return JSON.parse(text.trim()); } catch {}

  // 2. Strip ```json ... ``` or ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }

  // 3. Grab first { ... } block (handles leading prose)
  const braceMatch = text.match(/\{[\s\S]*?\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }

  // 4. Grab everything from first { to last }
  const from = text.indexOf('{');
  const to   = text.lastIndexOf('}');
  if (from !== -1 && to > from) {
    try { return JSON.parse(text.slice(from, to + 1)); } catch {}
  }

  return null;
}

module.exports = { analyze };
