const SEVERE_EVENTS = [
  'Tornado Warning',
  'Severe Thunderstorm Warning',
  'Flash Flood Warning',
  'Extreme Wind Warning',
  'Special Marine Warning',
  'Snow Squall Warning',
  'Dust Storm Warning'
];

const STORAGE_KEYS = {
  filter: 'weather_center_filter',
  includeWatches: 'weather_center_include_watches',
  criticalOnly: 'weather_center_critical_only',
  favorites: 'weather_center_favorites',
  refreshInterval: 'weather_center_refresh_interval'
};

const map = L.map('map', { center: [39.5, -98.35], zoom: 5, zoomControl: true });
const baseLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }),
  cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; CARTO' }),
  cartoLight: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; CARTO' })
};
let activeBaseLayer = baseLayers.osm;
activeBaseLayer.addTo(map);

let allAlerts = [];
let radarFrames = [];
let currentFrameIndex = 0;
let radarAnimationTimer = null;
let radarTileHost = 'https://tilecache.rainviewer.com';
let radarOpacity = 0.6;
let minutesPerSecond = 60;
let snapToLatest = true;
let refreshTimer = null;

const el = {
  alertMeta: document.getElementById('alertMeta'),
  radarStatus: document.getElementById('radarStatus'),
  alertsList: document.getElementById('alertsList'),
  filterInput: document.getElementById('filterInput'),
  includeWatches: document.getElementById('includeWatches'),
  criticalOnly: document.getElementById('criticalOnly'),
  refreshBtn: document.getElementById('refreshBtn'),
  locateBtn: document.getElementById('locateBtn'),
  frameSlider: document.getElementById('frameSlider'),
  opacitySlider: document.getElementById('opacitySlider'),
  speedSelect: document.getElementById('speedSelect'),
  loopLatest: document.getElementById('loopLatest'),
  basemapSelect: document.getElementById('basemapSelect'),
  refreshIntervalSelect: document.getElementById('refreshIntervalSelect'),
  exportAlertsBtn: document.getElementById('exportAlertsBtn'),
  shortcutsBtn: document.getElementById('shortcutsBtn'),
  shortcutsModal: document.getElementById('shortcutsModal'),
  closeShortcuts: document.getElementById('closeShortcuts'),
  alertTemplate: document.getElementById('alertTemplate'),
  detailsModal: document.getElementById('detailsModal'),
  detailsTitle: document.getElementById('detailsTitle'),
  detailsMeta: document.getElementById('detailsMeta'),
  detailsText: document.getElementById('detailsText'),
  detailsLink: document.getElementById('detailsLink'),
  closeDetails: document.getElementById('closeDetails'),
  activeCount: document.getElementById('activeCount'),
  radarFrameMeta: document.getElementById('radarFrameMeta'),
  updatedAt: document.getElementById('updatedAt'),
  favName: document.getElementById('favName'),
  saveFavBtn: document.getElementById('saveFavBtn'),
  favoritesList: document.getElementById('favoritesList')
  ,missionFeed: document.getElementById('missionFeed')
};

const overlays = {
  alerts: L.geoJSON([], {
    style: (feature) => ({ color: colorForEvent(feature.properties?.event || ''), weight: 2, fillOpacity: 0.16 }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const onset = props.onset ? new Date(props.onset).toLocaleString() : 'N/A';
      const expires = props.expires ? new Date(props.expires).toLocaleString() : 'N/A';
      const featureId = props.id || feature.id || '';
      layer.bindPopup(`<strong>${props.event || 'Severe Alert'}</strong><br/>${props.areaDesc || 'Unknown area'}<br/>Starts: ${onset}<br/>Expires: ${expires}<br/><button class="btn btn-small popup-details-btn" data-alert-id="${featureId}">View Full NWS Details</button>`);
      layer.on('popupopen', (event) => {
        const button = event.popup.getElement()?.querySelector('.popup-details-btn');
        if (!button) return;
        button.addEventListener('click', () => {
          const alertId = button.getAttribute('data-alert-id') || '';
          const selectedFeature = allAlerts.find((item) => (item.properties?.id || item.id || '') === alertId);
          if (selectedFeature) openAlertDetails(selectedFeature);
        });
      });
    }
  }).addTo(map),
  radar: null
};

el.filterInput.value = localStorage.getItem(STORAGE_KEYS.filter) || '';
el.includeWatches.checked = localStorage.getItem(STORAGE_KEYS.includeWatches) === 'true';
el.criticalOnly.checked = localStorage.getItem(STORAGE_KEYS.criticalOnly) === 'true';
el.refreshIntervalSelect.value = localStorage.getItem(STORAGE_KEYS.refreshInterval) || '300';

