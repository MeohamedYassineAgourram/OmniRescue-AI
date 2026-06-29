'use strict';

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS — always use the unified Paris scenario
// ═══════════════════════════════════════════════════════════════════

const SCENARIO = 'paris';

const ALL_PARIS_UNITS = [
  { id: 'helico1',  type: 'air_rescue',   lat: 48.8914, lng: 2.3280, label: 'HÉLICO-1 (Issy-les-M.)', icon: '🚁' },
  { id: 'marine7',  type: 'water_rescue',  lat: 48.8402, lng: 2.3768, label: 'MARINE-7 (Bercy)',        icon: '🚤' },
  { id: 'samu75a',  type: 'ambulance',     lat: 48.8652, lng: 2.3589, label: 'SAMU-75 (Hôtel-Dieu)',   icon: '🚑' },
  { id: 'marine3',  type: 'water_rescue',  lat: 48.8729, lng: 2.2946, label: 'MARINE-3 (Levallois)',   icon: '🚤' },
  { id: 'police17', type: 'police',        lat: 48.8799, lng: 2.3266, label: 'POLICE-17 (Batignolles)',icon: '🚔' },
  { id: 'samu14',   type: 'ambulance',     lat: 48.8754, lng: 2.3369, label: 'SAMU-14 (Lariboisière)', icon: '🚑' },
  { id: 'bspp8',    type: 'fire',          lat: 48.8661, lng: 2.3128, label: 'BSPP-8 (Madeleine)',     icon: '🚒' },
  { id: 'police16', type: 'police',        lat: 48.8600, lng: 2.2850, label: 'POLICE-16 (Boulogne-B.)',icon: '🚔' }
];

const KIND_LABELS = {
  person_in_distress:  '🌊 Person in Water',
  vehicle_accident:    '🚗 Vehicle Accident',
  fire:                '🔥 Fire',
  flooding:            '🌊 Flooding',
  multiple_casualties: '🏥 Multiple Casualties',
  none: '✓ None'
};

// ═══════════════════════════════════════════════════════════════════
//  SESSION STATE (analytics + history)
// ═══════════════════════════════════════════════════════════════════

const session = {
  scans:      0,
  incidents:  0,
  cleared:    0,
  dispatches: 0,
  kindCounts: {},
  cerebrasMs: [],
  geminiMs:   [],
  history:    [],         // { time, kind, unit, eta, alertLevel }
  notifications: 3,      // start at 3 (system boot messages)
  unitStatus: {}         // { id: 'available' | 'dispatched' }
};

ALL_PARIS_UNITS.forEach(u => { session.unitStatus[u.id] = 'available'; });

// ═══════════════════════════════════════════════════════════════════
//  VIEW ROUTER
// ═══════════════════════════════════════════════════════════════════

let currentView = 'incidents';

function switchView(name) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });
  // Toggle views
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active',  el.id === `view-${name}`);
    el.classList.toggle('hidden', el.id !== `view-${name}`);
  });
  currentView = name;

  // Refresh view content on enter
  if (name === 'dispatch')   renderDispatchView();
  if (name === 'analytics')  renderAnalyticsView();
  if (name === 'history')    renderHistoryView();
}

// ═══════════════════════════════════════════════════════════════════
//  DISPATCH VIEW
// ═══════════════════════════════════════════════════════════════════

