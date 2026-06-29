'use strict';

// Named incident zones across Paris and surroundings.
// The Watcher AI picks the one that best matches visible landmarks.
const LOCATIONS = {
  seine_notre_dame:   { lat: 48.8516, lng: 2.3509, name: 'Seine · Notre-Dame · Île de la Cité' },
  bir_hakeim:         { lat: 48.8531, lng: 2.2898, name: 'Pont de Bir-Hakeim · Seine 15e/16e' },
  eiffel_tower:       { lat: 48.8584, lng: 2.2945, name: 'Seine · Tour Eiffel · 7e' },
  arc_de_triomphe:    { lat: 48.8738, lng: 2.2950, name: 'Place Charles-de-Gaulle · 8e' },
  champs_elysees:     { lat: 48.8698, lng: 2.3078, name: 'Avenue des Champs-Élysées · 8e' },
  louvre:             { lat: 48.8606, lng: 2.3376, name: 'Louvre · Pont Neuf · 1er' },
  galeries_lafayette: { lat: 48.8738, lng: 2.3316, name: 'Grands Boulevards · Galeries Lafayette · 9e' },
  gare_du_nord:       { lat: 48.8809, lng: 2.3553, name: 'Gare du Nord · 10e' },
  republique:         { lat: 48.8672, lng: 2.3631, name: 'Place de la République · 11e' },
  bastille:           { lat: 48.8533, lng: 2.3692, name: 'Place de la Bastille · 12e' },
  montmartre:         { lat: 48.8867, lng: 2.3431, name: 'Montmartre · Sacré-Cœur · 18e' },
  boulogne_forest:    { lat: 48.8617, lng: 2.2422, name: 'Bois de Boulogne · 16e / Boulogne' },
  vincennes_forest:   { lat: 48.8347, lng: 2.4368, name: 'Bois de Vincennes · 12e / Vincennes' },
  versailles:         { lat: 48.8014, lng: 2.1301, name: 'Versailles · Yvelines (rural)' },
  seine_bercy:        { lat: 48.8412, lng: 2.3754, name: 'Seine · Bercy · 12e' },
  paris_center:       { lat: 48.8566, lng: 2.3522, name: 'Paris Centre' }
};

function getLocation(hint) {
  return LOCATIONS[hint] || LOCATIONS.paris_center;
}

const HINT_LIST = Object.keys(LOCATIONS).join(' | ');

module.exports = { LOCATIONS, getLocation, HINT_LIST };
