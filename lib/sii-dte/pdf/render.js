/**
 * Representación impresa (RIMP) Chile — alineada al Manual de Muestras Impresas SII
 * y Res. Ex. SII N° 18/2003 (mod. Res. 22/2016) + Res. 51/2005 (acuse / cedible).
 * Un archivo = un ejemplar (tributario o cedible). Timbre PDF417 del TED.
 */
'use strict';

const bwipjs = require('bwip-js');
const company = require('../../../config/company');
const { getConfig } = require('../config');

/** Texto de destino en copia cedible (zona inferior derecha). */
const LEYENDA_DESTINO_CEDIBLE = 'CEDIBLE';

/**
 * Leyenda comercial habitual de cesión (complementa el acuse Ley 19.983).
 * El SII exige además el texto corto «CEDIBLE» abajo a la derecha.
 */
const LEYENDA_CEDIBLE =
  'CEDIBLE CON SU FIRMA EN REVERSO O EN SU RECIBO DE ENTREGA DE MERCADERÍAS O ' +
  'PRESTACIÓN DE SERVICIOS EN CONFORMIDAD AL ARTÍCULO 4° DE LA LEY N° 19.983';

/** Texto oficial del acuse (Res. Ex. SII N° 51/2005). */
const TEXTO_ACUSE =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) ' +
  'del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de ' +
  'mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).';

/** Factura, FC y liquidación llevan cedible. NC/ND no. */
function supportsCedible(dteType) {
  const t = Number(dteType);
  return t === 33 || t === 43 || t === 46;
}

/**
 * @param {string|null} raw
 * @param {number} dteType
 * @returns {'tributario'|'cedible'}
 */
function normalizeExemplar(raw, dteType) {
  const v = String(raw || 'tributario').trim().toLowerCase();
  const wantsCedible = v === 'cedible' || v === 'copia' || v === 'copia-cedible' || v === 'copia_cedible';
  if (wantsCedible && supportsCedible(dteType)) return 'cedible';
  return 'tributario';
}

async function buildPdf417DataUrl(tedXml) {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'pdf417',
      text: tedXml.replace(/\s+/g, ''),
      scale: 2,
      height: 10,
      includetext: false
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    return null;
  }
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatClp(n) {
  return Math.round(Number(n) || 0).toLocaleString('es-CL');
}

