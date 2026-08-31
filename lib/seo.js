const company = require('../config/company');

const DEFAULT_OG_IMAGE = '/img/quienes-somos-hero.jpg';

const PUBLIC_PAGES = [
  { id: 'home', path: '/', changefreq: 'weekly', priority: '1.0' },
  { id: 'about', path: '/quienes-somos', changefreq: 'monthly', priority: '0.8' },
  { id: 'register', path: '/registro', changefreq: 'monthly', priority: '0.9' },
  { id: 'register_provider', path: '/registro?role=provider', changefreq: 'monthly', priority: '0.85' },
  { id: 'privacy', path: '/legal/privacidad', changefreq: 'yearly', priority: '0.4' },
  { id: 'terms', path: '/legal/terminos', changefreq: 'yearly', priority: '0.4' },
  { id: 'cookies', path: '/legal/cookies', changefreq: 'yearly', priority: '0.3' }
];

const DISALLOW_PATHS = [
  '/cliente',
  '/proveedor',
  '/tecnico',
  '/admin',
  '/seguimiento',
  '/pagos',
  '/documentos',
  '/aland',
  '/verificar-email',
  '/health'
];

function getRobotsDisallowPaths() {
  const paths = [...DISALLOW_PATHS];
  try {
    const adminPath = require('./appMode').getAdminBasePath();
    // No filtrar el path secreto en robots.txt (lo filtraría = lo revelaría).
    // Solo dejamos /admin como señuelo público.
    if (adminPath === '/admin' && !paths.includes('/admin')) paths.push('/admin');
  } catch (_) { /* ignore */ }
  return paths;
}

function getSiteUrl() {
  const raw = (process.env.APP_URL || company.appUrl || 'http://localhost:3000').trim();
  return raw.replace(/\/+$/, '');
}

