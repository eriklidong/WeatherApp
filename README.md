# Weather Center

A lightweight weather operations dashboard focused on U.S. severe weather awareness.

## Features
- Active **NWS severe warnings** (Tornado, Severe Thunderstorm, Flash Flood, Extreme Wind, Special Marine).
- Alert polygons plotted on an interactive map.
- Real-time radar animation using RainViewer radar tiles.
- Quick location centering and state/zone filtering.
- Auto-refresh every 5 minutes.

## Run locally
```bash
python3 -m http.server 4173
```
Then open `http://localhost:4173`.

## Data sources
- NWS Alerts API: `https://api.weather.gov/alerts/active`
- RainViewer API: `https://api.rainviewer.com/public/weather-maps.json`
