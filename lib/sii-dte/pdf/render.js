/**
 * Representación impresa (RIMP) estilo factura electrónica SII Chile.
 * Un archivo = un ejemplar (tributario o cedible). HTML imprimible + PDF417 del TED.
 */
'use strict';

const bwipjs = require('bwip-js');
const company = require('../../../config/company');

/** Leyenda oficial de cesión de crédito (Art. 4° Ley 19.983). */
const LEYENDA_CEDIBLE =
  'CEDIBLE CON SU FIRMA EN REVERSO O EN SU RECIBO DE ENTREGA DE MERCADERÍAS O ' +
  'PRESTACIÓN DE SERVICIOS EN CONFORMIDAD AL ARTÍCULO 4° DE LA LEY N° 19.983';

/** Facturas de venta / liquidación: llevan ejemplar cedible. NC y FC solo tributario. */
function supportsCedible(dteType) {
  const t = Number(dteType);
  return t === 33 || t === 43;
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

function formatRut(rut) {
  const clean = String(rut || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  if (!clean) return '';
  const [num, dv] = clean.includes('-') ? clean.split('-') : [clean.slice(0, -1), clean.slice(-1)];
  const withDots = String(num || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dv ? `${withDots}-${dv}` : withDots;
}

function formatFechaEmision(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} del ${d.getUTCFullYear()}`;
}

function docTypeLabel(dteType) {
  const t = Number(dteType);
  if (t === 61) return 'NOTA DE CREDITO ELECTRONICA';
  if (t === 46) return 'FACTURA DE COMPRA ELECTRONICA';
  if (t === 43) return 'LIQUIDACION-FACTURA ELECTRONICA';
  return 'FACTURA ELECTRONICA';
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
    const qtyLabel = `${Number.isFinite(qty) ? qty : 1} u`;
    return (
      `<tr>` +
      `<td class="c">${idx + 1}</td>` +
      `<td>${esc(l.name || defaultLine)}</td>` +
      `<td class="n">${esc(qtyLabel)}</td>` +
      `<td class="n">${formatClp(unit)}</td>` +
      `<td class="n"></td>` +
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
    receptorGiro,
    receptorAddress,
    receptorCommune,
    receptorCity,
    receptorEmail,
    fecha,
    refRow,
    obsRow,
    dry,
    siiOffice,
    pageBreak
  } = ctx;

  const isCedible = exemplar === 'cedible';

  /** Pie típico Chile: “COPIA CEDIBLE” + leyenda debajo del timbre/totales. */
  const footerBlock = isCedible
    ? (
      `<div class="cedible">` +
      `<p class="cedible__stamp">COPIA CEDIBLE</p>` +
      `<p class="cedible__leyenda">${esc(LEYENDA_CEDIBLE)}</p>` +
      `<div class="acuse">` +
      `<p class="acuse__title">Acuse de recibo</p>` +
      `<div class="acuse__grid">` +
      `<div><span>Nombre</span><em></em></div>` +
      `<div><span>R.U.T.</span><em></em></div>` +
      `<div><span>Fecha</span><em></em></div>` +
      `<div><span>Recinto</span><em></em></div>` +
      `<div class="acuse__firma"><span>Firma</span><em></em></div>` +
      `</div>` +
      `<p class="acuse__hint">El pago del presente documento se entiende hecho al firmante del recibo, ` +
      `quien se entiende el último tenedor del mismo. El firmante certifica que la recepción ` +
      `de mercaderías o prestación de servicios ha sido efectuada a su entera satisfacción.</p>` +
      `</div></div>`
    )
    : `<p class="tributario-foot">EJEMPLAR TRIBUTARIO</p>`;

  return `
  <div class="sheet${pageBreak ? ' sheet--break' : ''}" data-exemplar="${esc(exemplar)}">
    ${dry ? '<p class="banner">Documento Electrónico · Ambiente de certificación / dry-run</p>' : ''}
    <div class="top">
      <div class="emitter">
        <p class="name">${esc(emitterName)}</p>
        <p class="line">Giro: ${esc(emitterGiro)}</p>
        <p class="line">${esc(emitterAddress)}${emitterCommune || emitterCity ? ` — ${esc([emitterCommune, emitterCity].filter(Boolean).join(', '))}` : ''}</p>
      </div>
      <div class="idbox-wrap">
        <div class="idbox">
          <div class="rut">R.U.T.: ${esc(formatRut(doc.emitterRut))}</div>
          <div class="tipo">${esc(title)}</div>
          <div class="folio">Nº ${esc(doc.folio)}</div>
        </div>
        <div class="sii">S.I.I. — ${esc(siiOffice)}</div>
        <div class="fecha">Fecha Emisión: ${esc(fecha)}</div>
      </div>
    </div>

    <div class="receptor">
      <table>
        <tr><td class="lbl">${receptorLabel}:</td><td colspan="3">${esc(doc.receptorName)}</td></tr>
        <tr><td class="lbl">R.U.T.:</td><td>${esc(formatRut(doc.receptorRut))}</td><td class="lbl">GIRO:</td><td>${esc(receptorGiro)}</td></tr>
        <tr><td class="lbl">DIRECCION:</td><td colspan="3">${esc(receptorAddress)}</td></tr>
        <tr>
          <td class="lbl">COMUNA:</td><td>${esc(receptorCommune)}</td>
          <td class="lbl">CIUDAD:</td><td>${esc(receptorCity)}</td>
        </tr>
        <tr><td class="lbl">CONTACTO:</td><td colspan="3">${esc(receptorEmail)}</td></tr>
      </table>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Codigo</th>
          <th>Descripcion</th>
          <th>Cantidad</th>
          <th>Precio</th>
          <th>%Impto Adic.</th>
          <th>%Desc.</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows(doc, defaultLine)}
        ${refRow}
        ${obsRow}
        ${Array.from({ length: Math.max(0, 6 - (doc.meta?.lines?.length || 1)) }).map(() =>
          '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
        ).join('')}
      </tbody>
    </table>

    <div class="foot">
      <div class="timbre">
        ${barcode
          ? `<img alt="Timbre Electrónico SII" src="${barcode}"><p class="cap">Timbre Electrónico SII</p><p class="verify">Verifique documento: www.sii.cl</p>`
          : `<div class="placeholder">Timbre Electrónico SII<br>(se genera con CAF / firma)</div><p class="verify">Verifique documento: www.sii.cl</p>`}
      </div>
      <div class="totales">
        <table>
          <tr><td>MONTO NETO $</td><td class="v">${formatClp(doc.neto)}</td></tr>
          <tr><td>I.V.A. 19% $</td><td class="v">${formatClp(doc.iva)}</td></tr>
          <tr class="total"><td>TOTAL $</td><td class="v">${formatClp(doc.total)}</td></tr>
        </table>
      </div>
    </div>
    ${footerBlock}
    <p class="meta">${esc(doc.requestId || '')}${doc.trackId ? ` · Track ${esc(doc.trackId)}` : ''} · ${esc(doc.siiStatus || '')}</p>
  </div>`;
}

async function renderCommissionInvoiceHtml(doc, { tedXml, exemplar: exemplarRaw } = {}) {
  const barcode = tedXml ? await buildPdf417DataUrl(tedXml) : null;
  const t = Number(doc.dteType);
  const exemplar = normalizeExemplar(exemplarRaw, t);
  const isNc = t === 61;
  const isPurchase = t === 46;
  const title = docTypeLabel(t);
  const receptorLabel = isPurchase ? 'VENDEDOR' : 'SEÑOR(ES)';
  const defaultLine = isNc
    ? 'Nota de crédito'
    : (isPurchase ? 'Compra de chatarra / materiales' : 'Servicios de intermediación');
  const emitterName = doc.meta?.emitterName || company.legalName || company.name || 'Fandez';
  const emitterGiro = doc.meta?.emitterGiro || company.giro || 'Intermediación de servicios del hogar';
  const emitterAddress = doc.meta?.emitterAddress || company.address || 'Santiago';
  const emitterCommune = doc.meta?.emitterCommune || company.commune || 'Santiago';
  const emitterCity = doc.meta?.emitterCity || company.city || 'Santiago';
  const receptorGiro = doc.meta?.receptorGiro || '—';
  const receptorAddress = doc.meta?.receptorAddress || '—';
  const receptorCommune = doc.meta?.receptorCommune || '—';
  const receptorCity = doc.meta?.receptorCity || '—';
  const receptorEmail = doc.meta?.receptorEmail || doc.meta?.partnerEmail || '';
  const fecha = formatFechaEmision(doc.signedAt || doc.createdAt);
  const ref = doc.meta?.reference;
  const obs = doc.meta?.observation ? String(doc.meta.observation) : '';
  const dry = Boolean(doc.meta?.dryRun);
  const siiOffice = (doc.environment === 'production' ? 'SANTIAGO' : 'SANTIAGO · CERTIFICACIÓN').toUpperCase();

  const refRow = ref
    ? `<tr class="ref-row"><td colspan="7">Referencia: DTE ${esc(ref.dteType)} N° ${esc(ref.folio)}` +
      ` (${esc(ref.date || '')}) · CodRef ${esc(ref.code)} · ${esc(ref.reason || '')}</td></tr>`
    : '';
  const obsRow = obs
    ? `<tr class="obs-row"><td colspan="7"><strong>Observación:</strong> ${esc(obs)}</td></tr>`
    : '';

  const baseCtx = {
    doc,
    barcode,
    title,
    receptorLabel,
    defaultLine,
    emitterName,
    emitterGiro,
    emitterAddress,
    emitterCommune,
    emitterCity,
    receptorGiro,
    receptorAddress,
    receptorCommune,
    receptorCity,
    receptorEmail,
    fecha,
    refRow,
    obsRow,
    dry,
    siiOffice
  };

  const sheet = buildSheetHtml({ ...baseCtx, exemplar, pageBreak: false });
  const titleSuffix = exemplar === 'cedible' ? ' · Copia cedible' : ' · Ejemplar tributario';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>${esc(title)} N° ${esc(doc.folio)}${esc(titleSuffix)}</title>
<style>
  @page { size: letter; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font-family: Arial, Helvetica, sans-serif;
    color: #0b3d91;
    background: #fff;
    font-size: 12px;
  }
  .sheet {
    max-width: 210mm;
    margin: 0 auto;
    border: 1.5px solid #111;
    padding: 14px 16px 12px;
    min-height: 250mm;
  }
  .banner {
    text-align: center;
    font-size: 11px;
    color: #334155;
    margin: 0 0 10px;
  }
  .top {
    display: grid;
    grid-template-columns: 1fr 210px;
    gap: 16px;
    align-items: start;
    margin-bottom: 12px;
  }
  .emitter .name {
    color: #c1121f;
    font-weight: 700;
    font-size: 15px;
    margin: 0 0 6px;
    text-transform: uppercase;
  }
  .emitter .line { margin: 2px 0; color: #0b3d91; font-size: 12px; }
  .idbox-wrap { text-align: center; }
  .idbox {
    border: 3px solid #111;
    padding: 10px 8px;
    color: #c1121f;
    font-weight: 700;
    line-height: 1.35;
  }
  .idbox .rut { font-size: 14px; }
  .idbox .tipo { font-size: 13px; margin-top: 4px; text-transform: uppercase; }
  .idbox .folio { font-size: 16px; margin-top: 4px; }
  .idbox-wrap .sii {
    color: #c1121f;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.12em;
    margin: 6px 0 4px;
  }
  .idbox-wrap .fecha { color: #0b3d91; font-size: 12px; }
  .receptor {
    border: 1.5px solid #111;
    padding: 8px 10px;
    margin-bottom: 12px;
  }
  .receptor table { width: 100%; border-collapse: collapse; }
  .receptor td { padding: 2px 4px; vertical-align: top; color: #0b3d91; font-size: 12px; }
  .receptor .lbl { font-weight: 700; width: 7.5rem; white-space: nowrap; }
  .items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    min-height: 180px;
  }
  .items th, .items td {
    border: 1px solid #111;
    padding: 5px 6px;
    font-size: 11px;
    color: #0b3d91;
  }
  .items th {
    font-weight: 700;
    text-align: center;
    background: #fff;
  }
  .items td.c { text-align: center; width: 3.2rem; }
  .items td.n { text-align: right; white-space: nowrap; }
  .items tbody tr { height: 22px; }
  .items .ref-row td, .items .obs-row td {
    text-align: left;
    font-size: 11px;
    color: #334155;
  }
  .foot {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 16px;
    align-items: end;
    margin-top: 8px;
  }
  .timbre { text-align: center; }
  .timbre img {
    max-width: 280px;
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }
  .timbre .cap {
    margin: 6px 0 0;
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }
  .timbre .verify {
    margin: 2px 0 0;
    font-size: 11px;
    color: #0b3d91;
  }
  .timbre .placeholder {
    border: 1px dashed #94a3b8;
    min-height: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    font-size: 11px;
    padding: 12px;
  }
  .totales {
    border: 1.5px solid #111;
    padding: 8px 10px;
  }
  .totales table { width: 100%; border-collapse: collapse; }
  .totales td {
    padding: 3px 0;
    color: #0b3d91;
    font-size: 12px;
  }
  .totales td.v { text-align: right; font-weight: 700; }
  .totales tr.total td {
    font-size: 13px;
    font-weight: 700;
    padding-top: 6px;
    border-top: 1px solid #cbd5e1;
  }
  .tributario-foot {
    margin: 14px 0 0;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #64748b;
    text-transform: uppercase;
  }
  .cedible {
    margin-top: 14px;
    border-top: 1px solid #111;
    padding-top: 10px;
  }
  .cedible__stamp {
    margin: 0 0 6px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #111;
  }
  .cedible__leyenda {
    margin: 0 0 10px;
    font-size: 10px;
    font-weight: 700;
    color: #111;
    text-align: center;
    line-height: 1.35;
    text-transform: uppercase;
  }
  .acuse {
    border: 1px solid #111;
    padding: 8px 10px;
  }
  .acuse__title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    color: #111;
    text-transform: uppercase;
  }
  .acuse__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 14px;
  }
  .acuse__grid > div span {
    display: block;
    font-size: 10px;
    font-weight: 700;
    color: #0b3d91;
  }
  .acuse__grid > div em {
    display: block;
    border-bottom: 1px solid #64748b;
    min-height: 18px;
    margin-top: 2px;
    font-style: normal;
  }
  .acuse__firma { grid-column: 1 / -1; }
  .acuse__firma em { min-height: 36px; }
  .acuse__hint {
    margin: 8px 0 0;
    font-size: 9px;
    color: #334155;
    line-height: 1.35;
  }
  .meta {
    margin-top: 10px;
    font-size: 10px;
    color: #64748b;
    text-align: center;
  }
  @media print {
    body { padding: 0; }
    .sheet { border: 1.5px solid #111; max-width: none; min-height: auto; }
    .meta { display: none; }
  }
</style>
</head>
<body>
  ${sheet}
</body></html>`;
}

module.exports = {
  renderCommissionInvoiceHtml,
  buildPdf417DataUrl,
  supportsCedible,
  normalizeExemplar,
  LEYENDA_CEDIBLE
};
