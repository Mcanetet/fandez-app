/**
 * Plantilla HTML de correo Fandez (transaccional + marketing).
 * Tablas + CSS inline para Gmail, Apple Mail, Outlook y clientes móviles.
 */
const company = require('../config/company');

const BRAND = {
  accent: '#C45C14',
  accentSoft: '#F6E6D4',
  accentStrong: '#A84E10',
  text: '#1A1814',
  muted: '#6B635A',
  border: '#E6E0D8',
  bg: '#F3EEE8',
  card: '#FFFFFF',
  success: '#2F6B4F',
  successSoft: '#E4F0EC',
  warning: '#B47814',
  warningSoft: '#F8F0DE',
  danger: '#B83A2E',
  dangerSoft: '#F8E8E6'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appBaseUrl() {
  return String(company.appUrl || 'https://www.fandez.cl').replace(/\/$/, '');
}

function logoUrl() {
  return `${appBaseUrl()}/icons/fandez-v11-192.png`;
}

function paragraphs(text) {
  if (Array.isArray(text)) {
    return text.filter(Boolean).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.text}">${escapeHtml(p)}</p>`).join('');
  }
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.text}">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function toneColors(tone = 'accent') {
  if (tone === 'success') return { fg: BRAND.success, bg: BRAND.successSoft, border: '#C5D9CF' };
  if (tone === 'warning') return { fg: BRAND.warning, bg: BRAND.warningSoft, border: '#E8D9B0' };
  if (tone === 'danger') return { fg: BRAND.danger, bg: BRAND.dangerSoft, border: '#E8C5C1' };
  return { fg: BRAND.accent, bg: BRAND.accentSoft, border: '#E8C9A8' };
}

function button({ href, label, variant = 'primary' }) {
  if (!href || !label) return '';
  const primary = variant !== 'secondary';
  const bg = primary ? BRAND.accent : BRAND.card;
  const color = primary ? '#FFFFFF' : BRAND.accent;
  const border = primary ? BRAND.accent : BRAND.accent;
  return `
    <a href="${escapeHtml(href)}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700;font-size:14px;border:1.5px solid ${border};mso-padding-alt:0;line-height:1.2">${escapeHtml(label)}</a>
  `.trim();
}

function ctaRow(cta) {
  if (!cta) return '';
  const items = Array.isArray(cta) ? cta.filter(Boolean) : [cta];
  if (!items.length) return '';
  const cells = items.map((item, idx) => {
    const style = idx === 0 ? '' : 'padding-left:10px;';
    return `<td style="${style}padding:0 0 10px">${button(item)}</td>`;
  }).join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px">
      <tr>${cells}</tr>
    </table>
  `;
}

function detailsCard(details = []) {
  const rows = (details || []).filter((d) => d && (d.label || d.value));
  if (!rows.length) return '';
  const htmlRows = rows.map((row, i) => {
    const border = i === rows.length - 1 ? 'none' : `1px solid ${BRAND.border}`;
    return `
      <tr>
        <td style="padding:11px 0;border-bottom:${border};width:42%;vertical-align:top;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};font-weight:600">${escapeHtml(row.label)}</td>
        <td style="padding:11px 0;border-bottom:${border};vertical-align:top;font-size:14px;color:${BRAND.text};font-weight:600;text-align:right">${escapeHtml(row.value)}</td>
      </tr>
    `;
  }).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:14px">
      <tr>
        <td style="padding:6px 16px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${htmlRows}</table>
        </td>
      </tr>
    </table>
  `;
}

function highlightBlock(highlight) {
  if (!highlight?.value) return '';
  const colors = toneColors(highlight.tone);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${colors.bg};border:1px solid ${colors.border};border-radius:14px">
      <tr>
        <td style="padding:16px 18px;text-align:center">
          ${highlight.label ? `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.fg};font-weight:700;margin-bottom:6px">${escapeHtml(highlight.label)}</div>` : ''}
          <div style="font-size:28px;line-height:1.15;font-weight:800;color:${colors.fg}">${escapeHtml(highlight.value)}</div>
          ${highlight.sub ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted}">${escapeHtml(highlight.sub)}</div>` : ''}
        </td>
      </tr>
    </table>
  `;
}

function codeBlock(code) {
  if (!code) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px">
      <tr>
        <td style="padding:18px;text-align:center;background:${BRAND.accentSoft};border:1px dashed ${BRAND.accent};border-radius:14px">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.accentStrong};font-weight:700;margin-bottom:8px">Código</div>
          <div style="font-size:32px;letter-spacing:0.28em;font-weight:800;color:${BRAND.accent};font-family:Georgia,'Times New Roman',serif">${escapeHtml(code)}</div>
        </td>
      </tr>
    </table>
  `;
}