function colorForEvent(eventName = '') {
  if (eventName.includes('Tornado')) return '#ef4444';
  if (eventName.includes('Severe Thunderstorm')) return '#f97316';
  if (eventName.includes('Flash Flood')) return '#10b981';
  return '#8b5cf6';
}

async function fetchSevereAlerts() {
  const response = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert', { headers: { Accept: 'application/geo+json' } });
  if (!response.ok) throw new Error(`NWS alerts request failed (${response.status})`);
  const data = await response.json();
  return (data.features || []).filter((f) => {
    const p = f.properties || {};
    const event = p.event || '';
    const severeWarning = SEVERE_EVENTS.some((name) => event.toLowerCase() === name.toLowerCase());
    const severeWatch = /watch$/i.test(event) && /tornado|severe thunderstorm|flash flood/i.test(event);
    const severityAllowed = !el.criticalOnly.checked || ['Extreme', 'Severe'].includes(p.severity);
    return (severeWarning || (el.includeWatches.checked && severeWatch)) && severityAllowed && f.geometry;
  });
}

async function fetchRadarFrames() {
  const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!response.ok) throw new Error(`RainViewer request failed (${response.status})`);
  const data = await response.json();
  radarTileHost = data.host || 'https://tilecache.rainviewer.com';
  const sortedFrames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])]
    .filter((frame) => typeof frame.time === 'number' && frame.path)
    .sort((a, b) => a.time - b.time);
  return sortedFrames.filter((frame, idx) => idx === 0 || frame.time !== sortedFrames[idx - 1].time);
}

function renderAlerts() {
  const filter = el.filterInput.value.trim().toUpperCase();
  const filtered = allAlerts.filter(({ properties }) => {
    const area = (properties?.areaDesc || '').toUpperCase();
    const geocode = (properties?.geocode?.UGC || []).join(', ').toUpperCase();
    return !filter || area.includes(filter) || geocode.includes(filter);
  });

  el.alertsList.innerHTML = '';
  if (!filtered.length) {
    el.alertsList.innerHTML = '<p class="empty">No severe alerts match your filter right now.</p>';
    return;
  }

  filtered.sort((a, b) => new Date(b.properties?.sent || 0) - new Date(a.properties?.sent || 0)).forEach((feature) => {
    const { properties } = feature;
    const frag = el.alertTemplate.content.cloneNode(true);
    const article = frag.querySelector('.alert-item');
    frag.querySelector('.alert-title').textContent = properties.event;
    frag.querySelector('.badge').textContent = properties.severity || 'N/A';
    frag.querySelector('.alert-area').textContent = `Area: ${properties.areaDesc}`;
    frag.querySelector('.alert-time').textContent = `Issued: ${new Date(properties.sent).toLocaleString()} • Expires: ${new Date(properties.expires).toLocaleString()}`;
    frag.querySelector('.alert-headline').textContent = properties.headline || 'No headline available.';
    article.style.borderLeftColor = colorForEvent(properties.event || '');

    frag.querySelector('.zoom-btn').addEventListener('click', () => {
      const layer = overlays.alerts.getLayers().find((l) => (l.feature?.properties?.id || l.feature?.id) === (feature.properties.id || feature.id));
      if (layer?.getBounds) map.fitBounds(layer.getBounds(), { padding: [16, 16], maxZoom: 10 });
    });
    frag.querySelector('.details-btn').addEventListener('click', () => openAlertDetails(feature));
    frag.querySelector('.region-btn').addEventListener('click', () => openRegionDetails(feature, findRelatedAlerts(feature)));
    el.alertsList.appendChild(frag);
  });
}

function renderMissionFeed() {
  const latest = [...allAlerts]
    .sort((a, b) => new Date(b.properties?.sent || 0) - new Date(a.properties?.sent || 0))
    .slice(0, 18);
  el.missionFeed.innerHTML = latest.length
    ? latest.map((item) => {
      const p = item.properties || {};
      return `<article class="alert-item"><h3>${p.event || 'Alert'}</h3><p class="alert-area">${p.areaDesc || 'Unknown area'}</p><p class="alert-time">Sent: ${p.sent ? new Date(p.sent).toLocaleString() : 'N/A'}</p><p class="alert-headline">${p.headline || ''}</p></article>`;
    }).join('')
    : '<p class="empty">No active warning feed right now.</p>';
}

function areaTokenSet(feature) {
  const ugc = feature.properties?.geocode?.UGC || [];
  if (ugc.length) return new Set(ugc);
  return new Set([(feature.properties?.areaDesc || '').toUpperCase()]);
}
function findRelatedAlerts(targetFeature) {
  const targetTokens = areaTokenSet(targetFeature);
  return allAlerts.filter((candidate) => [...areaTokenSet(candidate)].some((token) => targetTokens.has(token)));
}

