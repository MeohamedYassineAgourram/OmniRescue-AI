'use strict';

const scenarios = {
  aerial: {
    name: 'Water / Aerial — Seine River, Paris',
    description: 'Drone surveillance over the Seine near Notre-Dame',
    incident: { lat: 48.8534, lng: 2.3488, type: 'person_in_water' },
    units: [
      { id: 'helico1', type: 'air_rescue',   lat: 48.8914, lng: 2.3280, label: 'HÉLICO-1 (Issy-les-M.)', color: '#0EA5E9' },
      { id: 'marine7', type: 'water_rescue', lat: 48.8402, lng: 2.3768, label: 'MARINE-7 (Bercy)',        color: '#8B5CF6' },
      { id: 'samu75a', type: 'ambulance',    lat: 48.8652, lng: 2.3589, label: 'SAMU-75 (Hôtel-Dieu)',   color: '#10B981' },
      { id: 'marine3', type: 'water_rescue', lat: 48.8729, lng: 2.2946, label: 'MARINE-3 (Levallois)',   color: '#6366F1' }
    ],
    dangerDurationMs: 15000,
    context: 'Aerial drone surveillance over the Seine River near Île de la Cité and Notre-Dame Cathedral, Paris. The drone monitors the river surface, tourist quays, and bridge areas. Water temperature approximately 14°C. Thermal imaging active. Emergency units from Paris Fire Brigade (BSPP) marine division and SAMU helicopter services.'
  },
  traffic: {
    name: 'Road / Urban — Champs-Élysées, Paris',
    description: 'Traffic camera at Place Charles de Gaulle (Arc de Triomphe)',
    incident: { lat: 48.8698, lng: 2.3078, type: 'vehicle_accident' },
    units: [
      { id: 'police17', type: 'police',    lat: 48.8799, lng: 2.3266, label: 'POLICE-17 (Batignolles)',  color: '#3B82F6' },
      { id: 'samu14',   type: 'ambulance', lat: 48.8754, lng: 2.3369, label: 'SAMU-14 (Lariboisière)',   color: '#10B981' },
      { id: 'bspp8',    type: 'fire',      lat: 48.8661, lng: 2.3128, label: 'BSPP-8 (Madeleine)',      color: '#EF4444' },
      { id: 'police16', type: 'police',    lat: 48.8600, lng: 2.2850, label: 'POLICE-16 (Boulogne-B.)', color: '#3B82F6' }
    ],
    dangerDurationMs: 12000,
    context: 'Fixed traffic camera at Place Charles de Gaulle (Arc de Triomphe roundabout), Paris. This high-traffic intersection has 12 converging avenues including the Champs-Élysées. Emergency units from Paris Police Prefecture and BSPP fire stations on standby.'
  }
};

function getScenario(name) {
  return scenarios[name] || scenarios.aerial;
}

module.exports = { getScenario, scenarios };

// Unified scenario — all Paris units in one pool.
// The dispatch agent picks the right type automatically from the image's detected kind.
scenarios.paris = {
  name: 'Paris Emergency Response Network',
  description: 'Unified Paris surveillance — AI auto-detects incident type',
  incident: { lat: 48.8566, lng: 2.3522 },
  units: [
    ...scenarios.aerial.units,
    ...scenarios.traffic.units
  ],
  dangerDurationMs: 15000,
  context: 'Emergency AI surveillance system covering Paris, France. Cameras monitor the Seine River, Île de la Cité, Champs-Élysées, Arc de Triomphe, tourist areas, bridges, and major intersections. Detect ANY emergency requiring rescue: person in water / drowning, vehicle accident, fire, flooding, pedestrian struck, multi-vehicle pileup, or any life-threatening situation. All Paris emergency services are on standby.'
};