function headerHtml() {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:22px 28px 16px;border-bottom:1px solid ${BRAND.border}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;padding-right:12px">
                <img src="${logoUrl()}" width="40" height="40" alt="Fandez" style="display:block;border:0;border-radius:10px;width:40px;height:40px">
              </td>
              <td style="vertical-align:middle">
                <div style="font-size:20px;font-weight:800;color:${BRAND.text};letter-spacing:-0.02em;line-height:1">Fandez</div>
                <div style="font-size:11px;color:${BRAND.muted};margin-top:3px;letter-spacing:0.06em;text-transform:uppercase">Servicios a domicilio</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="height:4px;line-height:4px;font-size:0;background:${BRAND.accent}">&nbsp;</td>
      </tr>
    </table>
  `;
}

function footerHtml({ supportHint = true } = {}) {
  const wa = company.whatsappLink('Hola Fandez, necesito ayuda con un correo que recibí.');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:20px 28px 8px;border-top:1px solid ${BRAND.border}">
          ${supportHint ? `
          <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${BRAND.muted}">
            ¿Necesitas ayuda? Escríbenos a
            <a href="mailto:${escapeHtml(company.supportEmail)}" style="color:${BRAND.accent};font-weight:600;text-decoration:none">${escapeHtml(company.supportEmail)}</a>
            o por
            <a href="${escapeHtml(wa)}" style="color:${BRAND.accent};font-weight:600;text-decoration:none">WhatsApp</a>.
          </p>` : ''}
          <p style="margin:0 0 6px;font-size:12px;line-height:1.45;color:${BRAND.muted}">
            <strong style="color:${BRAND.text}">${escapeHtml(company.name)}</strong><br>
            ${escapeHtml(company.address)} · RUT ${escapeHtml(company.rut)}
          </p>
          <p style="margin:0 0 4px;font-size:11px;line-height:1.4;color:#9A928A">
            <a href="${escapeHtml(appBaseUrl())}" style="color:${BRAND.muted};text-decoration:none">${escapeHtml(appBaseUrl().replace(/^https?:\/\//, ''))}</a>
            ·
            <a href="${escapeHtml(appBaseUrl())}/legal/privacidad" style="color:${BRAND.muted};text-decoration:none">Privacidad</a>
            ·
            <a href="${escapeHtml(appBaseUrl())}/legal/terminos" style="color:${BRAND.muted};text-decoration:none">Términos</a>
          </p>
          <p style="margin:10px 0 0;font-size:10px;line-height:1.4;color:#A8A29A">
            Este mensaje es informativo. Si no reconoces esta actividad, contáctanos de inmediato.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 22px">
          <div style="height:1px;background:${BRAND.border};margin:10px 0 12px"></div>
          <p style="margin:0;font-size:10px;color:#B0A89F;text-align:center">© ${new Date().getFullYear()} Fandez · Hecho en Chile</p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Envuelve cualquier cuerpo HTML en el documento branded Fandez.
 */
function wrapHtmlDocument(bodyHtml, { title = 'Fandez', preheader = '', supportHint = true } = {}) {
  const inner = String(bodyHtml || '').trim();
  if (/<html[\s>]/i.test(inner)) return inner;

  const preview = escapeHtml(preheader || title || 'Fandez');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${preview}${'&nbsp;'.repeat(40)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden">
          <tr><td>${headerHtml()}</td></tr>
          <tr>
            <td style="padding:24px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.text}">
              ${inner}
            </td>
          </tr>
          <tr><td>${footerHtml({ supportHint })}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plantilla transaccional completa (documento HTML listo para enviar).
 */
function transactional({
  title = 'Fandez',
  preheader = '',
  eyebrow = '',
  heading = '',
  greeting = '',
  intro = '',
  highlight = null,
  code = '',
  details = [],
  bodyHtml = '',
  cta = null,
  note = '',
  supportHint = true
} = {}) {
  const content = `
    ${eyebrow ? `<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.accent};font-weight:700">${escapeHtml(eyebrow)}</p>` : ''}
    ${heading ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:800;color:${BRAND.text};letter-spacing:-0.02em">${escapeHtml(heading)}</h1>` : ''}
    ${greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${BRAND.text}">${escapeHtml(greeting)}</p>` : ''}
    ${paragraphs(intro)}
    ${highlightBlock(highlight)}
    ${codeBlock(code)}
    ${detailsCard(details)}
    ${bodyHtml || ''}
    ${ctaRow(cta)}
    ${note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(note)}</p>` : ''}
  `;

  return wrapHtmlDocument(content, { title, preheader: preheader || heading || title, supportHint });
}

/**
 * Convierte texto plano a un cuerpo HTML mínimo (para mails sin plantilla rica).
 */
function plainTextToBody(text) {
  return paragraphs(text);
}

module.exports = {
  BRAND,
  escapeHtml,
  appBaseUrl,
  logoUrl,
  button,
  detailsCard,
  highlightBlock,
  codeBlock,
  wrapHtmlDocument,
  transactional,
  plainTextToBody
};