function openAlertDetails(feature) {
  const p = feature.properties || {};
  el.detailsTitle.textContent = p.event || 'NWS Alert';
  el.detailsMeta.textContent = `Area: ${p.areaDesc || 'N/A'} • Issued: ${p.sent ? new Date(p.sent).toLocaleString() : 'N/A'} • Expires: ${p.expires ? new Date(p.expires).toLocaleString() : 'N/A'}`;
  el.detailsText.textContent = [p.headline || '', '', p.description || 'No message body from NWS.', '', p.instruction ? `Instruction: ${p.instruction}` : ''].join('\n').trim();
  el.detailsLink.href = p['@id'] || 'https://weather.gov';
  el.detailsModal.showModal();
}

function openRegionDetails(targetFeature, relatedAlerts) {
  const props = targetFeature.properties || {};
  el.detailsTitle.textContent = `Region alerts (${relatedAlerts.length})`;
  el.detailsMeta.textContent = `Area group: ${props.areaDesc || 'N/A'}`;
  el.detailsText.textContent = relatedAlerts.map((item) => {
    const p = item.properties || {};
    return `• ${p.event} (${p.severity || 'N/A'}) — Expires: ${p.expires ? new Date(p.expires).toLocaleString() : 'N/A'}`;
  }).join('\n');
  el.detailsLink.href = props['@id'] || 'https://weather.gov';
  el.detailsModal.showModal();
}

function updateAlertOverlay() {
  overlays.alerts.clearLayers();
  overlays.alerts.addData({ type: 'FeatureCollection', features: allAlerts });
}

function setBaseMap(layerKey) {
  if (!baseLayers[layerKey]) return;
  if (activeBaseLayer) map.removeLayer(activeBaseLayer);
  activeBaseLayer = baseLayers[layerKey];
  activeBaseLayer.addTo(map);
}

function setRadarFrame(index) {
  if (!radarFrames.length) return;
  currentFrameIndex = index;
  const frame = radarFrames[index];
  const url = `${radarTileHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  if (overlays.radar) map.removeLayer(overlays.radar);
  overlays.radar = L.tileLayer(url, { tileSize: 256, opacity: radarOpacity, zIndex: 500, attribution: '&copy; RainViewer' }).addTo(map);
  const ts = new Date(frame.time * 1000).toLocaleString();
  el.radarStatus.textContent = `Frame ${index + 1}/${radarFrames.length} • ${ts}`;
  el.radarFrameMeta.textContent = ts;
  el.frameSlider.value = String(index);
}

function startRadarAnimation() {
  if (radarAnimationTimer) clearInterval(radarAnimationTimer);
  if (radarFrames.length < 2) return;
  const targetMsPerTick = minutesPerSecond * 60 * 1000;
  radarAnimationTimer = setInterval(() => {
    const currentTimeMs = radarFrames[currentFrameIndex].time * 1000;
    const targetTimeMs = currentTimeMs + targetMsPerTick;
    let next = radarFrames.findIndex((frame) => frame.time * 1000 >= targetTimeMs);
    if (next === -1) next = 0;
    setRadarFrame(next);
  }, 1000);
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]'); } catch { return []; }
}

function escapeCsvField(value) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
  return `"${normalized.replaceAll('"', '""')}"`;
}

function exportAlertsCsv() {
  if (!allAlerts.length) return;
  const headers = ['event', 'severity', 'area', 'sent', 'expires', 'headline'];
  const rows = allAlerts.map((item) => {
    const p = item.properties || {};
    return [p.event, p.severity, p.areaDesc, p.sent, p.expires, p.headline];
  });
  // Quote every field and escape embedded quotes/newlines for RFC 4180-compatible CSV output.
  const csv = [headers.map(escapeCsvField).join(','), ...rows.map((row) => row.map(escapeCsvField).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stormscope-alerts-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function scheduleRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, Number(el.refreshIntervalSelect.value) * 1000);
}
function saveFavorites(favs) { localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favs)); }
function renderFavorites() {
  const favs = getFavorites();
  el.favoritesList.innerHTML = favs.length ? '' : '<p class="empty">No favorites yet.</p>';
  favs.forEach((fav, idx) => {
    const row = document.createElement('div');
    row.className = 'favorite-item';
    row.innerHTML = `<strong>${fav.name}</strong><div><button class="btn btn-small" data-idx="${idx}" data-type="go">Go</button> <button class="btn btn-small" data-idx="${idx}" data-type="del">Delete</button></div>`;
    row.querySelector('[data-type="go"]').addEventListener('click', () => map.setView([fav.lat, fav.lng], fav.zoom));
    row.querySelector('[data-type="del"]').addEventListener('click', () => { favs.splice(idx, 1); saveFavorites(favs); renderFavorites(); });
    el.favoritesList.appendChild(row);
  });
}

