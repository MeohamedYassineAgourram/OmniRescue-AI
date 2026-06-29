'use strict';

const { getScenario } = require('../lib/scenarios');

const UNIT_SPEEDS_KMH = {
  air_rescue:   240,
  water_rescue:  45,
  ambulance:     75,
  fire:          65,
  police:        90
};

// Deterministic mapping: incident kind → only eligible unit types.
// Each kind has exactly one primary type so the correct specialist always wins,
// regardless of which unit happens to be geographically closest overall.
const KIND_TO_UNIT_TYPES = {
  person_in_distress:  ['water_rescue', 'air_rescue'],  // drowning → marine/helicopter ONLY
  vehicle_accident:    ['police'],                       // road accident → police first on scene
  fire:                ['fire'],                         // fire → brigade ONLY, SAMU comes after
  flooding:            ['water_rescue', 'air_rescue'],  // flood → marine/helicopter ONLY
  multiple_casualties: ['ambulance'],                   // mass casualty → SAMU medical team
  none:                ['ambulance']                    // safe fallback
};

// Large km-equivalent penalty for sending the wrong unit type.
// 50 km means an appropriate unit up to 50 km away beats any inappropriate unit.
const WRONG_TYPE_PENALTY_KM = 50;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {object} reporterResult  - The reporter's parsed JSON brief
 * @param {string} scenarioName    - 'aerial' | 'traffic'
 * @param {string} watcherKind     - The kind detected by the Watcher agent
 *                                   ('person_in_distress' | 'vehicle_accident' | 'fire' | ...)
 */
function findNearest(reporterResult, scenarioName = 'aerial', watcherKind = 'none') {
  const scenario = getScenario(scenarioName);
  const { lat: iLat, lng: iLng } = scenario.incident;

  // Determine appropriate unit types from the detected incident kind (deterministic).
  // Fall back to reporter's recommended_unit hint only if kind is unknown.
  const appropriateTypes = KIND_TO_UNIT_TYPES[watcherKind]
    || (reporterResult.recommended_unit ? [reporterResult.recommended_unit] : ['ambulance']);

  const scored = scenario.units.map(unit => {
    const distKm   = haversineKm(iLat, iLng, unit.lat, unit.lng);
    const speed    = UNIT_SPEEDS_KMH[unit.type] || 60;
    const etaMin   = (distKm / speed) * 60;

    // isAppropriate: is this unit type in the approved list for this incident kind?
    const isAppropriate = appropriateTypes.includes(unit.type);

    // Score = distance + penalty for wrong type.
    // Appropriate units compete purely on proximity; wrong-type units only win
    // if there is literally no appropriate unit within WRONG_TYPE_PENALTY_KM km.
    const score = (isAppropriate ? 0 : WRONG_TYPE_PENALTY_KM) + distKm;

    return { ...unit, distKm, etaMin, typeMatch: isAppropriate, score };
  });

  scored.sort((a, b) => a.score - b.score);
  const dispatched = scored[0];

  return {
    unit:          dispatched,
    incident:      scenario.incident,
    incident_kind: watcherKind,
    eta_minutes:   Math.round(dispatched.etaMin * 10) / 10,
    distance_km:   Math.round(dispatched.distKm * 100) / 100,
    all_units:     scored,
    dispatch_time: new Date().toISOString()
  };
}

module.exports = { findNearest };
