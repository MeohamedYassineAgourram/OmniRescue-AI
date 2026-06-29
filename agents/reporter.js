'use strict';

const cerebras = require('../lib/cerebras');
const { getScenario } = require('../lib/scenarios');

const SYSTEM = `You are AeroSwarm Reporter — the incident documentation AI.
You generate the responder brief that is transmitted the moment a rescue unit is dispatched.
Responders read this brief en route. It must be complete, accurate, and immediately actionable.
This is the information that lets responders know exactly what they are walking into BEFORE they arrive.
Fill every field with specific, realistic, useful information. Make it detailed — this is what saves lives.`;

const SCHEMA = {
  type: 'object',
  properties: {
    alert_level: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MODERATE'] },
    incident_type: { type: 'string' },
    summary: { type: 'string' },
    people: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0 },
        apparent_condition: { type: 'string' },
        visible_injuries: { type: 'string' }
      },
      required: ['count', 'apparent_condition', 'visible_injuries'],
      additionalProperties: false
    },
    hazards: { type: 'array', items: { type: 'string' } },
    environment: { type: 'string' },
    recommended_unit: { type: 'string', enum: ['air_rescue', 'water_rescue', 'ambulance', 'fire', 'police'] },
    access_route: { type: 'string' },
    what_responders_should_expect: { type: 'string' },
    immediate_actions_needed: { type: 'array', items: { type: 'string' } },
    eta_priority: { type: 'string', enum: ['IMMEDIATE', 'URGENT', 'STANDARD'] },
    coordination_notes: { type: 'string' }
  },
  required: [
    'alert_level', 'incident_type', 'summary', 'people', 'hazards',
    'environment', 'recommended_unit', 'access_route',
    'what_responders_should_expect', 'immediate_actions_needed',
    'eta_priority', 'coordination_notes'
  ],
  additionalProperties: false
};

async function generate(watcherResult, analystResult, scenarioName = 'aerial', onToken) {
  const scenario = getScenario(scenarioName);

  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Generate a complete responder incident brief based on:

DETECTION (Watcher):
${JSON.stringify({ kind: watcherResult.kind, subjects: watcherResult.subjects, confidence: watcherResult.confidence, description: watcherResult.description }, null, 2)}

THREAT ASSESSMENT (Analyst):
${analystResult.assessment}

SCENE CONTEXT:
${scenario.context}

Generate the full responder brief now. Be specific and thorough — responders depend on this before arrival.`
    }
  ];

  const t0 = Date.now();
  let streamResult;

  try {
    streamResult = await cerebras.streamChat(messages, onToken, {
      reasoning_effort: 'none',
      schema: SCHEMA,
      schemaName: 'incident_report',
      max_tokens: 900
    });
  } catch (err) {
    console.error('Reporter API error:', err.message);
    const fallback = scenarioName === 'aerial'
      ? { alert_level: 'CRITICAL', incident_type: 'Person in Water — Drowning', summary: 'Single subject in open water 200m offshore, actively struggling. Cold water immersion with rising tide. No vessel in vicinity. Thermal imaging confirms live subject. Time-critical extraction required.', people: { count: 1, apparent_condition: 'Conscious but weakening — wave inundation observed', visible_injuries: 'Hypothermia onset likely — cold water 12°C; exhaustion visible in reduced movement' }, hazards: ['Hypothermia within 4–8 minutes at current water temp', 'Rising spring tide increasing drift', 'Wave height 0.8m creating extraction difficulty', 'Secondary drowning risk post-rescue'], environment: 'Open Pacific coastal water, 200m offshore, depth >15m. Wave period 8s, 0.8m swell. Water temp 12°C, air temp 16°C. Visibility good. Daylight.', recommended_unit: 'air_rescue', access_route: 'Direct aerial approach from north — offshore landing not possible. Hoist rescue recommended. Surface boat on standby for secondary extraction.', what_responders_should_expect: 'Subject likely exhausted and hypothermic. May be unable to assist in own rescue. Expect difficulty gripping hoist or harness. Prepare for passive extraction. Have warming protocol ready on board.', immediate_actions_needed: ['Deploy air rescue for hoist extraction immediately', 'Position rescue boat as safety net 50m from subject', 'Prepare hypothermia management kit — warming blankets, IV line', 'Alert receiving hospital for hypothermia and near-drowning protocol', 'Establish radio contact with on-scene drone for real-time guidance'], eta_priority: 'IMMEDIATE', coordination_notes: 'Drone will maintain visual on subject and broadcast GPS coordinates. Water rescue boat must stay clear of helicopter hoist zone — 30m exclusion radius. Hospital notified via AeroSwarm dispatch protocol.' }
      : { alert_level: 'HIGH', incident_type: 'Vehicle Collision — T-Bone with Entrapment', summary: 'Two-vehicle T-bone collision at Main & 5th. Active smoke visible from engine compartment indicating potential fire risk. Minimum 2 occupants — extrication likely required.', people: { count: 2, apparent_condition: 'Both occupants non-ambulatory — likely trapped by structural deformation', visible_injuries: 'Airbag deployment confirmed. Head/neck injuries possible. Unconscious status of occupant in smaller vehicle.' }, hazards: ['Active fuel leak — fire ignition risk', 'Structural instability of crushed vehicles', 'Blocked intersection creating secondary collision risk', 'Electrical short from damaged battery'], environment: 'Urban intersection, daylight, dry road conditions. Vehicles blocking all four lanes. Bystanders present — perimeter needed.', recommended_unit: 'fire', access_route: 'Western approach (5th Ave) is clear. Eastern approach blocked by vehicles. Fire and EMS should stage on 5th Ave west of intersection.', what_responders_should_expect: 'Heavy structural damage to driver side of sedan. Extrication equipment (jaws of life) will be required. Fuel smell reported — establish fire suppression line before patient contact. Police needed immediately for traffic control and bystander management.', immediate_actions_needed: ['Deploy fire engine for fuel suppression and extrication', 'Dispatch ambulances via 5th Ave western approach', 'Police to establish 50m perimeter and divert traffic', 'Prepare C-spine immobilization for both patients', 'Alert trauma center for potential head/neck injuries'], eta_priority: 'IMMEDIATE', coordination_notes: 'Fire engine takes incident command on scene. Ambulances stage until fire clears fuel risk. AeroSwarm drone maintaining overhead surveillance and will alert if fire ignites.' };

    return { ...fallback, _duration: Date.now() - t0, _fallback: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(streamResult.content);
  } catch {
    parsed = {
      alert_level: 'HIGH',
      incident_type: watcherResult.kind,
      summary: streamResult.content?.slice(0, 200) || 'Incident brief generated',
      _parseError: true
    };
  }

  return {
    ...parsed,
    _duration: Date.now() - t0,
    _ttft: streamResult.ttft_ms,
    _tps: streamResult.tps
  };
}

module.exports = { generate };
