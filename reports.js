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

  const renderSummaryItem = (label, value) => {
    const article = document.createElement('article');
    article.className = 'favorite-item';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = String(value);
    article.append(strong, span);
    return article;
  };

  el.analyticsSummary.innerHTML = '';
  el.analyticsSummary.append(
    renderSummaryItem('Total Active', features.length),
    renderSummaryItem('Severe/Extreme', severe.length),
    renderSummaryItem('Last 24h Issued', recent.length)
  );

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

  const renderCountList = (container, entries) => {
    container.innerHTML = '';
    entries.forEach(([label, count]) => {
      const article = document.createElement('article');
      article.className = 'alert-item';

      const title = document.createElement('h3');
      title.textContent = label;

      const meta = document.createElement('p');
      meta.className = 'alert-time';
      meta.textContent = `${count} active alerts`;

      article.append(title, meta);
      container.appendChild(article);
    });
  };

  renderCountList(el.topAreas, Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 20));
  renderCountList(el.eventBreakdown, Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 25));
}

loadAnalytics();
