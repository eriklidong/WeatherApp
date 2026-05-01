export default function handler(req, res) {
  // This endpoint is intentionally public-facing and must only return
  // values safe to expose in browser clients (e.g., NEXT_PUBLIC_* vars).
  // Never include Supabase service-role or any other privileged secrets.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    return res.status(503).json({
      error: 'Public Supabase client configuration is unavailable. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
}