function absoluteUrl(pathOrUrl = '/') {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getSiteUrl();
  if (!pathOrUrl || pathOrUrl === '/') return `${base}/`;
  return `${base}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function hreflangUrls(path) {
  const cleanPath = path.split('?')[0] || '/';
  const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  const base = absoluteUrl(cleanPath);
  const joiner = query ? '&' : '?';
  return [
    { lang: 'es', href: absoluteUrl(`${cleanPath}${query}`) },
    { lang: 'en', href: absoluteUrl(`${cleanPath}${query}${query ? '&' : '?'}lang=en`) },
    { lang: 'x-default', href: base }
  ];
}

function pageCopy(pageId, locale) {
  const es = {
    home: {
      title: 'Fandez — Tu hogar y oficina, cuidados con excelencia',
      description: 'Pide servicios a domicilio en Santiago con expertos verificados. Precio claro, seguimiento en vivo y Pasaporte Hogar digital.',
      keywords: 'servicios a domicilio Santiago, técnico verificado, oficinas, hogar, gasfitería, Fandez'
    },
    about: {
      title: 'Quiénes somos — Fandez',
      description: 'Conoce Fandez: plataforma chilena que conecta hogares y oficinas con técnicos y empresas verificadas, con puntualidad, transparencia y trato humano.',
      keywords: 'Fandez Chile, quiénes somos, servicios hogar oficina Santiago'
    },
    register: {
      title: 'Crear cuenta — Fandez',
      description: 'Regístrate como persona o empresa en Fandez para solicitar servicios a domicilio en Santiago con técnicos verificados y RUT validado.',
      keywords: 'registro Fandez, crear cuenta, servicios hogar'
    },
    register_provider: {
      title: 'Inscribirse como socio — Fandez',
      description: 'Empresas, técnicos y profesionales: únete a Fandez, recibe trabajos verificados en tu zona y opera con respaldo legal y tecnológico.',
      keywords: 'socio Fandez, empresa servicios hogar, técnico independiente Chile'
    },
    login: {
      title: 'Iniciar sesión — Fandez',
      description: 'Accede a tu cuenta Fandez para gestionar servicios, historial y perfil.',
      keywords: 'login Fandez, ingresar cuenta'
    },
    privacy: {
      title: 'Política de Privacidad — Fandez',
      description: 'Política de privacidad y protección de datos personales de Fandez conforme a la Ley 21.719 (Chile).',
      keywords: 'privacidad Fandez, Ley 21719, datos personales'
    },
    terms: {
      title: 'Términos y Condiciones — Fandez',
      description: 'Términos y condiciones de uso de la plataforma Fandez para clientes y socios prestadores de servicios.',
      keywords: 'términos Fandez, condiciones uso'
    },
    cookies: {
      title: 'Política de Cookies — Fandez',
      description: 'Información sobre cookies esenciales y opcionales utilizadas por Fandez.',
      keywords: 'cookies Fandez'
    }
  };

  const en = {
    home: {
      title: 'Fandez — Your home and office, cared for with excellence',
      description: 'Book home services in Santiago with verified experts. Clear pricing, live tracking and digital Home Passport.',
      keywords: 'home office services Santiago, verified technician, Fandez Chile'
    },
    about: {
      title: 'About us — Fandez',
      description: 'Meet Fandez: a Chilean platform connecting homes and offices with verified technicians and companies, with punctuality, transparency and human care.',
      keywords: 'Fandez Chile, about us, home office services'
    },
    register: {
      title: 'Create account — Fandez',
      description: 'Sign up as an individual or company on Fandez to request verified home services in Santiago with validated Chilean RUT.',
      keywords: 'Fandez signup, create account'
    },
    register_provider: {
      title: 'Join as a partner — Fandez',
      description: 'Companies, technicians and professionals: join Fandez, receive verified jobs in your area and operate with legal and tech support.',
      keywords: 'Fandez partner, home services company Chile'
    },
    login: {
      title: 'Sign in — Fandez',
      description: 'Sign in to your Fandez account to manage services, history and profile.',
      keywords: 'Fandez login'
    },
    privacy: {
      title: 'Privacy Policy — Fandez',
      description: 'Fandez privacy and personal data protection policy under Chilean Law 21.719.',
      keywords: 'Fandez privacy policy'
    },
    terms: {
      title: 'Terms and Conditions — Fandez',
      description: 'Terms of use for the Fandez platform for clients and service partners.',
      keywords: 'Fandez terms'
    },
    cookies: {
      title: 'Cookie Policy — Fandez',
      description: 'Information about essential and optional cookies used by Fandez.',
      keywords: 'Fandez cookies'
    }
  };

  const bundle = locale === 'en' ? en : es;
  return bundle[pageId] || bundle.home;
}

function buildJsonLd(pageId, locale) {
  const siteUrl = getSiteUrl();
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Fandez',
    legalName: company.name,
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/icons/fandez-v6-512.png'),
      width: 512,
      height: 512
    },
    image: absoluteUrl('/icons/fandez-v6-512.png'),
    email: company.supportEmail,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Santiago',
      addressRegion: 'Región Metropolitana',
      addressCountry: 'CL'
    },
    sameAs: []
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Fandez',
    url: siteUrl,
    inLanguage: ['es-CL', 'en'],
    publisher: { '@type': 'Organization', name: 'Fandez', url: siteUrl }
  };

  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: locale === 'en' ? 'Expert home and office services' : 'Servicio experto para hogares y oficinas',
    provider: { '@type': 'Organization', name: 'Fandez', url: siteUrl },
    areaServed: {
      '@type': 'City',
      name: 'Santiago',
      containedInPlace: { '@type': 'Country', name: 'Chile' }
    },
    serviceType: locale === 'en'
      ? 'Home and office care and maintenance'
      : 'Cuidado y mantenimiento de hogares y oficinas'
  };

  if (pageId === 'home') return [org, website, service];
  if (pageId === 'about') {
    return [org, {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: locale === 'en' ? 'About Fandez' : 'Quiénes somos — Fandez',
      url: absoluteUrl('/quienes-somos'),
      isPartOf: { '@type': 'WebSite', url: siteUrl }
    }];
  }
  return [org];
}

function buildPageMeta(pageId, req, overrides = {}) {
  const locale = req?.locale || 'es';
  const copy = pageCopy(pageId, locale);
  const path = overrides.path || PUBLIC_PAGES.find((p) => p.id === pageId)?.path || req?.path || '/';
  const robots = overrides.robots || (pageId === 'login' ? 'noindex, follow' : 'index, follow');
  const title = overrides.title || copy.title;
  const description = overrides.description || copy.description;

  return {
    pageId,
    title,
    description,
    keywords: copy.keywords,
    canonical: absoluteUrl(overrides.canonicalPath || path),
    ogType: overrides.ogType || 'website',
    ogImage: absoluteUrl(overrides.ogImage || DEFAULT_OG_IMAGE),
    ogLocale: locale === 'en' ? 'en_US' : 'es_CL',
    robots,
    hreflang: hreflangUrls(overrides.canonicalPath || path),
    jsonLd: buildJsonLd(pageId, locale),
    siteName: 'Fandez'
  };
}

function robotsTxt() {
  const siteUrl = getSiteUrl();
  const disallow = getRobotsDisallowPaths().map((p) => `Disallow: ${p}`).join('\n');
  return `# Fandez — robots.txt
User-agent: *
Allow: /
Allow: /favicon.ico
Allow: /favicon.svg
Allow: /favicon.png
Allow: /favicon-16.png
Allow: /favicon-32.png
Allow: /favicon-48.png
Allow: /favicon-96.png
Allow: /icon-192.png
Allow: /icon-512.png
Allow: /apple-touch-icon.png
Allow: /icons/
Allow: /site.webmanifest
Allow: /sw.js
Allow: /offline.html
${disallow}

# Buscadores y asistentes con IA (contenido público)
User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /
Allow: /favicon.ico
Allow: /favicon.png
Allow: /favicon-48.png
Allow: /favicon-96.png
Allow: /icon-192.png
Allow: /apple-touch-icon.png

User-agent: Google-Extended
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function sitemapXml() {
  const siteUrl = getSiteUrl();
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_PAGES.map((page) => {
    const loc = absoluteUrl(page.path);
    const alt = hreflangUrls(page.path).map((row) =>
      `    <xhtml:link rel="alternate" hreflang="${row.lang}" href="${row.href}"/>`
    ).join('\n');
    return `  <url>
    <loc>${loc}</loc>
${alt}
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function llmsTxt(locale = 'es') {
  const siteUrl = getSiteUrl();
  if (locale === 'en') {
    return `# Fandez

> Verified home help in Santiago, Chile — we solve problems on time for households, and open work for companies, technicians and professionals as partners.

Fandez connects clients (individuals and companies) with verified plumbers, electricians, locksmiths and other home service providers. Features include live service tracking, card payments, Home Passport (digital maintenance log), Guardian Mode for families, and partner onboarding for legal entities.

## Public pages

- [Home](${siteUrl}/): Main landing — request home services in Santiago
- [About us](${siteUrl}/quienes-somos): Mission, values and brand story
- [Sign up (client)](${siteUrl}/registro): Individuals or companies requesting services
- [Join as partner](${siteUrl}/registro?role=provider): Register a company, technician or professional
- [Privacy policy](${siteUrl}/legal/privacidad): Law 21.719 (Chile) data protection
- [Terms](${siteUrl}/legal/terminos): Platform terms of use
- [Cookies](${siteUrl}/legal/cookies): Cookie policy

## Services

- Verified technicians at the customer's address
- Plumbing, electrical, locksmithing and related home maintenance
- Coverage by commune in Santiago Metropolitan Region (expanding)
- Partners: companies, technicians and independent professionals

## Contact

- Support: ${company.supportEmail}
- Privacy / DPO: ${company.dpoEmail}
- Website: ${siteUrl}

## Optional

- [Sitemap](${siteUrl}/sitemap.xml)
- [Robots](${siteUrl}/robots.txt)
`;
  }

  return `# Fandez

> Plataforma chilena que soluciona problemas del hogar a tiempo y en forma en Santiago — para familias y para empresas, técnicos y profesionales que quieren generar ingresos como socios.

Fandez conecta clientes (personas y empresas) con gasfiteros, electricistas, cerrajeros y otros técnicos verificados. Incluye seguimiento en tiempo real, pago con tarjeta, Pasaporte Hogar digital, Modo Guardián para familias e inscripción de socios persona jurídica.

## Páginas públicas

- [Inicio](${siteUrl}/): Landing principal — solicitar servicios a domicilio en Santiago
- [Quiénes somos](${siteUrl}/quienes-somos): Misión, valores e historia de la marca
- [Crear cuenta (cliente)](${siteUrl}/registro): Personas naturales o empresas que solicitan servicios
- [Inscribirse como socio](${siteUrl}/registro?role=provider): Empresas, técnicos y profesionales
- [Política de privacidad](${siteUrl}/legal/privacidad): Ley 21.719 Chile
- [Términos y condiciones](${siteUrl}/legal/terminos): Uso de la plataforma
- [Cookies](${siteUrl}/legal/cookies): Política de cookies

## Servicios

- Técnicos verificados en la dirección del cliente
- Gasfitería, electricidad, cerrajería y mantenimiento del hogar
- Cobertura por comuna en Región Metropolitana (en expansión)
- Socios: empresas, técnicos y profesionales independientes

## Contacto

- Soporte: ${company.supportEmail}
- Privacidad / DPD: ${company.dpoEmail}
- Sitio web: ${siteUrl}

## Opcional

- [Sitemap](${siteUrl}/sitemap.xml)
- [Robots](${siteUrl}/robots.txt)
`;
}

module.exports = {
  PUBLIC_PAGES,
  getSiteUrl,
  absoluteUrl,
  buildPageMeta,
  robotsTxt,
  sitemapXml,
  llmsTxt
};