function renderDispatchView() {
  const list = document.getElementById('unitStatusList');
  if (!list) return;
  list.innerHTML = ALL_PARIS_UNITS.map(unit => {
    const status    = session.unitStatus[unit.id] || 'available';
    const dispatched = status === 'dispatched';
    return `
      <div class="unit-row${dispatched ? ' dispatched' : ''}">
        <span class="unit-type-icon">${unit.icon}</span>
        <div class="unit-info">
          <div class="unit-label">${unit.label}</div>
          <div class="unit-type">${unit.type.replace('_',' ')} · ${unit.lat.toFixed(4)}°N ${unit.lng.toFixed(4)}°E</div>
        </div>
        <span class="unit-status-badge ${status}">${dispatched ? 'DISPATCHED' : 'AVAILABLE'}</span>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
//  ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════════

function renderAnalyticsView() {
  setText('stat-scans',      session.scans);
  setText('stat-incidents',  session.incidents);
  setText('stat-clear',      session.cleared);
  setText('stat-dispatches', session.dispatches);

  // Speed bars
  const cAvg = session.cerebrasMs.length
    ? Math.round(session.cerebrasMs.reduce((a,b)=>a+b,0) / session.cerebrasMs.length)
    : null;
  const gAvg = session.geminiMs.length
    ? Math.round(session.geminiMs.reduce((a,b)=>a+b,0) / session.geminiMs.length)
    : null;

  const maxMs = Math.max(cAvg||0, gAvg||0, 1);
  const cBar  = document.getElementById('cerebras-speed-bar');
  const gBar  = document.getElementById('gpu-speed-bar');
  if (cBar) cBar.style.width = `${(cAvg||0)/maxMs*100}%`;
  if (gBar) gBar.style.width = `${(gAvg||0)/maxMs*100}%`;
  setText('cerebras-avg-ms', cAvg ? `${cAvg}ms` : '—');
  setText('gpu-avg-ms',      gAvg ? `${gAvg}ms` : '—');

  // Kind breakdown
  Object.entries(KIND_LABELS).forEach(([kind]) => {
    const el = document.getElementById(`kind-${kind}`);
    if (el) el.textContent = session.kindCounts[kind] || 0;
  });
}

// ═══════════════════════════════════════════════════════════════════
//  HISTORY VIEW
// ═══════════════════════════════════════════════════════════════════

function renderHistoryView() {
  const chip = document.getElementById('history-count-chip');
  if (chip) chip.textContent = `${session.history.length} incident${session.history.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (session.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="history-empty">No incidents recorded yet</td></tr>';
    return;
  }

  tbody.innerHTML = [...session.history].reverse().map(h => `
    <tr>
      <td style="font-family:var(--fm);white-space:nowrap">${h.time}</td>
      <td>${KIND_LABELS[h.kind] || h.kind}</td>
      <td style="font-weight:600;color:var(--t1);font-size:10px">${h.unit}</td>
      <td style="font-size:10px;color:var(--t2)">${h.location||'—'}</td>
      <td style="font-family:var(--fm)">${h.eta} min</td>
      <td><span class="alert-badge-sm ${h.alertLevel}">${h.alertLevel}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

function addNotification(icon, title, desc, isAlert = false) {
  session.notifications++;
  const badge = document.getElementById('notif-badge');
  if (badge) badge.textContent = session.notifications;

  const list = document.getElementById('notifList');
  if (!list) return;

  const item = document.createElement('div');
  item.className = `notif-item${isAlert ? ' notif-alert' : ''}`;
  item.innerHTML = `
    <div class="notif-icon">${icon}</div>
    <div class="notif-body">
      <div class="notif-title">${title}</div>
      <div class="notif-desc">${desc}</div>
      <div class="notif-time">${new Date().toLocaleTimeString('fr-FR')}</div>
    </div>`;
  list.insertBefore(item, list.firstChild);
}

// ═══════════════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════════════

function addChatMessage(avatar, name, text, isAlert = false) {
  const chatBadge = document.getElementById('chat-badge');
  if (chatBadge) chatBadge.textContent = parseInt(chatBadge.textContent||0) + 1;

  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `chat-msg${isAlert ? ' alert' : ''} system`;
  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble">
      <div class="chat-name">${name}</div>
      <div class="chat-text">${text}</div>
      <div class="chat-time">${new Date().toLocaleTimeString('fr-FR')}</div>
    </div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════
//  DISPATCH LOG (Dispatch view)
// ═══════════════════════════════════════════════════════════════════

function addDispatchLogEntry(unit, kind, eta, dist) {
  const log = document.getElementById('dispatchLog');
  if (!log) return;
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<strong>${unit}</strong> dispatched for ${KIND_LABELS[kind] || kind} · ETA ${eta} min · ${dist} km<div class="log-entry-time">${new Date().toLocaleTimeString('fr-FR')}</div>`;
  log.insertBefore(entry, log.firstChild);

  // Update last dispatch time badge
  const lt = document.getElementById('lastDispatchTime');
  if (lt) lt.textContent = `Last: ${new Date().toLocaleTimeString('fr-FR')}`;
}

// ═══════════════════════════════════════════════════════════════════
//  LEAFLET MAP
// ═══════════════════════════════════════════════════════════════════

let leafletMap     = null;
let mapLayers      = { incident: null, units: {}, routes: [] };
let streetLayer    = null;
let satelliteLayer = null;

// Route color per unit type — mirrors server-side UNIT_TYPE_COLORS
const ROUTE_COLORS = {
  air_rescue:   '#F5C518',
  water_rescue: '#0EA5E9',
  ambulance:    '#10B981',
  fire:         '#EF4444',
  police:       '#8B5CF6'
};

function initLeafletMap() {
  leafletMap = L.map('leafletMap', { center: [48.8580, 2.3300], zoom: 13, zoomControl: false });

  streetLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap © Carto', maxZoom: 19 }
  ).addTo(leafletMap);

  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19 }
  );

  L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
  placeUnitMarkers(new Set());
}

function createIncidentIcon(kindLabel) {
  return L.divIcon({
    html: `<div class="map-incident-marker"><span class="inc-pulse"></span>⚠</div>`,
    className: '', iconSize: [40,40], iconAnchor: [20,20], popupAnchor: [0,-22]
  });
}

function createUnitIcon(unit, isDispatched, routeColor) {
  const style = isDispatched
    ? `border: 2px solid ${routeColor || '#F5C518'}; box-shadow: 0 0 0 3px ${(routeColor||'#F5C518')}44;`
    : '';
  const cls = isDispatched ? 'map-unit-marker dispatched' : 'map-unit-marker';
  return L.divIcon({
    html: `<div class="${cls}" style="${style}">${unit.icon}</div>`,
    className: '', iconSize: [32,32], iconAnchor: [16,16], popupAnchor: [0,-18]
  });
}

function placeUnitMarkers(dispatchedIds, dispatchedUnitsMap = {}) {
  Object.values(mapLayers.units).forEach(l => { try { leafletMap.removeLayer(l); } catch {} });
  mapLayers.units = {};

  ALL_PARIS_UNITS.forEach(unit => {
    const isDispatched = dispatchedIds.has(unit.id);
    const dispatchedUnit = dispatchedUnitsMap[unit.id];
    const color  = isDispatched ? (ROUTE_COLORS[unit.type] || '#F5C518') : null;
    const marker = L.marker([unit.lat, unit.lng], { icon: createUnitIcon(unit, isDispatched, color) }).addTo(leafletMap);
    const popupText = isDispatched && dispatchedUnit
      ? `<strong>${unit.label}</strong><br>${unit.type.replace('_',' ')}<br>ETA: <b>${dispatchedUnit.etaMin} min</b> · ${dispatchedUnit.distKm} km`
      : `<strong>${unit.label}</strong><br>${unit.type.replace('_',' ')} · Available`;
    marker.bindPopup(popupText);
    if (isDispatched) marker.openPopup();
    mapLayers.units[unit.id] = marker;
  });
}

function updateMapForDispatch(dispatchResult) {
  // Remove old incident marker + all routes
  if (mapLayers.incident) { try { leafletMap.removeLayer(mapLayers.incident); } catch {} }
  mapLayers.routes.forEach(l => { try { leafletMap.removeLayer(l); } catch {} });
  mapLayers.routes = [];

  const inc = dispatchResult.incident;

  // Incident marker
  mapLayers.incident = L.marker([inc.lat, inc.lng], { icon: createIncidentIcon() }).addTo(leafletMap);
  mapLayers.incident.bindPopup(
    `<strong>⚠ ${(dispatchResult.incident_kind||'').replace(/_/g,' ').toUpperCase()}</strong><br>${inc.name}`
  ).openPopup();

  // Build lookup maps for dispatched units
  const dispatchedIds  = new Set(dispatchResult.units.map(u => u.id));
  const dispatchedMap  = {};
  dispatchResult.units.forEach(u => { dispatchedMap[u.id] = u; });

  // Re-render all unit markers (dispatched ones glow in their type color)
  placeUnitMarkers(dispatchedIds, dispatchedMap);

  // Draw one colored route line per dispatched unit
  const allPoints = [[inc.lat, inc.lng]];

  dispatchResult.units.forEach(unit => {
    const clientUnit = ALL_PARIS_UNITS.find(u => u.id === unit.id) || unit;
    const color = ROUTE_COLORS[unit.type] || '#94A3B8';

    const line = L.polyline(
      [[clientUnit.lat, clientUnit.lng], [inc.lat, inc.lng]],
      { color, weight: 3.5, dashArray: '9 6', opacity: 0.88 }
    ).addTo(leafletMap);

    line.bindTooltip(
      `${unit.icon} ${unit.label}<br>ETA ${unit.etaMin} min · ${unit.distKm} km`,
      { sticky: true }
    );

    mapLayers.routes.push(line);
    allPoints.push([clientUnit.lat, clientUnit.lng]);
  });

  // Fit map to encompass incident + all responding units
  if (allPoints.length > 1) {
    leafletMap.fitBounds(L.latLngBounds(allPoints).pad(0.28));
  }
}

function clearMapLayers() {
  if (mapLayers.incident) { try { leafletMap.removeLayer(mapLayers.incident); } catch {} }
  mapLayers.routes.forEach(l => { try { leafletMap.removeLayer(l); } catch {} });
  Object.values(mapLayers.units).forEach(l => { try { leafletMap.removeLayer(l); } catch {} });
  mapLayers = { incident: null, units: {}, routes: [] };
  ALL_PARIS_UNITS.forEach(u => { session.unitStatus[u.id] = 'available'; });
}

// ═══════════════════════════════════════════════════════════════════
//  FILE UPLOAD & MEDIA
// ═══════════════════════════════════════════════════════════════════

let loadedFrame    = null;
let mediaType      = null;
let videoObjectUrl = null;

function handleFile(file) {
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) { alert('Unsupported file. JPG, PNG, MP4, MOV, WEBM only.'); return; }

  clearMedia(true);
  mediaType   = isVideo ? 'video' : 'image';
  loadedFrame = null;

  setText('mediaFilename', file.name);
  document.getElementById('mediaTypeDot').style.color = isVideo ? '#F97316' : '#0EA5E9';

  if (isVideo) {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    videoObjectUrl = URL.createObjectURL(file);
    const vid = document.getElementById('previewVideo');
    vid.src = videoObjectUrl;
    vid.load();
    swapToMediaView('video');
    setChip('VIDEO LOADED — CAPTURE A FRAME', '');
    updateRunBtn();
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      const raw = new Image();
      raw.onload = () => {
        const canvas = document.getElementById('captureCanvas');
        // 800px max keeps the payload under ~120KB base64 while preserving enough detail for the vision model
        const MAX_W  = 800;
        const scale  = Math.min(1, MAX_W / raw.naturalWidth);
        canvas.width  = Math.round(raw.naturalWidth  * scale);
        canvas.height = Math.round(raw.naturalHeight * scale);
        canvas.getContext('2d').drawImage(raw, 0, 0, canvas.width, canvas.height);
        loadedFrame = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
        document.getElementById('previewImg').src = e.target.result;
        swapToMediaView('image');
        document.getElementById('frameReadyBadge').classList.remove('hidden');
        setChip('IMAGE READY — ANALYZING…', 'ticking');
        updateRunBtn();
        setTimeout(() => runMission(), 400);
      };
      raw.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function captureVideoFrame() {
  const vid = document.getElementById('previewVideo');
  if (!vid.src || vid.readyState < 2) { alert('Video not ready yet.'); return; }
  vid.pause();
  const canvas = document.getElementById('captureCanvas');
  const vw = vid.videoWidth  || 1280;
  const vh = vid.videoHeight || 720;
  const vs = Math.min(1, 800 / vw);
  canvas.width  = Math.round(vw * vs);
  canvas.height = Math.round(vh * vs);
  canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
  loadedFrame = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];

  const flash = document.getElementById('captureFlash');
  flash.classList.remove('hidden');
  setTimeout(() => flash.classList.add('hidden'), 250);

  document.getElementById('frameReadyBadge').classList.remove('hidden');
  setChip('FRAME CAPTURED — ANALYZING…', 'ticking');
  updateRunBtn();
  setTimeout(() => runMission(), 300);
}

function swapToMediaView(type) {
  document.getElementById('uploadZone').classList.add('hidden');
  document.getElementById('mediaView').classList.remove('hidden');
  document.getElementById('previewImg').classList.toggle('hidden', type !== 'image');
  document.getElementById('previewVideo').classList.toggle('hidden', type !== 'video');
  document.getElementById('videoBar').classList.toggle('hidden', type !== 'video');
}

function clearMedia(keepView = false) {
  loadedFrame = null;
  mediaType   = null;
  const vid = document.getElementById('previewVideo');
  vid.pause(); vid.src = '';
  if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
  document.getElementById('previewImg').src = '';
  document.getElementById('previewImg').classList.add('hidden');
  document.getElementById('previewVideo').classList.add('hidden');
  document.getElementById('videoBar').classList.add('hidden');
  document.getElementById('frameReadyBadge').classList.add('hidden');
  document.getElementById('bboxOverlay').innerHTML = '';
  const ds = document.getElementById('detectionStamp');
  if (ds) ds.className = 'detection-stamp hidden';
  setAnalysisProgress(false);
  if (!keepView) {
    document.getElementById('uploadZone').classList.remove('hidden');
    document.getElementById('mediaView').classList.add('hidden');
  }
  setChip('READY', '');
  updateRunBtn();
  const fi = document.getElementById('fileInput');
  if (fi) fi.value = '';
}

function setChip(text, modifier) {
  const el = document.getElementById('dangerTimer');
  if (!el) return;
  el.textContent = '● ' + text;
  el.className   = `status-chip${modifier ? ' ' + modifier : ''}`;
}

function setAnalysisProgress(active) {
  const bar = document.getElementById('analysisBar');
  if (bar) bar.classList.toggle('active', !!active);
}

function formatVideoTime(s) {
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

function updateRunBtn() {
  const btn = document.getElementById('runBtn');
  if (!btn) return;
  btn.disabled = missionRunning || !loadedFrame;
  btn.classList.toggle('hidden', !loadedFrame);
}

// ═══════════════════════════════════════════════════════════════════
//  STREAMING NDJSON
// ═══════════════════════════════════════════════════════════════════

async function* readNDJSON(response) {
  const reader = response.body.getReader();
  const dec    = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try { yield JSON.parse(t); } catch {}
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BRIEF RENDERER
// ═══════════════════════════════════════════════════════════════════

function renderBrief(el, brief) {
  const al  = brief.alert_level || 'MODERATE';
  const haz = (brief.hazards||[]).map(h=>`<li>${h}</li>`).join('');
  const act = (brief.immediate_actions_needed||[]).map(a=>`<li>${a}</li>`).join('');
  el.innerHTML = `<div class="brief-rendered">
    <div class="brief-field"><span class="brief-key">Alert Level</span><span class="brief-val ${al}">${al}</span></div>
    <div class="brief-field"><span class="brief-key">Incident Type</span><span class="brief-val">${brief.incident_type||'—'}</span></div>
    <div class="brief-field"><span class="brief-key">Summary</span><span class="brief-val">${brief.summary||'—'}</span></div>
    <div class="brief-field"><span class="brief-key">Persons</span><span class="brief-val">${brief.people?.count??'?'} — ${brief.people?.apparent_condition||'—'}</span></div>
    <div class="brief-field"><span class="brief-key">Recommended Unit</span><span class="brief-val">${(brief.recommended_unit||'—').toUpperCase()}</span></div>
    <div class="brief-field"><span class="brief-key">Environment</span><span class="brief-val">${brief.environment||'—'}</span></div>
    <div class="brief-field"><span class="brief-key">Access Route</span><span class="brief-val">${brief.access_route||'—'}</span></div>
    <div class="brief-field"><span class="brief-key">What to Expect</span><span class="brief-val">${brief.what_responders_should_expect||'—'}</span></div>
    ${haz?`<div class="brief-field"><span class="brief-key">Hazards</span><ul class="brief-list">${haz}</ul></div>`:''}
    ${act?`<div class="brief-field"><span class="brief-key">Actions</span><ul class="brief-list">${act}</ul></div>`:''}
    <div class="brief-field"><span class="brief-key">Coordination</span><span class="brief-val">${brief.coordination_notes||'—'}</span></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  ALERT PANEL HELPERS
// ═══════════════════════════════════════════════════════════════════

let incidentCount = 0;

function showAlertPanel() {
  const p = document.getElementById('alertPanel');
  if (p) { p.classList.remove('hidden'); switchTab('tabTracking'); }
}

function hideAlertPanel() {
  const p = document.getElementById('alertPanel');
  if (p) p.classList.add('hidden');
}

function switchTab(tabId) {
  ['tabInfo','tabTracking','tabDocs'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('active');
  });
  ['apInfo','apTracking','apBrief'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.classList.add('hidden');
  });
  const btn  = document.getElementById(tabId);
  const map  = { tabInfo:'apInfo', tabTracking:'apTracking', tabDocs:'apBrief' };
  const pane = document.getElementById(map[tabId]);
  if (btn)  btn.classList.add('active');
  if (pane) pane.classList.remove('hidden');
}

function setTimelineStep(stepId, state, desc, time) {
  const dot  = document.querySelector(`#${stepId} .tl-dot`);
  const da   = document.getElementById(`${stepId.replace('tl-','tl-')}-desc`);
  const ta   = document.getElementById(`${stepId.replace('tl-','tl-')}-time`);
  if (da) da.textContent = desc || '';
  if (ta) ta.textContent = time || '';
  if (dot) {
    dot.className = 'tl-dot';
    if (state==='active')     dot.classList.add('active');
    else if (state==='done')  dot.classList.add('done-green');
    else if (state==='alert') dot.classList.add('done-red');
    else if (state==='blue')  dot.classList.add('tl-dot-blue');
    else                      dot.classList.add('tl-dot-gray');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════════

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setNodeState(id, state) {
  const el = document.getElementById(`node-${id}`);
  if (el) el.dataset.state = state;
}

function setNodeTime(id, ms) { setText(`${id}-time`, ms != null ? `${ms}ms` : ''); }
function setNodeResult(id, text) { setText(`${id}-result`, text); }

function setMetric(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const display = val != null ? val : '--';
  if (String(el.textContent) !== String(display)) {
    el.textContent = display;
    if (val != null && val !== '--' && val !== '—' && val !== 'N/A') {
      el.classList.remove('populated');
      void el.offsetWidth;
      el.classList.add('populated');
    }
  }
}

function appendToOutput(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const ph = el.querySelector('.race-placeholder');
  if (ph) ph.remove();
  el.textContent += text;
  el.scrollTop = el.scrollHeight;
}

function showStamp(id, cls, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `verdict-stamp ${cls}`;
  el.textContent = text;
}

function setLiveBadge(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  const isGpu = el.classList.contains('gpu-badge-color');
  const extra  = isGpu ? ' gpu-badge-color' : '';
  if (state === 'streaming') { el.textContent = 'LIVE';  el.className = `live-badge${extra} streaming`; }
  else if (state === 'done') { el.textContent = 'DONE';  el.className = `live-badge${extra} done`; }
  else                       { el.textContent = 'IDLE';  el.className = `live-badge${extra}`; }
}

function setTrackProgress(id, tokens, max) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${Math.min(100,(tokens/max)*100)}%`;
}

function setTokenCount(id, tokens) { setText(id, `${tokens} tok`); }

function setSystemStatus(state, label) {
  const dot = document.getElementById('statusDot');
  const lbl = document.getElementById('statusLabel');
  if (dot) dot.className = `status-dot ${state}`;
  if (lbl) lbl.textContent = label;
}

// ═══════════════════════════════════════════════════════════════════
//  APP STATE
// ═══════════════════════════════════════════════════════════════════

let missionRunning = false;

function resetUI() {
  ['watcher','analyst','reporter','dispatch'].forEach(n => {
    setNodeState(n, 'idle'); setNodeTime(n, null);
  });
  setNodeResult('watcher',  'Detection agent — awaiting upload');
  setNodeResult('analyst',  'Threat analysis — awaiting detection');
  setNodeResult('reporter', 'Incident brief — awaiting analysis');
  setNodeResult('dispatch', 'Rescue dispatch — awaiting brief');

  document.getElementById('cerebras-output').innerHTML = '<span class="race-placeholder">Awaiting upload…</span>';
  document.getElementById('gemini-output').innerHTML   = '<span class="race-placeholder">Awaiting upload…</span>';
  ['c-ttft','c-tps','c-total','g-ttft','g-tps','g-total'].forEach(id => setMetric(id, null));
  document.getElementById('cerebras-stamp').className = 'verdict-stamp hidden';
  document.getElementById('gemini-stamp').className   = 'verdict-stamp hidden';
  const rv = document.getElementById('raceVerdict');
  if (rv) { rv.textContent = ''; rv.className = 'race-verdict'; }
  setTrackProgress('c-track', 0, 1); setTokenCount('c-token-count', 0);
  setTrackProgress('g-track', 0, 1); setTokenCount('g-token-count', 0);
  setLiveBadge('c-live-badge', 'idle');
  setLiveBadge('g-live-badge', 'idle');

  const bc = document.getElementById('briefContent');
  if (bc) bc.innerHTML = '<div class="brief-ph"><div class="brief-ph-icon">📋</div><div>Brief appears after analysis</div></div>';

  hideAlertPanel();
  document.getElementById('clearBanner').classList.add('hidden');
  setTimelineStep('tl-detect',   'blue', 'Awaiting analysis…', '');
  setTimelineStep('tl-analyze',  'gray', 'Awaiting detection…', '');
  setTimelineStep('tl-dispatch', 'gray', 'Awaiting brief…', '');
  const dc = document.getElementById('dispatchCard');
  if (dc) dc.classList.add('hidden');
  const pt = document.getElementById('pipelineTotalTime');
  if (pt) pt.textContent = '';
  const ds = document.getElementById('detectionStamp');
  if (ds) ds.className = 'detection-stamp hidden';
  const ig = document.getElementById('infoGrid');
  if (ig) ig.innerHTML = '<div class="info-ph">No incident data yet</div>';

  clearMapLayers();
  if (leafletMap) {
    leafletMap.setView([48.8580, 2.3300], 13);
    placeUnitMarkers(new Set());
  }
  setAnalysisProgress(false);
  setSystemStatus('ready', 'READY');
}

// ═══════════════════════════════════════════════════════════════════
//  PIPELINE
// ═══════════════════════════════════════════════════════════════════

async function runPipeline(frame) {
  let briefRaw = '';
  let reporterStarted = false;
  let detectedKind = 'none';
  let detectedAlertLevel = 'MODERATE';
  const bc = document.getElementById('briefContent');
  const now = () => new Date().toLocaleTimeString('fr-FR');

  const res = await fetch('/api/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frame, scenario: SCENARIO })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  for await (const event of readNDJSON(res)) {
    switch (event.type) {

      case 'agent_start':
        setNodeState(event.agent, 'running');
        if (event.agent === 'watcher')  setTimelineStep('tl-detect',  'active', 'AI scanning the scene…', now());
        if (event.agent === 'analyst')  setTimelineStep('tl-analyze', 'active', 'Assessing threat level…', now());
        if (event.agent === 'reporter') {
          reporterStarted = true; briefRaw = '';
          if (bc) { bc.innerHTML = ''; bc.classList.add('stream-cursor'); }
        }
        break;

      case 'agent_complete':
        setNodeState(event.agent, event.agent === 'dispatch' ? 'dispatch' : 'done');
        setNodeTime(event.agent, event.duration_ms);

        if (event.agent === 'watcher') {
          const r = event.result;
          detectedKind = r.kind || 'none';
          session.kindCounts[detectedKind] = (session.kindCounts[detectedKind] || 0) + 1;
          if (r.incident_detected) {
            setNodeResult('watcher', `✓ ${(KIND_LABELS[detectedKind]||detectedKind)} · ${Math.round(r.confidence*100)}% confidence`);
            setTimelineStep('tl-detect', 'done', `${KIND_LABELS[detectedKind]||detectedKind} detected`, now());
            if (r.bbox?.length === 4) {
              const [x1,y1,x2,y2] = r.bbox;
              const bx = document.getElementById('bboxOverlay');
              bx.innerHTML = '';
              const box = document.createElement('div');
              box.className = 'bbox-box';
              Object.assign(box.style, { left:`${x1}%`, top:`${y1}%`, width:`${x2-x1}%`, height:`${y2-y1}%` });
              bx.appendChild(box);
            }
          } else {
            setNodeResult('watcher', `No incident (${Math.round(r.confidence*100)}% confidence)`);
            setTimelineStep('tl-detect', 'done', 'No incident detected', now());
          }
        }

        if (event.agent === 'analyst') {
          const a = event.result?.assessment || '';
          setNodeResult('analyst', a.slice(0,120) + (a.length>120?'…':''));
          setTimelineStep('tl-analyze', 'done', a.slice(0,80) + (a.length>80?'…':''), now());
        }

        if (event.agent === 'reporter') {
          if (bc) bc.classList.remove('stream-cursor');
          try {
            const parsed = JSON.parse(briefRaw);
            detectedAlertLevel = parsed.alert_level || 'MODERATE';
            renderBrief(bc, parsed);
            const ig = document.getElementById('infoGrid');
            if (ig) ig.innerHTML = `
              <div class="info-row"><span class="info-key">Alert Level</span><span class="info-val brief-val ${detectedAlertLevel}">${detectedAlertLevel}</span></div>
              <div class="info-row"><span class="info-key">Type</span><span class="info-val">${parsed.incident_type||'—'}</span></div>
              <div class="info-row"><span class="info-key">Summary</span><span class="info-val">${parsed.summary||'—'}</span></div>
            `;
          } catch {}
          if (event.tps) setNodeResult('reporter', `Brief generated · ${event.tps} tok/s`);
        }

        if (event.agent === 'dispatch') {
          const r = event.result;
          const names = r.units.map(u => u.label.split(' ')[0]).join(' + ');
          const maxEta = Math.max(...r.units.map(u => u.etaMin));
          setNodeResult('dispatch', `${r.units.length} units → ${names} · max ETA ${maxEta} min`);
        }
        break;

      case 'reporter_token':
        if (reporterStarted && bc) {
          briefRaw += event.token;
          if (!bc.querySelector('.stream-text')) {
            const pre = document.createElement('pre');
            pre.className = 'stream-text';
            bc.appendChild(pre);
          }
          const pre = bc.querySelector('.stream-text');
          if (pre) { pre.textContent = briefRaw; bc.scrollTop = bc.scrollHeight; }
        }
        break;

      case 'dispatch': {
        const r = event.result;

        // Mark all dispatched units in session state
        r.units.forEach(u => { session.unitStatus[u.id] = 'dispatched'; });

        // Draw all routes on Leaflet map
        updateMapForDispatch(r);

        // Timeline — list all units
        const unitNames = r.units.map(u => u.label.split(' ')[0]).join(' + ');
        const maxEta    = Math.max(...r.units.map(u => u.etaMin));
        setTimelineStep('tl-dispatch', 'alert', `${unitNames} dispatched · max ETA ${maxEta} min`, now());

        // Multi-unit dispatch card in alert panel
        const dc = document.getElementById('dispatchCard');
        if (dc) {
          const grid = document.getElementById('dcUnitsGrid');
          if (grid) {
            grid.innerHTML = r.units.map(unit => {
              const color = ROUTE_COLORS[unit.type] || '#94A3B8';
              const roleLabel = unit.role === 'primary' ? '★ Primary' : '↺ Support';
              return `<div class="dc-unit-row" style="border-left:3px solid ${color}">
                <span class="du-icon">${unit.icon}</span>
                <div class="du-info">
                  <div class="du-name">${unit.label}</div>
                  <div class="du-meta">${unit.etaMin} min ETA · ${unit.distKm} km</div>
                </div>
                <span class="du-role-badge" style="color:${color}">${roleLabel}</span>
              </div>`;
            }).join('');
          }
          dc.classList.remove('hidden');
        }

        // Alert panel info tab
        const ig = document.getElementById('infoGrid');
        if (ig && r.incident) {
          ig.innerHTML = `
            <div class="info-row"><span class="info-key">Location</span><span class="info-val">${r.incident.name}</span></div>
            <div class="info-row"><span class="info-key">Terrain</span><span class="info-val">${r.terrain||'—'}</span></div>
            <div class="info-row"><span class="info-key">Coords</span><span class="info-val" style="font-family:var(--fm);font-size:10px">${r.incident.lat.toFixed(4)}°N ${r.incident.lng.toFixed(4)}°E</span></div>
            <div class="info-row"><span class="info-key">Units</span><span class="info-val">${r.units.length} responding</span></div>
          `;
        }

        // Alert panel
        incidentCount++;
        setText('alertIncidentNo', `No: #INC-${String(incidentCount).padStart(4,'0')}`);
        showAlertPanel();

        // Detection stamp on uploaded image
        const ds = document.getElementById('detectionStamp');
        if (ds) {
          ds.textContent = `🚨 ${unitNames} DISPATCHED`;
          ds.className   = 'detection-stamp alert';
          setTimeout(() => { if(ds) ds.className = 'detection-stamp hidden'; }, 10000);
        }

        // Session tracking (log primary unit for history table)
        session.dispatches++;
        const primaryUnit = r.units.find(u => u.role === 'primary') || r.units[0];
        session.history.push({
          time:       now(),
          kind:       detectedKind,
          unit:       unitNames,
          eta:        maxEta,
          alertLevel: detectedAlertLevel,
          location:   r.incident?.name || '—'
        });

        // Cross-view updates (one notification per dispatched unit)
        r.units.forEach((unit, i) => {
          const isFirst = i === 0;
          addDispatchLogEntry(unit.label, detectedKind, unit.etaMin, unit.distKm);
          if (isFirst) {
            addNotification('🚨',
              `${r.units.length} Units Dispatched — ${r.incident?.name || 'Paris'}`,
              `${KIND_LABELS[detectedKind]||detectedKind} · ${unitNames}`,
              true
            );
            addChatMessage('🚨', 'DISPATCH ALERT',
              `<strong>${unitNames}</strong> responding to ${KIND_LABELS[detectedKind]||detectedKind} at <em>${r.incident?.name||'Paris'}</em>. Primary ETA: ${primaryUnit?.etaMin} min.`,
              true
            );
          }
        });
        break;
      }

      case 'complete':
        setText('pipelineTotalTime', `${event.total_ms}ms`);
        break;

      case 'no_incident': {
        session.cleared++;
        setNodeResult('watcher', `Scene clear — ${Math.round((event.confidence||0)*100)}% confidence`);
        setNodeState('watcher', 'done');
        setTimelineStep('tl-detect', 'done', `Scene clear — no emergency detected`, now());
        const cb = document.getElementById('clearBanner');
        if (cb) { cb.classList.remove('hidden'); setTimeout(() => cb.classList.add('hidden'), 5000); }
        const ds = document.getElementById('detectionStamp');
        if (ds) { ds.textContent = '✓ Scene Clear'; ds.className = 'detection-stamp clear'; setTimeout(()=>{if(ds)ds.className='detection-stamp hidden';},5000); }
        break;
      }

      case 'error':
        console.error('Pipeline error:', event.message);
        setSystemStatus('error', 'ERROR');
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RACE
// ═══════════════════════════════════════════════════════════════════

const RACE_DEADLINE_MS = 4000;
const RACE_MAX_TOKENS  = 350;

async function runRace(frame) {
  let cTotal = null, gTotal = null, cTokens = 0, gTokens = 0;
  setLiveBadge('c-live-badge', 'streaming');
  setLiveBadge('g-live-badge', 'streaming');

  const res = await fetch('/api/race', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frame, scenario: SCENARIO })
  });
  if (!res.ok) throw new Error(`Race HTTP ${res.status}`);

  for await (const event of readNDJSON(res)) {
    switch (event.type) {
      case 'cerebras_token':
        appendToOutput('cerebras-output', event.token);
        cTokens++;
        setTokenCount('c-token-count', cTokens);
        setTrackProgress('c-track', cTokens, RACE_MAX_TOKENS);
        if (event.ttft_ms != null && cTokens === 1) setMetric('c-ttft', event.ttft_ms);
        break;
      case 'cerebras_complete':
        cTotal = event.total_ms;
        setTrackProgress('c-track', RACE_MAX_TOKENS, RACE_MAX_TOKENS);
        setLiveBadge('c-live-badge', 'done');
        setMetric('c-ttft', event.ttft_ms??'--'); setMetric('c-tps', event.tps??'--'); setMetric('c-total', event.total_ms??'--');
        if (event.total_ms) showStamp('cerebras-stamp', event.total_ms < RACE_DEADLINE_MS ? 'win' : 'lose',
          event.total_ms < RACE_DEADLINE_MS ? `✓ ${event.total_ms}ms — BEAT ${RACE_DEADLINE_MS/1000}s` : `✗ ${event.total_ms}ms — ${event.total_ms-RACE_DEADLINE_MS}ms OVER`);
        if (event.total_ms) session.cerebrasMs.push(event.total_ms);
        break;
      case 'cerebras_error':
        setLiveBadge('c-live-badge', 'idle');
        document.getElementById('cerebras-output').innerHTML = `<span style="color:#EF4444;font-style:italic">${event.message}</span>`;
        ['c-ttft','c-tps','c-total'].forEach(id => setMetric(id, '—'));
        showStamp('cerebras-stamp', 'lose', '✗ API ERROR');
        break;
      case 'gemini_token':
        appendToOutput('gemini-output', event.token);
        gTokens++;
        setTokenCount('g-token-count', gTokens);
        setTrackProgress('g-track', gTokens, RACE_MAX_TOKENS);
        if (event.ttft_ms != null && gTokens === 1) setMetric('g-ttft', event.ttft_ms);
        break;
      case 'gemini_complete':
        gTotal = event.total_ms;
        setTrackProgress('g-track', RACE_MAX_TOKENS, RACE_MAX_TOKENS);
        setLiveBadge('g-live-badge', 'done');
        if (event.simulated) {
          ['g-ttft','g-tps','g-total'].forEach(id => setMetric(id, 'N/A'));
          showStamp('gemini-stamp', 'info', 'ADD GEMINI_API_KEY TO .env');
          gTotal = null;
        } else {
          setMetric('g-ttft', event.ttft_ms??'--'); setMetric('g-tps', event.tps??'--'); setMetric('g-total', event.total_ms??'--');
          if (event.total_ms) showStamp('gemini-stamp', event.total_ms < RACE_DEADLINE_MS ? 'win' : 'lose',
            event.total_ms < RACE_DEADLINE_MS ? `✓ ${event.total_ms}ms` : `✗ ${event.total_ms}ms`);
          if (event.total_ms) session.geminiMs.push(event.total_ms);
        }
        break;
      case 'gemini_error':
        setLiveBadge('g-live-badge', 'idle');
        document.getElementById('gemini-output').innerHTML = `<span style="color:#EF4444;font-style:italic">${event.message}</span>`;
        ['g-ttft','g-tps','g-total'].forEach(id => setMetric(id, '—'));
        showStamp('gemini-stamp', 'lose', '✗ API ERROR');
        break;
      case 'race_complete': {
        const rv = document.getElementById('raceVerdict');
        if (!rv) break;
        if (cTotal != null && gTotal != null) {
          if (cTotal < gTotal) { rv.textContent = `⚡ CEREBRAS ${(gTotal/cTotal).toFixed(1)}× FASTER`; rv.className = 'race-verdict cerebras-win'; }
          else { rv.textContent = `GPU ${(cTotal/gTotal).toFixed(1)}× FASTER`; rv.className = 'race-verdict gpu-win'; }
        } else if (cTotal != null) { rv.textContent = `CEREBRAS: ${cTotal}ms`; rv.className = 'race-verdict cerebras-win'; }
        break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MISSION CONTROL
// ═══════════════════════════════════════════════════════════════════

async function runMission() {
  if (missionRunning || !loadedFrame) return;
  missionRunning = true;
  session.scans++;
  session.incidents++;
  updateRunBtn();
  setSystemStatus('running', 'ANALYZING');
  setChip('AI ANALYZING…', 'ticking');
  setAnalysisProgress(true);

  const frame = loadedFrame;
  try {
    await Promise.all([
      runPipeline(frame).catch(err => { console.error('Pipeline:', err); setSystemStatus('error', 'ERROR'); }),
      runRace(frame).catch(err => console.error('Race:', err))
    ]);
  } finally {
    missionRunning = false;
    updateRunBtn();
    setSystemStatus('ready', 'COMPLETE');
    setAnalysisProgress(false);
    setChip('ANALYSIS COMPLETE', 'done');
  }
}

function resetMission() {
  if (missionRunning) return;
  clearMedia();
  resetUI();
  ALL_PARIS_UNITS.forEach(u => { session.unitStatus[u.id] = 'available'; });
}

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  initLeafletMap();

  // ── Navigation ───────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // ── File input / drag-drop ────────────────────────────────────
  const fileInput  = document.getElementById('fileInput');
  const dropZone   = document.getElementById('dropZone');
  const uploadZone = document.getElementById('uploadZone');

  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  [dropZone, uploadZone].forEach(zone => {
    zone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0]; if (file) handleFile(file);
    });
  });

  document.getElementById('changeMediaBtn').addEventListener('click', () => resetMission());

  // ── Video controls ────────────────────────────────────────────
  const vid        = document.getElementById('previewVideo');
  const playBtn    = document.getElementById('playPauseBtn');
  const scrubber   = document.getElementById('videoScrubber');

  playBtn.addEventListener('click', () => { if (vid.paused) vid.play(); else vid.pause(); });
  scrubber.addEventListener('input', () => { if (vid.duration) vid.currentTime = parseFloat(scrubber.value) * vid.duration; });
  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    scrubber.value = vid.currentTime / vid.duration;
    setText('videoTime', formatVideoTime(vid.currentTime));
  });
  vid.addEventListener('play',  () => { playBtn.textContent = '⏸'; });
  vid.addEventListener('pause', () => { playBtn.textContent = '▶'; });
  vid.addEventListener('ended', () => { playBtn.textContent = '▶'; });
  document.getElementById('captureFrameBtn').addEventListener('click', captureVideoFrame);

  // ── Reanalyze + Reset ─────────────────────────────────────────
  const runBtn = document.getElementById('runBtn');
  if (runBtn) runBtn.addEventListener('click', () => runMission());
  document.getElementById('resetBtn').addEventListener('click', () => resetMission());
  updateRunBtn();

  // ── Alert panel tabs ──────────────────────────────────────────
  ['tabInfo','tabTracking','tabDocs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => switchTab(id));
  });
  document.getElementById('alertPanelClose').addEventListener('click', hideAlertPanel);

  // ── Map style switchers ───────────────────────────────────────
  document.getElementById('mapCtrlStreet').addEventListener('click', function() {
    document.querySelectorAll('.map-ctrl').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    if (!leafletMap.hasLayer(streetLayer)) { leafletMap.removeLayer(satelliteLayer); leafletMap.addLayer(streetLayer); }
  });
  document.getElementById('mapCtrlSatellite').addEventListener('click', function() {
    document.querySelectorAll('.map-ctrl').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    if (!leafletMap.hasLayer(satelliteLayer)) { leafletMap.removeLayer(streetLayer); leafletMap.addLayer(satelliteLayer); }
  });
  document.getElementById('mapCtrlLayers').addEventListener('click', function() {
    document.querySelectorAll('.map-ctrl').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });

  // ── Clear notifications ───────────────────────────────────────
  const clearBtn = document.getElementById('clearNotifBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    session.notifications = 0;
    const badge = document.getElementById('notif-badge');
    if (badge) badge.textContent = '0';
  });

  // ── Health check ──────────────────────────────────────────────
  fetch('/api/health')
    .then(r => r.json())
    .then(data => {
      setSystemStatus(data.cerebras ? 'ready' : 'error', data.cerebras ? 'READY' : 'KEY MISSING');
      const lbl = document.getElementById('geminiModelLabel');
      if (lbl && data.geminiModel) lbl.textContent = data.geminiModel;
    })
    .catch(() => setSystemStatus('error', 'OFFLINE'));

  // ── Initial dispatch view render ──────────────────────────────
  renderDispatchView();
});
