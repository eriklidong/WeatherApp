# Weather Center

Weather Center is a lightweight weather operations dashboard focused on U.S. severe weather awareness:
- Active **NWS severe warnings** (Tornado, Severe Thunderstorm, Flash Flood, Extreme Wind, Special Marine).
- Alert polygons over an interactive map.
- Real-time radar animation using RainViewer.
- Supabase cloud sync for map/filter preferences + alert snapshot logging.

---

## Local development

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

> Local mode still works without Supabase. Cloud metrics will show `Not configured yet`.

---

## Deploy to Supabase + Vercel

### 1) Create a Supabase project
1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. In Supabase SQL Editor, run the schema in `supabase/schema.sql`.
3. In **Project Settings → API**, copy:
   - `Project URL`
   - `anon public` key

### 2) Deploy site to Vercel
1. Push this repo to GitHub/GitLab/Bitbucket.
2. In [https://vercel.com](https://vercel.com), click **Add New → Project**.
3. Import this repository.
4. Vercel settings:
   - Framework Preset: **Other**
   - Build Command: *(leave empty)*
   - Output Directory: *(leave empty)*
5. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - **Do not add or expose `SUPABASE_SERVICE_ROLE_KEY` to client-facing endpoints.**
6. Click **Deploy**.

> Security note: `/api/config` is a public endpoint used by browser clients and must only return `NEXT_PUBLIC_*` values such as the anon key. Never return service-role keys or any other privileged secrets from this endpoint.

### 3) Verify deployment
After deployment:
1. Open your Vercel site URL.
2. Confirm `Cloud Sync (Supabase)` status shows **Connected**.
3. Trigger **Refresh Data** and verify:
   - snapshot count increments
   - `last cloud sync` updates
4. In Supabase table browser, verify new rows in:
   - `public.user_preferences`
   - `public.alert_snapshots`

---

## Data sources
- NWS Alerts API: `https://api.weather.gov/alerts/active`
- RainViewer API: `https://api.rainviewer.com/public/weather-maps.json`