async function refreshAll() {
  el.refreshBtn.disabled = true;
  el.refreshBtn.textContent = 'Refreshing…';
  try {
    const [alerts, frames] = await Promise.all([fetchSevereAlerts(), fetchRadarFrames()]);
    allAlerts = alerts;
    radarFrames = frames;
    el.alertMeta.textContent = `${allAlerts.length} active alert(s) • Updated ${new Date().toLocaleTimeString()}`;
    el.activeCount.textContent = String(allAlerts.length);
    el.updatedAt.textContent = new Date().toLocaleTimeString();
    el.frameSlider.max = String(Math.max(0, radarFrames.length - 1));
    updateAlertOverlay();
    renderAlerts();
    renderMissionFeed();
    if (radarFrames.length) {
      const targetIndex = snapToLatest ? radarFrames.length - 1 : Math.min(currentFrameIndex, radarFrames.length - 1);
      setRadarFrame(targetIndex);
      startRadarAnimation();
    } else {
      el.radarStatus.textContent = 'Radar frames unavailable right now.';
      el.radarFrameMeta.textContent = '--';
    }
  } catch (error) {
    console.error(error);
    el.alertMeta.textContent = 'Could not load NWS alerts. Try refreshing in a moment.';
    el.radarStatus.textContent = 'Could not load radar frames.';
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.textContent = 'Refresh Data';
  }
}

el.refreshBtn.addEventListener('click', refreshAll);
el.filterInput.addEventListener('input', () => { localStorage.setItem(STORAGE_KEYS.filter, el.filterInput.value); renderAlerts(); });
el.includeWatches.addEventListener('change', () => { localStorage.setItem(STORAGE_KEYS.includeWatches, String(el.includeWatches.checked)); refreshAll(); });
el.criticalOnly.addEventListener('change', () => { localStorage.setItem(STORAGE_KEYS.criticalOnly, String(el.criticalOnly.checked)); refreshAll(); });
el.frameSlider.addEventListener('input', () => { if (radarAnimationTimer) clearInterval(radarAnimationTimer); setRadarFrame(Number(el.frameSlider.value)); });
el.frameSlider.addEventListener('change', startRadarAnimation);
el.opacitySlider.addEventListener('input', () => { radarOpacity = Number(el.opacitySlider.value); setRadarFrame(currentFrameIndex); });
el.speedSelect.addEventListener('change', () => { minutesPerSecond = Number(el.speedSelect.value); startRadarAnimation(); });
el.loopLatest.addEventListener('change', () => { snapToLatest = el.loopLatest.checked; });
el.basemapSelect.addEventListener('change', () => setBaseMap(el.basemapSelect.value));
el.refreshIntervalSelect.addEventListener('change', () => {
  localStorage.setItem(STORAGE_KEYS.refreshInterval, el.refreshIntervalSelect.value);
  scheduleRefreshTimer();
});
el.exportAlertsBtn.addEventListener('click', exportAlertsCsv);
el.shortcutsBtn.addEventListener('click', () => el.shortcutsModal.showModal());
el.closeShortcuts.addEventListener('click', () => el.shortcutsModal.close());
el.locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(({ coords }) => map.setView([coords.latitude, coords.longitude], 8));
});
el.closeDetails.addEventListener('click', () => el.detailsModal.close());
el.saveFavBtn.addEventListener('click', () => {
  const name = el.favName.value.trim() || `View ${new Date().toLocaleTimeString()}`;
  const c = map.getCenter();
  const favs = getFavorites();
  favs.unshift({ name, lat: c.lat, lng: c.lng, zoom: map.getZoom() });
  saveFavorites(favs.slice(0, 12));
  el.favName.value = '';
  renderFavorites();
});

renderFavorites();
refreshAll();
scheduleRefreshTimer();

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'r') refreshAll();
  if (key === 'l') el.locateBtn.click();
  if (key === 'f') el.filterInput.focus();
  if (key === ' ') {
    event.preventDefault();
    if (radarAnimationTimer) {
      clearInterval(radarAnimationTimer);
      radarAnimationTimer = null;
    } else {
      startRadarAnimation();
    }
  }
  if (key === '1') { el.speedSelect.value = '30'; minutesPerSecond = 30; startRadarAnimation(); }
  if (key === '2') { el.speedSelect.value = '60'; minutesPerSecond = 60; startRadarAnimation(); }
  if (key === '3') { el.speedSelect.value = '120'; minutesPerSecond = 120; startRadarAnimation(); }
});
