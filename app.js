const SEVERE_EVENTS = [
  'Tornado Warning',
  'Severe Thunderstorm Warning',
  'Flash Flood Warning',
  'Extreme Wind Warning',
  'Special Marine Warning'
];

const STORAGE_KEYS = {
  browserId: 'weather_center_browser_id',
  filter: 'weather_center_filter'
};

const map = L.map('map', {
  center: [39.5, -98.35],
  zoom: 5,
  zoomControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const overlays = {
  alerts: L.geoJSON([], {
    style: (feature) => ({
      color: colorForEvent(feature.properties?.event || ''),
      weight: 2,
      fillOpacity: 0.16
    }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const onset = props.onset ? new Date(props.onset).toLocaleString() : 'N/A';
      const expires = props.expires ? new Date(props.expires).toLocaleString() : 'N/A';
      layer.bindPopup(`
        <strong>${props.event || 'Severe Alert'}</strong><br/>
        ${props.areaDesc || 'Unknown area'}<br/>
        Starts: ${onset}<br/>
        Expires: ${expires}
      `);
    }
  }).addTo(map),
  radar: null
};

const el = {
  alertMeta: document.getElementById('alertMeta'),
  radarStatus: document.getElementById('radarStatus'),
  alertsList: document.getElementById('alertsList'),
  filterInput: document.getElementById('filterInput'),
  refreshBtn: document.getElementById('refreshBtn'),
  locateBtn: document.getElementById('locateBtn'),
  frameSlider: document.getElementById('frameSlider'),
  alertTemplate: document.getElementById('alertTemplate'),
  supabaseStatus: document.getElementById('supabaseStatus'),
  snapshotCount: document.getElementById('snapshotCount'),
  lastCloudSync: document.getElementById('lastCloudSync')
};

let allAlerts = [];
let radarFrames = [];
let currentFrameIndex = 0;
let radarAnimationTimer = null;
let supabaseClient = null;
let radarTileHost = 'https://tilecache.rainviewer.com';
const browserId = getBrowserId();

el.filterInput.value = localStorage.getItem(STORAGE_KEYS.filter) || '';

function colorForEvent(eventName = '') {
  if (eventName.includes('Tornado')) return '#ef4444';
  if (eventName.includes('Severe Thunderstorm')) return '#f97316';
  if (eventName.includes('Flash Flood')) return '#10b981';
  return '#8b5cf6';
}

function getBrowserId() {
  const existing = localStorage.getItem(STORAGE_KEYS.browserId);
  if (existing) return existing;
  const newId = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEYS.browserId, newId);
  return newId;
}

async function loadRuntimeConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) return null;
  return response.json();
}

async function connectSupabase() {
  try {
    const runtime = await loadRuntimeConfig();
    const url = runtime?.supabaseUrl;
    const key = runtime?.supabaseAnonKey;
    if (!url || !key || !window.supabase?.createClient) {
      el.supabaseStatus.textContent = 'Not configured yet';
      return;
    }

    supabaseClient = window.supabase.createClient(url, key);
    el.supabaseStatus.textContent = 'Connected';

    await upsertUserPreference();
    await loadCloudMetrics();
  } catch {
    el.supabaseStatus.textContent = 'Configuration unavailable';
  }
}

async function fetchSevereAlerts() {
  const eventsQuery = SEVERE_EVENTS.map((evt) => `event=${encodeURIComponent(evt)}`).join('&');
  const response = await fetch(`https://api.weather.gov/alerts/active?status=actual&message_type=alert&${eventsQuery}`, {
    headers: {
      Accept: 'application/geo+json'
    }
  });

  if (!response.ok) throw new Error(`NWS alerts request failed (${response.status})`);

  const data = await response.json();
  return (data.features || []).filter((f) => f.geometry && f.properties?.severity !== 'Unknown');
}

async function fetchRadarFrames() {
  const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!response.ok) throw new Error(`RainViewer request failed (${response.status})`);

  const data = await response.json();
  radarTileHost = data.host || 'https://tilecache.rainviewer.com';
  const pastFrames = data.radar?.past || [];
  const nowcastFrames = data.radar?.nowcast || [];
  return [...pastFrames, ...nowcastFrames];
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

  filtered
    .sort((a, b) => new Date(a.properties?.sent || 0) - new Date(b.properties?.sent || 0))
    .reverse()
    .forEach((feature) => {
      const { properties } = feature;
      const frag = el.alertTemplate.content.cloneNode(true);
      const article = frag.querySelector('.alert-item');

      frag.querySelector('.alert-title').textContent = properties.event;
      frag.querySelector('.badge').textContent = properties.severity || 'N/A';
      frag.querySelector('.alert-area').textContent = `Area: ${properties.areaDesc}`;

      const sent = properties.sent ? new Date(properties.sent).toLocaleString() : 'N/A';
      const expires = properties.expires ? new Date(properties.expires).toLocaleString() : 'N/A';
      frag.querySelector('.alert-time').textContent = `Issued: ${sent} • Expires: ${expires}`;
      frag.querySelector('.alert-headline').textContent = properties.headline || 'No headline available.';
      article.style.borderLeftColor = colorForEvent(properties.event || '');

      frag.querySelector('.zoom-btn').addEventListener('click', () => {
        const layer = overlays.alerts.getLayers().find((l) => {
          const candidate = l.feature?.properties?.id || l.feature?.id;
          return candidate === (feature.properties.id || feature.id);
        });
        if (layer?.getBounds) {
          map.fitBounds(layer.getBounds(), { padding: [16, 16], maxZoom: 10 });
          layer.openPopup?.();
        }
      });

      el.alertsList.appendChild(frag);
    });
}

