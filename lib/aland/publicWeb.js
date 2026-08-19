/**
 * Lectura segura de páginas públicas del sitio Fandez (sin admin ni áreas privadas).
 * Siempre incluye páginas clave del sitio + URLs públicas que aparezcan en la KB o el mensaje.
 */
const company = require('../../config/company');

const BLOCKED_PATH_PREFIXES = [
  '/admin',
  '/ops-',
  '/cliente',
  '/proveedor',
  '/tecnico',
  '/aland',
  '/pagos',
  '/seguimiento',
  '/documentos',
  '/health',
  '/verificar-email',
  '/api',
  '/logout',
  '/login'
];

const DEFAULT_PUBLIC_PATHS = ['/', '/quienes-somos', '/registro', '/legal/terminos', '/legal/privacidad'];

const pageCache = new Map(); // url -> { at, text }
const CACHE_TTL_MS = 15 * 60 * 1000;

function siteOrigin() {
  return String(company.appUrl || process.env.APP_URL || 'https://www.fandez.cl').replace(/\/+$/, '');
}

function getAllowedHosts() {
  const hosts = new Set(['fandez.cl', 'www.fandez.cl', 'localhost', '127.0.0.1']);
  try {
    const u = new URL(siteOrigin());
    hosts.add(u.hostname.toLowerCase());
    if (u.hostname.startsWith('www.')) hosts.add(u.hostname.slice(4));
    else hosts.add(`www.${u.hostname}`);
  } catch (_) { /* ignore */ }
  return hosts;
}

function isBlockedPath(pathname) {
  const p = String(pathname || '/').toLowerCase();
  try {
    const adminPath = require('../appMode').getAdminBasePath();
    if (adminPath && adminPath !== '/' && (p === adminPath || p.startsWith(`${adminPath}/`))) {
      return true;
    }
  } catch (_) { /* ignore */ }
  return BLOCKED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix));
}

function normalizePublicUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let href = text;
  if (!/^https?:\/\//i.test(href)) {
    if (href.startsWith('/')) href = `${siteOrigin()}${href}`;
    else if (/^(www\.)?fandez\.cl/i.test(href)) href = `https://${href.replace(/^https?:\/\//i, '')}`;
    else return null;
  }
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (!getAllowedHosts().has(host)) return null;
  if (isBlockedPath(u.pathname)) return null;
  u.hash = '';
  // Normalizar trailing slash en home
  if (u.pathname === '') u.pathname = '/';
  return u.toString();
}

function extractUrls(text) {
  const re = /https?:\/\/[^\s<>"')\]]+|www\.fandez\.cl[^\s<>"')\]]*|fandez\.cl\/[^\s<>"')\]]*/gi;
  const found = String(text || '').match(re) || [];
  return [...new Set(found.map(normalizePublicUrl).filter(Boolean))];
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPublicPage(url, { maxChars = 4500, useCache = true } = {}) {
  const safe = normalizePublicUrl(url);
  if (!safe) return { ok: false, error: 'URL no permitida (solo páginas públicas de Fandez).' };

  if (useCache) {
    const hit = pageCache.get(safe);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { ok: true, url: safe, text: hit.text, cached: true };
    }
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(safe, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'FandezAlandBot/1.0 (+https://www.fandez.cl)',
        Accept: 'text/html,text/plain;q=0.9'
      },
      redirect: 'follow'
    });
    clearTimeout(timer);

    const finalUrl = normalizePublicUrl(res.url);
    if (!finalUrl) return { ok: false, error: 'Redirección a ruta no pública bloqueada.' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const ctype = String(res.headers.get('content-type') || '');
    if (!/text\/html|text\/plain/i.test(ctype)) {
      return { ok: false, error: 'Tipo de contenido no soportado' };
    }

    const raw = await res.text();
    const text = htmlToText(raw).slice(0, maxChars);
    pageCache.set(safe, { at: Date.now(), text });
    return { ok: true, url: finalUrl, text };
  } catch (err) {
    return { ok: false, error: err.message || 'Error al leer la página' };
  }
}

function defaultPublicUrls() {
  const origin = siteOrigin();
  return DEFAULT_PUBLIC_PATHS
    .map((path) => normalizePublicUrl(`${origin}${path === '/' ? '/' : path}`))
    .filter(Boolean);
}

/**
 * @param {string[]} texts - mensaje usuario + entradas KB custom
 * @param {{ includeDefaults?: boolean, maxPages?: number }} opts
 */
async function gatherPublicWebContext(texts = [], opts = {}) {
  const includeDefaults = opts.includeDefaults !== false;
  const maxPages = opts.maxPages || 6;

  const fromText = texts.flatMap(extractUrls);
  const defaults = includeDefaults ? defaultPublicUrls() : [];
  const urls = [...new Set([...defaults, ...fromText])].slice(0, maxPages);
  if (!urls.length) return '';

  const chunks = [];
  await Promise.all(
    urls.map(async (url) => {
      const page = await fetchPublicPage(url);
      if (page.ok && page.text) {
        chunks.push({ url: page.url, text: page.text });
      }
    })
  );

  return chunks
    .map((p) => `### Página pública ${p.url}\n${p.text}`)
    .join('\n\n');
}

module.exports = {
  normalizePublicUrl,
  extractUrls,
  fetchPublicPage,
  gatherPublicWebContext,
  defaultPublicUrls,
  isBlockedPath
};
