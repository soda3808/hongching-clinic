// Vercel Serverless — Dynamic PWA Manifest
// GET /api/manifest?tenant=slug
// Returns a dynamically generated manifest.json based on tenant config.
// No auth required (manifest must be publicly accessible).

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Allow GET and OPTIONS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = req.query?.tenant;

  // Default manifest (no tenant or lookup fails)
  const defaultManifest = {
    name: '康晴綜合醫療中心管理系統',
    short_name: '康晴醫療',
    description: 'Clinic Management System',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e7490',
    theme_color: '#0e7490',
    orientation: 'any',
    icons: [
      { src: '/logo.jpg', sizes: '512x512', type: 'image/jpeg' },
      { src: '/logo.jpg', sizes: '192x192', type: 'image/jpeg' },
    ],
  };

  if (!slug) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.status(200).json(defaultManifest);
  }

  // Look up tenant in Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.status(200).json(defaultManifest);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: tenants } = await supabase
      .from('tenants')
      .select('name, logo_url, settings')
      .eq('slug', slug)
      .eq('active', true)
      .limit(1);

    if (!tenants?.length) {
      res.setHeader('Content-Type', 'application/manifest+json');
      return res.status(200).json(defaultManifest);
    }

    const tenant = tenants[0];
    const primaryColor = tenant.settings?.primaryColor || '#0e7490';
    const iconSrc = tenant.logo_url || '/logo.jpg';

    const manifest = {
      name: (tenant.name || '診所') + '管理系統',
      short_name: tenant.name || '診所',
      description: 'Clinic Management System',
      start_url: '/',
      display: 'standalone',
      background_color: primaryColor,
      theme_color: primaryColor,
      orientation: 'any',
      icons: [
        { src: iconSrc, sizes: '512x512', type: 'image/jpeg' },
        { src: iconSrc, sizes: '192x192', type: 'image/jpeg' },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    // Cache for 1 hour, stale-while-revalidate for 1 day
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).json(manifest);
  } catch (err) {
    console.error('Manifest lookup error:', err);
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.status(200).json(defaultManifest);
  }
}
