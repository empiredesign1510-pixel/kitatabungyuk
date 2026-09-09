const AUTH_PROJECT_URL = 'https://xmodzjfhsrqgunrkrwbp.supabase.co';
const AUTH_PUBLISHABLE_KEY = 'sb_publishable_CzFv_8l_3Dl9zYh0axf6yA_gssPk3AR';

const rateBuckets = new Map();

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim();
}

async function authenticatedUser(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    const response = await fetch(`${AUTH_PROJECT_URL}/auth/v1/user`, {
      headers: { apikey: AUTH_PUBLISHABLE_KEY, Authorization: authorization }
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user?.id ? user : null;
  } catch (_) { return null; }
}

function firstHeaderValue(value) {
  return String(value || '').split(',')[0].trim();
}

function normalizeHost(value) {
  return firstHeaderValue(value).toLowerCase().replace(/:\d+$/, '');
}

function originAllowed(req) {
  const origin = firstHeaderValue(req.headers?.origin);
  if (!origin) return true;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch (_) {
    return false;
  }

  const originHost = normalizeHost(originUrl.host);
  const requestHost = normalizeHost(req.headers?.['x-forwarded-host'] || req.headers?.host);

  // Primary rule: API requests from the same site/domain are always allowed.
  // This works for the custom domain, www/non-www aliases, and Vercel deployment aliases
  // without weakening cross-origin protection.
  if (requestHost && originHost === requestHost) return true;

  const configuredOrigins = String(process.env.APP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const knownOrigins = new Set([
    'https://www.kitabung.online',
    'https://kitabung.online',
    'https://www.kitatabung.online',
    'https://kitatabung.online',
    ...configuredOrigins
  ]);

  const originBase = `${originUrl.protocol}//${originUrl.host}`.replace(/\/$/, '');
  if (knownOrigins.has(originBase)) return true;

  if (process.env.VERCEL_ENV !== 'production' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(originBase)) return true;
  return false;
}

function contentLengthOk(req, maxBytes) {
  const n = Number(req.headers?.['content-length'] || 0);
  return !Number.isFinite(n) || n <= 0 || n <= maxBytes;
}

function send(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function cleanText(value, max = 220) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function checkRateLimit(req, { userId = '', scope = 'api', limit = 30, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const key = `${scope}:${userId || clientIp(req)}`;
  const current = rateBuckets.get(key);
  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }
  current.count += 1;
  rateBuckets.set(key, current);
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function rateHeaders(rate) {
  return {
    'X-RateLimit-Remaining': String(rate.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rate.resetAt / 1000))
  };
}

module.exports = {
  AUTH_PROJECT_URL,
  AUTH_PUBLISHABLE_KEY,
  authenticatedUser,
  originAllowed,
  contentLengthOk,
  send,
  cleanText,
  checkRateLimit,
  rateHeaders
};
