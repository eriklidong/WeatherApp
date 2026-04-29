const el = {
  locationInput: document.getElementById('locationInput'),
  lookupBtn: document.getElementById('lookupBtn'),
  lookupStatus: document.getElementById('lookupStatus'),
  forecastCards: document.getElementById('forecastCards'),
  hourlyTable: document.getElementById('hourlyTable'),
  hazardsList: document.getElementById('hazardsList'),
  hazardMeta: document.getElementById('hazardMeta')
};

async function geocodeLocation(query) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error('Could not geocode location');
  const rows = await r.json();
  if (!rows.length) throw new Error('Location not found');
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), name: rows[0].display_name };
}

async function fetchForecast(lat, lon) {
  const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
  const point = await pointRes.json();
  const forecastUrl = point.properties?.forecast;
  const hourlyUrl = point.properties?.forecastHourly;
  if (!forecastUrl || !hourlyUrl) throw new Error('Forecast endpoint unavailable');
  const [forecast, hourly] = await Promise.all([fetch(forecastUrl).then((r) => r.json()), fetch(hourlyUrl).then((r) => r.json())]);
  return { forecast: forecast.properties?.periods || [], hourly: hourly.properties?.periods || [] };
}

function renderForecast(periods) {
  el.forecastCards.innerHTML = '';
  periods.slice(0, 8).forEach((p) => {
    const card = document.createElement('article');
    card.className = 'alert-item';
    card.innerHTML = `<h3>${p.name}</h3><p class="alert-time">${p.temperature}°${p.temperatureUnit} • ${p.windSpeed} ${p.windDirection}</p><p class="alert-headline">${p.shortForecast}</p>`;
    el.forecastCards.appendChild(card);
  });
}

function renderHourly(hourly) {
  const rows = hourly.slice(0, 12).map((h) => `<tr><td>${new Date(h.startTime).toLocaleTimeString([], { hour: 'numeric' })}</td><td>${h.temperature}°${h.temperatureUnit}</td><td>${h.probabilityOfPrecipitation?.value ?? 0}%</td><td>${h.shortForecast}</td></tr>`).join('');
  el.hourlyTable.innerHTML = `<table><thead><tr><th>Time</th><th>Temp</th><th>PoP</th><th>Conditions</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadHazards() {
  const r = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert');
  const data = await r.json();
  const hazards = (data.features || []).filter((f) => /watch|warning/i.test(f.properties?.event || ''));
  el.hazardMeta.textContent = `${hazards.length} current hazard headlines`;
  el.hazardsList.innerHTML = hazards.slice(0, 30).map((h) => `<article class="alert-item"><h3>${h.properties.event}</h3><p class="alert-area">${h.properties.areaDesc}</p><p class="alert-time">Expires: ${h.properties.expires ? new Date(h.properties.expires).toLocaleString() : 'N/A'}</p></article>`).join('');
}

el.lookupBtn.addEventListener('click', async () => {
  const q = el.locationInput.value.trim();
  if (!q) return;
  el.lookupStatus.textContent = 'Looking up…';
  try {
    const geo = await geocodeLocation(q);
    const { forecast, hourly } = await fetchForecast(geo.lat, geo.lon);
    renderForecast(forecast);
    renderHourly(hourly);
    el.lookupStatus.textContent = geo.name;
  } catch (e) {
    el.lookupStatus.textContent = e.message;
  }
});

loadHazards();
