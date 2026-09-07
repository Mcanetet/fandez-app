/**
 * Identidad de marca + rol de Florencia (diseño + marketing + UX).
 * Logo oficial: isotipo contorno “plunger/infinito” #C45C14 (manual v3 / brand-01).
 * NUNCA usar el isotipo inventado de “dos cabezas”.
 */
const path = require('path');

const BRAND = {
  name: 'Fandez',
  accent: '#C45C14',
  accentSoft: '#E8A06A',
  ink: '#1A1814',
  cream: '#F7F3EE',
  paper: '#FFFCF8',
  muted: '#6B6560',
  black: '#0B0A09',
  white: '#FFFFFF',
  /** Isotipo SVG oficial (sin fondo) */
  isotipoSvg: path.join(__dirname, '../../public/brand/fandez-01-contorno-isotipo.svg'),
  isotipoPng: path.join(__dirname, '../../public/brand/fandez-01-contorno-isotipo.png'),
  lockupHorizontal: path.join(__dirname, '../../public/brand/fandez-01-contorno-horizontal.png'),
  lockupStacked: path.join(__dirname, '../../public/brand/fandez-01-contorno-con-marca.png'),
  fontUnbounded: path.join(__dirname, '../../public/fonts/unbounded-700.woff2'),
  ctaPartner: 'Quiero ser socio',
  linkPartner: 'https://fandez.cl/registro?role=provider',
  taglinePartner: 'Pedidos listos. Tú eliges.',
  marketLine: 'Gasfitería, electricidad y más · Santiago'
};

const FLORENCIA_PERSONA = `Eres Florencia, Gerente de Marketing de Fandez y diseñadora gráfica senior con más de 20 años de experiencia.
También dominas marketing digital (Meta Ads, orgánicos IG/TikTok/LinkedIn) y UX/UI de producto.

Cómo trabajas:
- Piensas en sistemas visuales, no en posts sueltos: jerarquía, ritmo, CTA único, accesibilidad.
- Identidad Fandez: isotipo oficial de contorno ámbar (#C45C14) tipo destapador/infinito + wordmark “Fandez” en Unbounded.
- NUNCA inventes otro logo (prohibido el de “dos cabezas” u otros pictogramas de personas).
- Español de Chile, tono cercano y concreto. Sin humo (“gana millones”, “cobras en un minuto”).
- Socios: demanda calificada, tú eliges, activación guiada 24–72 h.
- Nada se publica sin aprobación humana.
- En escenas fotográficas IA: sin logos ni tipografía (el logo oficial se aplica después en composición).
- En piezas de campaña plantilla: usa SOLO el logo oficial Fandez.`;

const FLORENCIA_IMAGE_RULES = `REGLAS VISUALES OBLIGATORIAS (Florencia · 20+ años diseño):
- Escena fotográfica realista, limpia, confiable; atmósfera hogar/oficio en Santiago.
- Paleta de apoyo: ámbar #C45C14, tinta #1A1814, crema #F7F3EE, blanco.
- PROHIBIDO: cualquier logo, marca, watermark, tipografía, letras, números, carteles o badges en la foto.
- PROHIBIDO: inventar el logo de Fandez o el isotipo de “dos personas / dos cabezas”.
- El logo oficial se estampa después en composición (no lo dibujes).
- Composición con espacio seguro superior/inferior para overlay de marca.`;

const PLUNGER_PATH =
  'M60 22 C78 22 92 34 94 50 C95 58 92 66 84 70 C98 74 108 84 108 96 C108 112 86 122 60 122 C34 122 12 112 12 96 C12 84 22 74 36 70 C28 66 25 58 26 50 C28 34 42 22 60 22 Z';

function isotipoSvgMarkup({ stroke = BRAND.accent, size = 120 } = {}) {
  const vbW = 120;
  const vbH = 130;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round((size * vbH) / vbW)}" viewBox="0 0 ${vbW} ${vbH}" fill="none">
  <path fill="none" stroke="${stroke}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER_PATH}"/>
</svg>`;
}

module.exports = {
  BRAND,
  FLORENCIA_PERSONA,
  FLORENCIA_IMAGE_RULES,
  PLUNGER_PATH,
  isotipoSvgMarkup
};
