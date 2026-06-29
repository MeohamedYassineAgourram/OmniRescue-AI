'use strict';

const { getScenario } = require('../lib/scenarios');
const { getLocation }  = require('../lib/locations');

const UNIT_SPEEDS_KMH = {
  air_rescue:   240,
  water_rescue:  45,
  ambulance:     75,
  fire:          65,
  police:        90
};

// Unit type → display color (used by client for route lines)
const UNIT_TYPE_COLORS = {
  air_rescue:   '#F5C518',
  water_rescue: '#0EA5E9',
  ambulance:    '#10B981',
  fire:         '#EF4444',
  police:       '#8B5CF6'
};

// Multi-unit dispatch rules per incident kind.
// primary   = mission-critical specialists dispatched first
// secondary = always added for coordination/support
const DISPATCH_RULES = {
  person_in_distress:  { primary: ['water_rescue'],         secondary: ['police'] },
  vehicle_accident:    { primary: ['ambulance'],            secondary: ['police'] },
  fire:                { primary: ['fire'],                 secondary: ['police'] },
  flooding:            { primary: ['water_rescue'],         secondary: ['police'] },
  multiple_casualties: { primary: ['ambulance', 'fire'],    secondary: ['police'] },
  none:                { primary: ['ambulance'],            secondary: [] }
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestOfType(type, units, iLat, iLng, usedIds) {
  return units
    .filter(u => u.type === type && !usedIds.has(u.id))
    .map(u => {
      const distKm = haversineKm(iLat, iLng, u.lat, u.lng);
      const etaMin = (distKm / (UNIT_SPEEDS_KMH[u.type] || 60)) * 60;
      return { ...u, distKm, etaMin };
    })
    .sort((a, b) => a.distKm - b.distKm)[0] || null;
}

/**
 * Build the list of unit types to dispatch given kind + terrain.
 * Forest/remote → water_rescue → air_rescue (helicopters can reach anywhere).
 * Water mass casualty → prepend water_rescue to the primary list.
 */
function resolveTypes(kind, terrain) {
  const rule = DISPATCH_RULES[kind] || DISPATCH_RULES.none;
  let primary   = [...rule.primary];
  const secondary = [...rule.secondary];

  if (terrain === 'forest' || terrain === 'remote') {
    // Boats can't operate in forests — replace water units with helicopter
    primary = primary.map(t => t === 'water_rescue' ? 'air_rescue' : t);
    // If no air rescue in list yet, add it as lead unit
    if (!primary.includes('air_rescue')) primary = ['air_rescue', ...primary];
  } else if (terrain === 'water' && kind === 'multiple_casualties') {
    // Boat sinking / mass water casualty → marine rescue takes priority
    primary = ['water_rescue', ...primary.filter(t => t !== 'fire')];
  }

  return { primary, secondary };
}

/**
 * Find and return ALL units that should respond, one per required type.
 * Returns the full dispatch result with an array of units.
 */
function findDispatch(reporterResult, scenarioName = 'paris', watcherKind = 'none', watcherTerrain = 'road', locationHint = 'paris_center') {
  const scenario = getScenario(scenarioName);
  const location  = getLocation(locationHint);
  const { lat: iLat, lng: iLng } = location;

  const { primary, secondary } = resolveTypes(watcherKind, watcherTerrain);
  const allTypes  = [...new Set([...primary, ...secondary])];

  const dispatched = [];
  const usedIds    = new Set();

  for (const unitType of allTypes) {
    const unit = nearestOfType(unitType, scenario.units, iLat, iLng, usedIds);
    if (!unit) continue;
    usedIds.add(unit.id);
    dispatched.push({
      ...unit,
      distKm:  Math.round(unit.distKm * 100) / 100,
      etaMin:  Math.round(unit.etaMin * 10)  / 10,
      role:    primary.includes(unitType) ? 'primary' : 'support',
      color:   UNIT_TYPE_COLORS[unit.type] || '#94A3B8'
    });
  }

  return {
    units:         dispatched,
    incident:      { lat: iLat, lng: iLng, name: location.name },
    incident_kind: watcherKind,
    terrain:       watcherTerrain,
    dispatch_time: new Date().toISOString()
  };
}

module.exports = { findDispatch, UNIT_TYPE_COLORS };
