const el = {
  analyticsMeta: document.getElementById('analyticsMeta'),
  analyticsSummary: document.getElementById('analyticsSummary'),
  topAreas: document.getElementById('topAreas'),
  eventBreakdown: document.getElementById('eventBreakdown')
};

async function loadAnalytics() {
  const r = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert');
  const data = await r.json();
  const features = data.features || [];
  const now = Date.now();
  const since24h = now - 24 * 60 * 60 * 1000;
  const recent = features.filter((f) => new Date(f.properties?.sent || 0).getTime() >= since24h);
  const severe = features.filter((f) => ['Severe', 'Extreme'].includes(f.properties?.severity));
  el.analyticsMeta.textContent = `${features.length} active | ${recent.length} issued in last 24h`;
  el.analyticsSummary.innerHTML = `
    <article class="favorite-item"><strong>Total Active</strong><span>${features.length}</span></article>
    <article class="favorite-item"><strong>Severe/Extreme</strong><span>${severe.length}</span></article>
    <article class="favorite-item"><strong>Last 24h Issued</strong><span>${recent.length}</span></article>
  `;

  const areaCounts = {};
  const eventCounts = {};
  features.forEach((f) => {
    const area = (f.properties?.areaDesc || 'Unknown').split(';')[0].trim();
    areaCounts[area] = (areaCounts[area] || 0) + 1;
    const event = f.properties?.event || 'Unknown';
    eventCounts[event] = (eventCounts[event] || 0) + 1;
  });

  el.topAreas.innerHTML = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([area, count]) => `<article class="alert-item"><h3>${area}</h3><p class="alert-time">${count} active alerts</p></article>`).join('');
  el.eventBreakdown.innerHTML = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([event, count]) => `<article class="alert-item"><h3>${event}</h3><p class="alert-time">${count} active alerts</p></article>`).join('');
}

loadAnalytics();
