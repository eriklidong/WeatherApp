const SEVERE_EVENTS = [
  'Tornado Warning',
  'Severe Thunderstorm Warning',
  'Flash Flood Warning',
  'Extreme Wind Warning',
  'Special Marine Warning'
];

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
    style: (feature) => {
      const evt = feature.properties?.event || '';
      return {
        color: colorForEvent(evt),
        weight: 2,
        fillOpacity: 0.16
      };
    },
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
  alertTemplate: document.getElementById('alertTemplate')
};

let allAlerts = [];
let radarFrames = [];
let currentFrameIndex = 0;
let radarAnimationTimer = null;

function colorForEvent(eventName = '') {
  if (eventName.includes('Tornado')) return '#ef4444';
  if (eventName.includes('Severe Thunderstorm')) return '#f97316';
  if (eventName.includes('Flash Flood')) return '#10b981';
  return '#8b5cf6';
}

async function fetchSevereAlerts() {
  const eventsQuery = SEVERE_EVENTS.map((evt) => `event=${encodeURIComponent(evt)}`).join('&');
  const response = await fetch(`https://api.weather.gov/alerts/active?status=actual&message_type=alert&${eventsQuery}`, {
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': 'WeatherCenterDemo/1.0 (contact: weather-center@example.com)'
    }
  });

  if (!response.ok) {
    throw new Error(`NWS alerts request failed (${response.status})`);
  }

  const data = await response.json();
  return (data.features || []).filter((f) => f.geometry && f.properties?.severity !== 'Unknown');
}

async function fetchRadarFrames() {
  const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!response.ok) {
    throw new Error(`RainViewer request failed (${response.status})`);
  }

  const data = await response.json();
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
      const title = frag.querySelector('.alert-title');
      const badge = frag.querySelector('.badge');
      const area = frag.querySelector('.alert-area');
      const time = frag.querySelector('.alert-time');
      const headline = frag.querySelector('.alert-headline');
      const zoomBtn = frag.querySelector('.zoom-btn');

      title.textContent = properties.event;
      badge.textContent = properties.severity || 'N/A';
      area.textContent = `Area: ${properties.areaDesc}`;
      const sent = properties.sent ? new Date(properties.sent).toLocaleString() : 'N/A';
      const expires = properties.expires ? new Date(properties.expires).toLocaleString() : 'N/A';
      time.textContent = `Issued: ${sent} • Expires: ${expires}`;
      headline.textContent = properties.headline || 'No headline available.';
      article.style.borderLeftColor = colorForEvent(properties.event || '');

      zoomBtn.addEventListener('click', () => {
        const layer = overlays.alerts.getLayers().find((l) => {
          const candidate = l.feature?.properties?.id || l.feature?.id;
          return candidate === (feature.properties.id || feature.id);
        });
        if (layer && layer.getBounds) {
          map.fitBounds(layer.getBounds(), { padding: [16, 16], maxZoom: 10 });
          if (layer.openPopup) layer.openPopup();
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
  const url = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

  if (overlays.radar) {
    map.removeLayer(overlays.radar);
  }

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
  if (radarAnimationTimer) {
    clearInterval(radarAnimationTimer);
  }

  radarAnimationTimer = setInterval(() => {
    const next = (currentFrameIndex + 1) % radarFrames.length;
    setRadarFrame(next);
  }, 1200);
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
el.filterInput.addEventListener('input', renderAlerts);
el.frameSlider.addEventListener('input', () => {
  setRadarFrame(Number(el.frameSlider.value));
});

el.locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    el.alertMeta.textContent = 'Geolocation is not supported by this browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      map.setView([coords.latitude, coords.longitude], 8);
    },
    () => {
      el.alertMeta.textContent = 'Could not access your location.';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

refreshAll();
setInterval(refreshAll, 5 * 60 * 1000);
