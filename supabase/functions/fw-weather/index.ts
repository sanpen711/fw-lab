const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (payload: unknown, status = 200, cacheControl = 'no-store') => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  },
);

const requireHost = () => {
  const configured = String(Deno.env.get('QWEATHER_API_HOST') || '').trim().replace(/\/+$/, '');
  if (!configured) throw new Error('QWEATHER_API_HOST is missing');
  const url = new URL(configured.includes('://') ? configured : `https://${configured}`);
  if (url.protocol !== 'https:' || !/(^|\.)qweatherapi\.com$/i.test(url.hostname)) {
    throw new Error('QWEATHER_API_HOST is invalid');
  }
  return url.origin;
};

const requireApiKey = () => {
  const value = String(Deno.env.get('QWEATHER_API_KEY') || '').trim();
  if (!value) throw new Error('QWEATHER_API_KEY is missing');
  return value;
};

const qweatherRequest = async (pathname: string, params: Record<string, string>) => {
  const url = new URL(pathname, `${requireHost()}/`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-QW-Api-Key': requireApiKey(),
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || (data.code && data.code !== '200')) {
      throw new Error(`QWeather request failed (${data?.code || response.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
};

const searchLocations = async (requestUrl: URL) => {
  const query = String(requestUrl.searchParams.get('q') || '').trim();
  if (query.length < 2 || query.length > 40) {
    return json({ error: '请输入 2 至 40 个字的地区名称。' }, 400);
  }
  const data = await qweatherRequest('/geo/v2/city/lookup', {
    location: query,
    range: 'cn',
    number: '8',
    lang: 'zh',
  });
  const seen = new Set<string>();
  const locations = (Array.isArray(data.location) ? data.location : []).flatMap((item: Record<string, unknown>) => {
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const adm2 = String(item.adm2 || '').trim();
    const adm1 = String(item.adm1 || '').trim();
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || seen.has(id)) return [];
    seen.add(id);
    const hierarchy = [name, adm2, adm1].filter((value, index, list) => value && list.indexOf(value) === index);
    return [{
      id,
      name,
      adm2,
      adm1,
      label: hierarchy.join(' · '),
      latitude,
      longitude,
      timezone: String(item.tz || 'Asia/Shanghai'),
    }];
  });
  return json({ locations, provider: 'qweather' });
};

const currentWeather = async (requestUrl: URL) => {
  const latitude = Number(requestUrl.searchParams.get('lat'));
  const longitude = Number(requestUrl.searchParams.get('lon'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return json({ error: '地区坐标无效，请重新选择。' }, 400);
  }
  const data = await qweatherRequest(
    `/weather/v1/current/${latitude.toFixed(2)}/${longitude.toFixed(2)}`,
    { lang: 'zh', localTime: 'true' },
  );
  const temperature = Number(data.temperature?.value);
  const apparentTemperature = Number(data.feelsLike?.value);
  if (!Number.isFinite(temperature)) throw new Error('QWeather response has no temperature');
  return json({
    provider: 'qweather',
    current: {
      temperature,
      apparentTemperature: Number.isFinite(apparentTemperature) ? apparentTemperature : temperature,
      conditionText: String(data.condition?.text || '天气变化中'),
      conditionCode: String(data.condition?.code || ''),
      humidity: Number(data.humidity),
      windScale: Number(data.wind?.scale),
      windSpeed: Number(data.wind?.speed?.value),
    },
    attribution: '天气服务由和风天气驱动',
    updatedAt: new Date().toISOString(),
  }, 200, 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    const requestUrl = new URL(request.url);
    const action = requestUrl.searchParams.get('action');
    if (action === 'search') return await searchLocations(requestUrl);
    if (action === 'current') return await currentWeather(requestUrl);
    return json({ error: 'Unknown weather action' }, 404);
  } catch (error) {
    console.error('fw-weather failed', error instanceof Error ? error.message : error);
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '天气服务连接超时，请稍后再试。'
      : '天气服务暂时不可用，请稍后再试。';
    return json({ error: message }, 502);
  }
});
