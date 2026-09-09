import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const BUCKET = 'app-releases';
const PROJECT_REPOSITORY = 'sanpen711/fw-lab';
const MAX_INSTALLER_BYTES = 50 * 1024 * 1024;

const json = (payload: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  },
);

const defaultKey = (environmentName: string) => {
  const raw = Deno.env.get(environmentName);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.default === 'string' ? parsed.default : '';
  } catch {
    return '';
  }
};

const requireEnvironment = () => {
  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const publishableKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS') || String(Deno.env.get('SUPABASE_ANON_KEY') || '');
  const secretKey = defaultKey('SUPABASE_SECRET_KEYS') || String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('Supabase release sync environment is incomplete.');
  return { supabaseUrl, publishableKey, secretKey };
};

const installerName = (version: string) => `fw-lab-windows-${version}-setup.exe`;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const environment = requireEnvironment();
    const contentType = String(request.headers.get('content-type') || '');
    let suppliedKey = String(request.headers.get('apikey') || '');
    let version = '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      suppliedKey ||= String(form.get('apikey') || '');
      version = String(form.get('version') || '').trim();
    } else {
      const body = await request.json().catch(() => null);
      version = String(body?.version || '').trim();
    }
    if (suppliedKey !== environment.publishableKey) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) return json({ error: 'Invalid version' }, 400);

    const fileName = installerName(version);
    const publicUrl = `${environment.supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
    const existing = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    if (existing.ok) return json({ version, publicUrl, alreadyExists: true });

    const sourceUrl = `https://github.com/${PROJECT_REPOSITORY}/releases/download/windows-v${version}/${fileName}`;
    const source = await fetch(sourceUrl, { redirect: 'follow' });
    if (!source.ok) return json({ error: `Official release download failed (${source.status})` }, 502);

    const declaredSize = Number(source.headers.get('content-length') || 0);
    if (declaredSize > MAX_INSTALLER_BYTES) return json({ error: 'Installer exceeds storage limit' }, 413);

    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_INSTALLER_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
      return json({ error: 'Official release is not a valid Windows installer' }, 422);
    }

    const storage = createClient(environment.supabaseUrl, environment.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const uploaded = await storage.storage.from(BUCKET).upload(fileName, bytes, {
      contentType: 'application/vnd.microsoft.portable-executable',
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploaded.error) {
      const appearedMeanwhile = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
      if (!appearedMeanwhile.ok) throw uploaded.error;
      return json({ version, publicUrl, alreadyExists: true });
    }

    const verification = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    if (!verification.ok) throw new Error(`Uploaded installer is not publicly reachable (${verification.status}).`);

    return json({ version, publicUrl, size: bytes.byteLength, alreadyExists: false });
  } catch (error) {
    console.error('sync-windows-release failed', error instanceof Error ? error.message : error);
    return json({ error: 'Windows release sync failed' }, 500);
  }
});
