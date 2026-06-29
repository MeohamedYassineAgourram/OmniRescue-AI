'use strict';

const cerebras = require('../lib/cerebras');
const { getScenario } = require('../lib/scenarios');

const SYSTEM = `You are AeroSwarm Watcher, an emergency-detection AI for Paris surveillance cameras.
Analyze the frame and return a single JSON object — nothing else. No markdown, no code fences, no prose before or after.`;

async function analyze(base64, scenarioName = 'paris') {
  const scenario = getScenario(scenarioName);

  const userText = `Scene context: ${scenario.context}

Analyze this surveillance frame. Detect any emergency requiring immediate rescue.

── INCIDENT KIND — choose exactly one ──────────────────────────────────────
  "person_in_distress"   person in water, drowning, capsized boat, swimmer struggling
  "vehicle_accident"     car crash, road collision, overturned vehicle, pedestrian struck
  "fire"                 visible flames or heavy smoke from burning vehicle/building
  "flooding"             floodwater on streets, vehicles/people stranded by rising water
  "multiple_casualties"  several injured people on ground, mass casualty scene
  "none"                 scene is normal, no emergency

── LOCATION HINT — pick the ONE location that best matches visible landmarks ──
  seine_notre_dame   (Seine river near Notre-Dame Cathedral)
  bir_hakeim         (Pont de Bir-Hakeim bridge, Seine 15e/16e)
  eiffel_tower       (Seine near Eiffel Tower)
  arc_de_triomphe    (Place Charles-de-Gaulle roundabout)
  champs_elysees     (Champs-Élysées boulevard)
  louvre             (Louvre museum, Pont Neuf, Île de la Cité area)
  galeries_lafayette (Grands Boulevards, Galeries Lafayette, 9e)
  gare_du_nord       (Gare du Nord, 10e)
  republique         (Place de la République, 11e)
  bastille           (Place de la Bastille, 12e)
  montmartre         (Montmartre, Sacré-Cœur, 18e)
  boulogne_forest    (Bois de Boulogne forested park, west Paris)
  vincennes_forest   (Bois de Vincennes forested park, east Paris)
  versailles         (Versailles, rural southwest)
  seine_bercy        (Seine near Bercy, 12e/13e)
  paris_center       (generic central Paris — use only as fallback)

── TERRAIN — choose ONE ────────────────────────────────────────────────────
  "water"    (river, canal, lake, flood)
  "road"     (street, intersection, highway, urban)
  "forest"   (park, woodland, rural, remote area)
  "building" (inside or directly on a building, rooftop)

── OUTPUT — return ONLY this JSON, no other text ────────────────────────────
{"incident_detected":BOOL,"kind":"KIND","subjects":INT,"confidence":FLOAT,"immediate_threat":BOOL,"description":"ONE concise sentence","bbox":[X1,Y1,X2,Y2],"location_hint":"HINT","terrain":"TERRAIN"}

bbox = [x_min%, y_min%, x_max%, y_max%] as integers 0–100.
incident_detected: true if any emergency is clearly visible.
confidence: 0.0–1.0 (use ≥ 0.80 when certain).
If scene is safe: {"incident_detected":false,"kind":"none","subjects":0,"confidence":0.95,"immediate_threat":false,"description":"No emergency visible","bbox":[0,0,0,0],"location_hint":"paris_center","terrain":"road"}`;

  const t0 = Date.now();
  let result;
  try {
    result = await cerebras.chatWithImage(
      base64, 'image/jpeg', SYSTEM, userText,
      { reasoning_effort: 'none', max_tokens: 260 }
    );
  } catch (err) {
    console.error('[Watcher] API error:', err.message);
    return {
      incident_detected: false, kind: 'none', subjects: 0, confidence: 0,
      immediate_threat: false, description: `API error: ${err.message}`,
      bbox: [0,0,0,0], location_hint: 'paris_center', terrain: 'road',
      _duration: Date.now() - t0, _error: err.message
    };
  }

  const raw = result.content || '';
  console.log('[Watcher] raw:', raw.slice(0, 500));

  const parsed = extractJSON(raw);
  if (!parsed || typeof parsed.incident_detected !== 'boolean') {
    console.warn('[Watcher] parse failed, raw:', raw.slice(0, 200));
    return {
      incident_detected: false, kind: 'none', subjects: 0, confidence: 0,
      immediate_threat: false, description: 'Parse failed: ' + raw.slice(0, 80),
      bbox: [0,0,0,0], location_hint: 'paris_center', terrain: 'road',
      _duration: result.duration_ms, _parse_error: true
    };
  }

  // Normalize optional fields
  if (!parsed.location_hint) parsed.location_hint = 'paris_center';
  if (!parsed.terrain)        parsed.terrain        = 'road';

  return { ...parsed, _duration: result.duration_ms, _ttft: result.time_info?.time_to_first_token };
}

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const brace = text.match(/\{[\s\S]*?\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch {} }
  const from = text.indexOf('{'), to = text.lastIndexOf('}');
  if (from !== -1 && to > from) { try { return JSON.parse(text.slice(from, to + 1)); } catch {} }
  return null;
}

module.exports = { analyze };
