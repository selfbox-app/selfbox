// Lightweight user-agent parser — no external dependencies
export function parseUserAgent(ua: string): {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
} {
  const result = {
    browser: 'Unknown',
    browserVersion: '',
    os: 'Unknown',
    osVersion: '',
    deviceType: 'desktop' as string,
  };

  if (!ua) {
    result.deviceType = 'unknown';
    return result;
  }

  // Device type
  if (/bot|crawl|spider|slurp|mediapartners/i.test(ua)) {
    result.deviceType = 'bot';
  } else if (/iPad|tablet|Kindle|Silk|PlayBook/i.test(ua)) {
    result.deviceType = 'tablet';
  } else if (
    /Mobile|Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Opera Mobi/i.test(
      ua,
    )
  ) {
    result.deviceType = 'mobile';
  }

  // Browser detection (order matters - more specific first)
  const browserPatterns: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\S+)/, 'Edge'],
    [/OPR\/(\S+)/, 'Opera'],
    [/Brave\/(\S+)/, 'Brave'],
    [/Vivaldi\/(\S+)/, 'Vivaldi'],
    [/SamsungBrowser\/(\S+)/, 'Samsung Internet'],
    [/UCBrowser\/(\S+)/, 'UC Browser'],
    [/Firefox\/(\S+)/, 'Firefox'],
    [/CriOS\/(\S+)/, 'Chrome'],
    [/FxiOS\/(\S+)/, 'Firefox'],
    [/Chrome\/(\S+)/, 'Chrome'],
    [/Version\/(\S+).*Safari/, 'Safari'],
    [/Safari\/(\S+)/, 'Safari'],
    [/MSIE\s(\S+)/, 'Internet Explorer'],
    [/Trident.*rv:(\S+)/, 'Internet Explorer'],
  ];

  for (const [pattern, name] of browserPatterns) {
    const match = ua.match(pattern);
    if (match) {
      result.browser = name;
      result.browserVersion = match[1]?.split('.').slice(0, 2).join('.') ?? '';
      break;
    }
  }

  // OS detection
  const osPatterns: [RegExp, string, number?][] = [
    [/Windows NT (\d+\.\d+)/, 'Windows'],
    [/Mac OS X (\d+[._]\d+[._]?\d*)/, 'macOS'],
    [/iPhone OS (\d+[._]\d+)/, 'iOS'],
    [/iPad.*OS (\d+[._]\d+)/, 'iPadOS'],
    [/Android (\d+\.?\d*)/, 'Android'],
    [/Linux/, 'Linux'],
    [/CrOS/, 'ChromeOS'],
  ];

  for (const [pattern, name] of osPatterns) {
    const match = ua.match(pattern);
    if (match) {
      result.os = name;
      result.osVersion = (match[1] ?? '').replace(/_/g, '.');
      break;
    }
  }

  return result;
}

// Resolve geolocation from IP using free ip-api.com (no API key needed)
// Rate limited to 45 req/min on the free tier — fine for link tracking
export async function resolveGeoFromIp(ip: string): Promise<{
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}> {
  const empty = {
    country: null,
    countryCode: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
  };

  // Skip private/local IPs
  if (
    !ip ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  ) {
    return empty;
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return empty;
    const data = await res.json();
    if (data.status !== 'success') return empty;

    return {
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
      latitude: data.lat ?? null,
      longitude: data.lon ?? null,
    };
  } catch {
    return empty;
  }
}

// Extract client IP from request headers
export function getClientIp(headers: Headers): string | null {
  // Standard proxy headers
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return (
    headers.get('x-real-ip') ??
    headers.get('cf-connecting-ip') ??
    null
  );
}