function updateAlertOverlay() {
  overlays.alerts.clearLayers();
  overlays.alerts.addData({ type: 'FeatureCollection', features: allAlerts });
}

function setRadarFrame(index) {
  if (!radarFrames.length) return;
  currentFrameIndex = index;

  const frame = radarFrames[index];
  const url = `${radarTileHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

  if (overlays.radar) map.removeLayer(overlays.radar);

  overlays.radar = L.tileLayer(url, {
    tileSize: 256,
    opacity: 0.6,
    zIndex: 500,
    attribution: '&copy; RainViewer'
  }).addTo(map);

  const timestamp = new Date(frame.time * 1000);
  el.radarStatus.textContent = `Frame ${index + 1}/${radarFrames.length} • ${timestamp.toLocaleString()}`;
  el.frameSlider.value = String(index);
}

function startRadarAnimation() {
  if (radarAnimationTimer) clearInterval(radarAnimationTimer);

  radarAnimationTimer = setInterval(() => {
    if (!radarFrames.length) return;
    const next = (currentFrameIndex + 1) % radarFrames.length;
    setRadarFrame(next);
  }, 1200);
}

async function upsertUserPreference() {
  if (!supabaseClient) return;

  const center = map.getCenter();
  const payload = {
    browser_id: browserId,
    filter_text: el.filterInput.value.trim(),
    map_lat: center.lat,
    map_lng: center.lng,
    zoom_level: map.getZoom(),
    updated_at: new Date().toISOString()
  };

  await supabaseClient.from('user_preferences').upsert(payload, { onConflict: 'browser_id' });
}

async function loadCloudMetrics() {
  if (!supabaseClient) return;

  const result = await supabaseClient
    .from('alert_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('browser_id', browserId);

  if (!result.error) {
    el.snapshotCount.textContent = String(result.count || 0);
  }
}

async function saveAlertSnapshot() {
  if (!supabaseClient || !allAlerts.length) return;

  const severeCountByType = allAlerts.reduce((acc, item) => {
    const key = item.properties?.event || 'Other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    browser_id: browserId,
    captured_at: new Date().toISOString(),
    total_alerts: allAlerts.length,
    severe_count_by_type: severeCountByType
  };

  const { error } = await supabaseClient.from('alert_snapshots').insert(payload);
  if (!error) {
    el.lastCloudSync.textContent = new Date(payload.captured_at).toLocaleString();
    const current = Number(el.snapshotCount.textContent || '0');
    el.snapshotCount.textContent = String(current + 1);
  }
}

async function refreshAll() {
  el.refreshBtn.disabled = true;
  el.refreshBtn.textContent = 'Refreshing…';

  try {
    const [alerts, frames] = await Promise.all([fetchSevereAlerts(), fetchRadarFrames()]);
    allAlerts = alerts;
    radarFrames = frames;

    el.alertMeta.textContent = `${allAlerts.length} active severe alert(s) from NWS • Updated ${new Date().toLocaleTimeString()}`;
    el.frameSlider.max = String(Math.max(0, radarFrames.length - 1));

    updateAlertOverlay();
    renderAlerts();

    if (radarFrames.length) {
      setRadarFrame(radarFrames.length - 1);
      startRadarAnimation();
    } else {
      el.radarStatus.textContent = 'Radar frames unavailable right now.';
    }

    await upsertUserPreference();
    await saveAlertSnapshot();
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
el.filterInput.addEventListener('input', async () => {
  localStorage.setItem(STORAGE_KEYS.filter, el.filterInput.value);
  renderAlerts();
  await upsertUserPreference();
});

el.frameSlider.addEventListener('input', () => setRadarFrame(Number(el.frameSlider.value)));

map.on('moveend', () => {
  upsertUserPreference();
});

el.locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    el.alertMeta.textContent = 'Geolocation is not supported by this browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => map.setView([coords.latitude, coords.longitude], 8),
    () => {
      el.alertMeta.textContent = 'Could not access your location.';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

connectSupabase();
refreshAll();
setInterval(refreshAll, 5 * 60 * 1000);