/** RUT chileno con puntos y guión (ej. 78.494.038-1). */
function formatRut(rut) {
  const clean = String(rut || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  if (!clean) return '';
  const [num, dv] = clean.includes('-') ? clean.split('-') : [clean.slice(0, -1), clean.slice(-1)];
  const withDots = String(num || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dv ? `${withDots}-${dv}` : withDots;
}

/** Fecha en español Chile: «19 de Octubre de 2026». */
function formatFechaEmision(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Nombres oficiales SII (solo español, mayúsculas). */
function docTypeLabel(dteType) {
  const t = Number(dteType);
  if (t === 61) return 'NOTA DE CRÉDITO ELECTRÓNICA';
  if (t === 56) return 'NOTA DE DÉBITO ELECTRÓNICA';
  if (t === 46) return 'FACTURA DE COMPRA ELECTRÓNICA';
  if (t === 43) return 'LIQUIDACIÓN FACTURA ELECTRÓNICA';
  if (t === 34) return 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA';
  return 'FACTURA ELECTRÓNICA';
}

function docTypeWords(dteType) {
  const t = Number(dteType);
  if (t === 61) return 'Nota de Crédito Electrónica';
  if (t === 56) return 'Nota de Débito Electrónica';
  if (t === 46) return 'Factura de Compra Electrónica';
  if (t === 43) return 'Liquidación Factura Electrónica';
  if (t === 34) return 'Factura No Afecta o Exenta Electrónica';
  return 'Factura Electrónica';
}

function formatResLine(resolutionNumber, resolutionDate) {
  const n = String(resolutionNumber ?? '0').trim() || '0';
  const year = String(resolutionDate || '').slice(0, 4) || new Date().getUTCFullYear();
  return `Res. ${n} de ${year}`;
}

function lineRows(doc, defaultLine) {
  const lines = doc.meta?.lines?.length
    ? doc.meta.lines
    : [{ name: defaultLine, qty: 1, unitNeto: doc.neto, neto: doc.neto, discountMonto: 0 }];
  return lines.map((l, idx) => {
    const qty = l.qty != null ? Number(l.qty) : 1;
    const unit = l.unitNeto != null
      ? Math.round(Number(l.unitNeto) || 0)
      : (qty ? Math.round((Number(l.neto) || 0) / qty) : 0);
    const disc = Math.max(0, Math.round(Number(l.discountMonto) || 0));
    const subtotal = Math.round(unit * (Number.isFinite(qty) && qty > 0 ? qty : 1));
    const pctDesc = subtotal > 0 && disc > 0
      ? (Math.round((disc / subtotal) * 10000) / 100).toLocaleString('es-CL')
      : '';
    const valor = Math.round(Number(l.neto) != null && Number(l.neto) >= 0
      ? Number(l.neto)
      : Math.max(0, subtotal - disc));
    const qtyLabel = Number.isFinite(qty) ? String(qty) : '1';
    return (
      `<tr>` +
      `<td class="c">${idx + 1}</td>` +
      `<td>${esc(l.name || defaultLine)}</td>` +
      `<td class="n">${esc(qtyLabel)}</td>` +
      `<td class="n">${formatClp(unit)}</td>` +
      `<td class="n">${pctDesc}</td>` +
      `<td class="n">${formatClp(valor)}</td>` +
      `</tr>`
    );
  }).join('');
}

function buildSheetHtml(ctx) {
  const {
    doc,
    exemplar,
    barcode,
    title,
    receptorLabel,
    defaultLine,
    emitterName,
    emitterGiro,
    emitterAddress,
    emitterCommune,
    emitterCity,
    emitterEmail,
    receptorGiro,
    receptorAddress,
    receptorCommune,
    receptorCity,
    receptorPhone,
    fecha,
    refBlock,
    obsBlock,
    dry,
    siiOffice,
    resLine
  } = ctx;

  const isCedible = exemplar === 'cedible';
  const emitterDir = [
    emitterAddress,
    emitterCommune ? `Comuna: ${emitterCommune}` : '',
    emitterCity && emitterCity !== emitterCommune ? emitterCity : ''
  ].filter(Boolean).join(' · ');

  const acuseBlock = isCedible
    ? (
      `<div class="acuse">` +
      `<p class="acuse__title">Acuse de Recibo</p>` +
      `<div class="acuse__grid">` +
      `<div><span>Nombre</span><em></em></div>` +
      `<div><span>RUT</span><em></em></div>` +
      `<div><span>Fecha</span><em></em></div>` +
      `<div><span>Recinto</span><em></em></div>` +
      `<div class="acuse__firma"><span>Firma</span><em></em></div>` +
      `</div>` +
      `<p class="acuse__hint">${esc(TEXTO_ACUSE)}</p>` +
      `<p class="acuse__cesion">${esc(LEYENDA_CEDIBLE)}</p>` +
      `</div>`
    )
    : '';

  return `
  <div class="sheet" data-exemplar="${esc(exemplar)}" lang="es-CL">
    ${dry ? '<p class="banner">Ambiente de certificación / dry-run — no válido como muestra oficial SII</p>' : ''}

    <header class="top">
      <div class="emitter">
        <p class="name">${esc(emitterName)}</p>
        <p class="line"><span class="lbl">Giro:</span> ${esc(emitterGiro)}</p>
        <p class="line"><span class="lbl">Dirección:</span> ${esc(emitterDir)}</p>
        ${emitterEmail ? `<p class="line"><span class="lbl">e-Mail:</span> ${esc(emitterEmail)}</p>` : ''}
      </div>
      <div class="idbox-wrap">
        <div class="idbox">
          <div class="rut">R.U.T.: ${esc(formatRut(doc.emitterRut))}</div>
          <div class="tipo">${esc(title)}</div>
          <div class="folio">N° ${esc(doc.folio)}</div>
        </div>
        <div class="sii">S.I.I. — ${esc(siiOffice)}</div>
      </div>
    </header>

    <p class="fecha">${esc(emitterCity || 'Santiago')}, ${esc(fecha)}</p>

    <section class="receptor">
      <table>
        <tr>
          <td class="lbl">${receptorLabel}:</td>
          <td colspan="3">${esc(doc.receptorName)}</td>
        </tr>
        <tr>
          <td class="lbl">R.U.T.:</td>
          <td>${esc(formatRut(doc.receptorRut))}</td>
          <td class="lbl">Giro:</td>
          <td>${esc(receptorGiro)}</td>
        </tr>
        <tr>
          <td class="lbl">Dirección:</td>
          <td colspan="3">${esc(receptorAddress)}</td>
        </tr>
        <tr>
          <td class="lbl">Comuna:</td>
          <td>${esc(receptorCommune)}</td>
          <td class="lbl">Ciudad:</td>
          <td>${esc(receptorCity)}</td>
        </tr>
        ${receptorPhone
          ? `<tr><td class="lbl">Teléfono:</td><td colspan="3">${esc(receptorPhone)}</td></tr>`
          : ''}
      </table>
    </section>

    ${refBlock}
    ${obsBlock}

    <table class="items">
      <thead>
        <tr>
          <th>N°</th>
          <th>Detalle</th>
          <th>Cantidad</th>
          <th>P. Unitario</th>
          <th>% Desc.</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows(doc, defaultLine)}
        ${Array.from({ length: Math.max(0, 6 - (doc.meta?.lines?.length || 1)) }).map(() =>
          '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'
        ).join('')}
      </tbody>
    </table>

    <div class="foot">
      <div class="timbre">
        ${barcode
          ? `<img alt="Timbre Electrónico SII" src="${barcode}">`
          : `<div class="placeholder">Timbre Electrónico SII<br>(se genera con CAF / firma)</div>`}
        <p class="cap">Timbre Electrónico SII</p>
        <p class="res">${esc(resLine)}</p>
        <p class="verify">Verifique documento: www.sii.cl</p>
      </div>
      <div class="totales">
        <table>
          <tr><td>Monto Neto $</td><td class="v">${formatClp(doc.neto)}</td></tr>
          <tr><td>I.V.A. 19% $</td><td class="v">${formatClp(doc.iva)}</td></tr>
          <tr class="total"><td>Total $</td><td class="v">${formatClp(doc.total)}</td></tr>
        </table>
      </div>
    </div>

    ${acuseBlock}

    ${isCedible
      ? `<p class="destino-cedible">${esc(LEYENDA_DESTINO_CEDIBLE)}</p>`
      : ''}

    <p class="meta no-print">${esc(doc.requestId || '')}${doc.trackId ? ` · Track ${esc(doc.trackId)}` : ''} · ${esc(doc.siiStatus || '')}</p>
  </div>`;
}

async function renderCommissionInvoiceHtml(doc, { tedXml, exemplar: exemplarRaw } = {}) {
  const cfg = getConfig();
  const barcode = tedXml ? await buildPdf417DataUrl(tedXml) : null;
  const t = Number(doc.dteType);
  const exemplar = normalizeExemplar(exemplarRaw, t);
  const isNc = t === 61;
  const isPurchase = t === 46;
  const title = docTypeLabel(t);
  const receptorLabel = isPurchase ? 'Señor(es) / Vendedor' : 'Señor(es)';
  const defaultLine = isNc
    ? 'Nota de crédito'
    : (isPurchase ? 'Compra de chatarra / materiales' : 'Servicios de intermediación');

  const emitterName = doc.meta?.emitterName || cfg.emitterName || company.legalName || company.name || 'Fandez';
  const emitterGiro = doc.meta?.emitterGiro || cfg.emitterGiro || 'Intermediación de servicios del hogar';
  const emitterAddress = doc.meta?.emitterAddress || cfg.emitterAddress || company.address || 'Santiago';
  const emitterCommune = doc.meta?.emitterCommune || cfg.emitterCommune || 'Santiago';
  const emitterCity = doc.meta?.emitterCity || cfg.emitterCity || 'Santiago';
  const emitterEmail = doc.meta?.emitterEmail || cfg.emitterEmail || company.dteEmail || '';
  const receptorGiro = doc.meta?.receptorGiro || '—';
  const receptorAddress = doc.meta?.receptorAddress || '—';
  const receptorCommune = doc.meta?.receptorCommune || '—';
  const receptorCity = doc.meta?.receptorCity || '—';
  const receptorPhone = doc.meta?.receptorPhone || doc.meta?.receptorEmail || doc.meta?.partnerEmail || '';
  const fecha = formatFechaEmision(doc.signedAt || doc.createdAt);
  const dry = Boolean(doc.meta?.dryRun);
  const siiOffice = (doc.environment === 'production' ? 'SANTIAGO' : 'SANTIAGO · CERTIFICACIÓN').toUpperCase();
  const resLine = formatResLine(
    doc.meta?.resolutionNumber ?? cfg.emitterResolutionNumber,
    doc.meta?.resolutionDate ?? cfg.emitterResolutionDate
  );

  const ref = doc.meta?.reference;
  const setCase = doc.meta?.setCase;
  let refBlock = '';
  if (ref || setCase) {
    const parts = [];
    if (setCase?.razonRef || (typeof setCase === 'string' && setCase)) {
      parts.push(`Set de pruebas: ${esc(setCase.razonRef || setCase)}`);
    }
    if (ref) {
      parts.push(
        `Documento de referencia: ${esc(docTypeWords(ref.dteType || 33))} N° ${esc(ref.folio)}` +
        (ref.date ? ` · Fecha ${esc(ref.date)}` : '') +
        (ref.code != null ? ` · Cod. Ref. ${esc(ref.code)}` : '') +
        (ref.reason ? ` · ${esc(ref.reason)}` : '')
      );
    }
    refBlock = `<section class="ref"><p>${parts.join('<br>')}</p></section>`;
  }

  const obs = doc.meta?.observation ? String(doc.meta.observation) : '';
  const obsBlock = obs
    ? `<section class="obs"><p><strong>Observación:</strong> ${esc(obs)}</p></section>`
    : '';

  const sheet = buildSheetHtml({
    doc,
    exemplar,
    barcode,
    title,
    receptorLabel,
    defaultLine,
    emitterName,
    emitterGiro,
    emitterAddress,
    emitterCommune,
    emitterCity,
    emitterEmail,
    receptorGiro,
    receptorAddress,
    receptorCommune,
    receptorCity,
    receptorPhone,
    fecha,
    refBlock,
    obsBlock,
    dry,
    siiOffice,
    resLine
  });

  const titleSuffix = exemplar === 'cedible' ? ' · Cedible' : ' · Tributario';
  const defaultEmail = esc(
    doc.meta?.receptorEmail || doc.meta?.partnerEmail || ''
  );
  const withCedible = supportsCedible(t);
  const toolbar = buildViewerToolbar({
    docId: doc.id,
    folio: doc.folio,
    exemplar,
    withCedible,
    defaultEmail
  });

  return `<!DOCTYPE html>
<html lang="es-CL"><head><meta charset="utf-8">
<title>${esc(title)} N° ${esc(doc.folio)}${esc(titleSuffix)}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10px;
    padding-top: 64px;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #e8eef5;
    font-size: 11px;
  }
  .sheet { background: #fff; }
  .viewer-bar {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding: 10px 14px;
    background: #0f172a;
    color: #f8fafc;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.25);
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  }
  .viewer-bar__brand {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .viewer-bar__brand span { color: #94a3b8; font-weight: 500; margin-left: 6px; }
  .viewer-bar__actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .viewer-bar button, .viewer-bar a.btn {
    appearance: none;
    border: 0;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    color: #0f172a;
    background: #f8fafc;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .viewer-bar button.primary, .viewer-bar a.btn.primary {
    background: #2563eb;
    color: #fff;
  }
  .viewer-bar button.ghost, .viewer-bar a.btn.ghost {
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #334155;
  }
  .viewer-bar button.active,
  .viewer-bar a.btn.active {
    background: #22c55e;
    color: #052e16;
    border-color: #22c55e;
  }
  .viewer-mail {
    display: none;
    width: 100%;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .viewer-mail.open { display: flex; }
  .viewer-mail input[type="email"] {
    flex: 1 1 220px;
    min-width: 180px;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #f8fafc;
    padding: 8px 10px;
    font-size: 13px;
  }
  .viewer-mail__msg { font-size: 12px; color: #94a3b8; width: 100%; }
  .viewer-mail__msg.ok { color: #86efac; }
  .viewer-mail__msg.err { color: #fca5a5; }
  .sheet {
    max-width: 215mm;
    margin: 0 auto;
    border: 1px solid #111;
    padding: 12px 14px 16px;
    min-height: 250mm;
  }
  .banner {
    text-align: center;
    font-size: 10px;
    color: #475569;
    margin: 0 0 8px;
    border: 1px dashed #94a3b8;
    padding: 4px;
  }
  .top {
    display: grid;
    grid-template-columns: 1fr 170px;
    gap: 14px;
    align-items: start;
    margin-bottom: 8px;
  }
  .emitter .name {
    color: #c1121f;
    font-weight: 700;
    font-size: 14px;
    margin: 0 0 6px;
    text-transform: uppercase;
  }
  .emitter .line { margin: 2px 0; color: #0b3d91; font-size: 11px; line-height: 1.35; }
  .emitter .lbl { font-weight: 700; color: #0b3d91; }
  .idbox-wrap { text-align: center; }
  .idbox {
    border: 2.5px solid #c1121f;
    padding: 8px 6px;
    color: #c1121f;
    font-weight: 700;
    line-height: 1.3;
    min-height: 72px;
  }
  .idbox .rut { font-size: 12px; }
  .idbox .tipo { font-size: 11px; margin-top: 4px; text-transform: uppercase; }
  .idbox .folio { font-size: 14px; margin-top: 4px; }
  .idbox-wrap .sii {
    color: #c1121f;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.04em;
    margin: 5px 0 0;
  }
  .fecha {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    color: #0b3d91;
  }
  .receptor {
    border: 1px solid #111;
    padding: 6px 8px;
    margin-bottom: 8px;
  }
  .receptor table { width: 100%; border-collapse: collapse; }
  .receptor td { padding: 2px 4px; vertical-align: top; color: #0b3d91; font-size: 11px; }
  .receptor .lbl { font-weight: 700; width: 5.5rem; white-space: nowrap; color: #111; }
  .ref, .obs {
    margin: 0 0 8px;
    font-size: 10px;
    color: #334155;
    border-left: 2px solid #cbd5e1;
    padding-left: 8px;
  }
  .items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }
  .items th, .items td {
    border: 1px solid #111;
    padding: 4px 5px;
    font-size: 10px;
    color: #0b3d91;
  }
  .items th {
    font-weight: 700;
    text-align: center;
    color: #111;
    background: #fff;
  }
  .items td.c { text-align: center; width: 2.2rem; }
  .items td.n { text-align: right; white-space: nowrap; }
  .items tbody tr { height: 20px; }
  .foot {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 16px;
    align-items: end;
    margin-top: 4px;
    padding-left: 8mm; /* ≥ 2 cm desde borde izquierdo del papel (margen página + esto) */
  }
  .timbre { text-align: left; max-width: 9cm; }
  .timbre img {
    display: block;
    max-width: 9cm;
    width: 100%;
    height: auto;
    min-height: 2cm;
    image-rendering: pixelated;
  }
  .timbre .cap {
    margin: 4px 0 0;
    font-size: 10px;
    font-weight: 700;
    color: #111;
  }
  .timbre .res, .timbre .verify {
    margin: 1px 0 0;
    font-size: 9px;
    color: #111;
  }
  .timbre .placeholder {
    border: 1px dashed #94a3b8;
    min-height: 2.2cm;
    min-width: 5cm;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    font-size: 10px;
    padding: 10px;
    text-align: center;
  }
  .totales {
    border: 1px solid #111;
    padding: 6px 8px;
  }
  .totales table { width: 100%; border-collapse: collapse; }
  .totales td {
    padding: 2px 0;
    color: #0b3d91;
    font-size: 11px;
  }
  .totales td.v { text-align: right; font-weight: 700; }
  .totales tr.total td {
    font-size: 12px;
    font-weight: 700;
    padding-top: 5px;
    border-top: 1px solid #111;
    color: #111;
  }
  .acuse {
    margin-top: 12px;
    border: 1px solid #111;
    padding: 8px 10px;
  }
  .acuse__title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    color: #111;
    text-transform: uppercase;
  }
  .acuse__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
  }
  .acuse__grid > div span {
    display: block;
    font-size: 9px;
    font-weight: 700;
    color: #111;
  }
  .acuse__grid > div em {
    display: block;
    border-bottom: 1px solid #64748b;
    min-height: 16px;
    margin-top: 2px;
    font-style: normal;
  }
  .acuse__firma { grid-column: 1 / -1; }
  .acuse__firma em { min-height: 32px; }
  .acuse__hint {
    margin: 8px 0 0;
    font-size: 8px;
    color: #111;
    line-height: 1.35;
  }
  .acuse__cesion {
    margin: 6px 0 0;
    font-size: 8px;
    font-weight: 700;
    color: #111;
    text-align: center;
    line-height: 1.3;
    text-transform: uppercase;
  }
  .destino-cedible {
    margin: 10px 0 0;
    text-align: right;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #111;
  }
  .meta {
    margin-top: 10px;
    font-size: 9px;
    color: #64748b;
    text-align: center;
  }
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { border: none; max-width: none; min-height: auto; }
    .no-print, .meta, .viewer-bar { display: none !important; }
  }
</style>
</head>
<body>
  ${toolbar}
  ${sheet}
  <script>
  (function () {
    var bar = document.getElementById('dteViewerBar');
    if (!bar) return;
    var docId = bar.getAttribute('data-doc-id');
    var exemplar = bar.getAttribute('data-exemplar') || 'tributario';
    var backBtn = document.getElementById('dteBackBtn');
    var printBtn = document.getElementById('dtePrintBtn');
    var mailToggle = document.getElementById('dteMailToggle');
    var mailPanel = document.getElementById('dteMailPanel');
    var mailSend = document.getElementById('dteMailSend');
    var mailInput = document.getElementById('dteMailTo');
    var mailMsg = document.getElementById('dteMailMsg');

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        var ref = document.referrer || '';
        if (ref && ref.indexOf(window.location.origin) === 0) {
          window.location.href = ref;
          return;
        }
        window.location.href = '/admin?tab=facturas-emitidas';
      });
    }
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    if (mailToggle && mailPanel) {
      mailToggle.addEventListener('click', function () {
        mailPanel.classList.toggle('open');
        if (mailPanel.classList.contains('open') && mailInput) mailInput.focus();
      });
    }
    if (mailSend && mailInput) {
      mailSend.addEventListener('click', async function () {
        var to = (mailInput.value || '').trim();
        if (!to) {
          if (mailMsg) { mailMsg.textContent = 'Indica un correo.'; mailMsg.className = 'viewer-mail__msg err'; }
          return;
        }
        mailSend.disabled = true;
        if (mailMsg) { mailMsg.textContent = 'Enviando…'; mailMsg.className = 'viewer-mail__msg'; }
        try {
          var res = await fetch('/documentos/tributarios/sii/' + encodeURIComponent(docId) + '/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: to, exemplar: exemplar, includeXml: true })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
          if (mailMsg) {
            mailMsg.textContent = data.demo
              ? 'Correo registrado (modo demo SMTP).'
              : ('Enviado a ' + (data.to || to));
            mailMsg.className = 'viewer-mail__msg ok';
          }
        } catch (err) {
          if (mailMsg) {
            mailMsg.textContent = (err && err.message) || 'Error al enviar';
            mailMsg.className = 'viewer-mail__msg err';
          }
        } finally {
          mailSend.disabled = false;
        }
      });
    }
  })();
  </script>
</body></html>`;
}

function buildViewerToolbar({ docId, folio, exemplar, withCedible, defaultEmail }) {
  const id = esc(docId);
  const tribHref = `/documentos/tributarios/sii/${id}?ejemplar=tributario`;
  const cedHref = `/documentos/tributarios/sii/${id}?ejemplar=cedible`;
  const xmlHref = `/documentos/tributarios/sii/${id}/xml`;
  const isCedible = exemplar === 'cedible';
  return `
  <div class="viewer-bar no-print" id="dteViewerBar" data-doc-id="${id}" data-exemplar="${esc(exemplar)}">
    <div class="viewer-bar__brand" style="display:flex;align-items:center;gap:10px">
      <button type="button" class="ghost" id="dteBackBtn" title="Volver">← Volver</button>
      <div>
        Fandez DTE
        <span>Folio ${esc(folio)} · ${isCedible ? 'Cedible' : 'Tributario'}</span>
      </div>
    </div>
    <div class="viewer-bar__actions">
      <button type="button" class="primary" id="dtePrintBtn">Imprimir / Guardar PDF</button>
      <a class="btn" href="${xmlHref}" download>Descargar XML</a>
      <a class="btn ghost${isCedible ? '' : ' active'}" href="${tribHref}">Tributario</a>
      ${withCedible
        ? `<a class="btn ghost${isCedible ? ' active' : ''}" href="${cedHref}">Cedible</a>`
        : ''}
      <button type="button" class="ghost" id="dteMailToggle">Enviar por correo</button>
    </div>
    <div class="viewer-mail" id="dteMailPanel">
      <input type="email" id="dteMailTo" placeholder="correo@empresa.cl" value="${defaultEmail || ''}" autocomplete="email">
      <button type="button" class="primary" id="dteMailSend">Enviar</button>
      <p class="viewer-mail__msg" id="dteMailMsg">Incluye enlaces al documento y el XML adjunto.</p>
    </div>
  </div>`;
}

module.exports = {
  renderCommissionInvoiceHtml,
  buildPdf417DataUrl,
  supportsCedible,
  normalizeExemplar,
  LEYENDA_CEDIBLE,
  LEYENDA_DESTINO_CEDIBLE,
  TEXTO_ACUSE,
  docTypeLabel,
  formatResLine
};
