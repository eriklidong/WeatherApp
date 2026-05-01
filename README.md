# Weather Center

Weather Center is a lightweight weather operations dashboard focused on U.S. severe weather awareness:
- Active **NWS severe warnings** (Tornado, Severe Thunderstorm, Flash Flood, Extreme Wind, Special Marine).
- Alert polygons over an interactive map.
- Real-time radar animation using RainViewer.
- Local browser persistence for filters, favorites, and refresh interval.

---

## Local development

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

> This app currently runs fully client-side and does not require Supabase configuration.

---

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In [https://vercel.com](https://vercel.com), click **Add New → Project**.
3. Import this repository.
4. Vercel settings:
   - Framework Preset: **Other**
   - Build Command: *(leave empty)*
   - Output Directory: *(leave empty)*
5. Click **Deploy**.

### Verify deployment
After deployment:
1. Open your Vercel site URL.
2. In **Live Ops**, click **Refresh Data** (top-right button).
3. Confirm:
   - **Active Severe Alerts** count updates in the status strip.
   - **Updated** timestamp changes.
   - **Alerts Command Center** list refreshes with current alerts.

---

## Data sources
- NWS Alerts API: `https://api.weather.gov/alerts/active`
- RainViewer API: `https://api.rainviewer.com/public/weather-maps.json`
