/**
 * Representación impresa (RIMP) del DTE 33.
 * Genera HTML + PNG PDF417 del TED (bwip-js). El HTML se sirve como
 * representación; se puede imprimir a PDF desde el navegador o un worker.
 */
'use strict';

const bwipjs = require('bwip-js');
const company = require('../../../config/company');

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

function formatClp(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}

async function renderCommissionInvoiceHtml(doc, { tedXml } = {}) {
  const barcode = tedXml ? await buildPdf417DataUrl(tedXml) : null;
  const issued = new Date(doc.signedAt || doc.createdAt || Date.now()).toLocaleString('es-CL');
  const t = Number(doc.dteType);
  const isNc = t === 61;
  const isPurchase = t === 46;
  const title = isNc
    ? 'NOTA DE CRÉDITO ELECTRÓNICA'
    : (isPurchase ? 'FACTURA DE COMPRA ELECTRÓNICA' : 'FACTURA ELECTRÓNICA');
  const ref = doc.meta?.reference;
  const refBlock = ref
    ? `<p class="muted"><strong>Referencia:</strong> DTE ${ref.dteType} N° ${ref.folio}` +
      ` (${ref.date}) · CodRef ${ref.code} · ${ref.reason || ''}</p>`
    : '';
  const obs = doc.meta?.observation
    ? `<p class="obs"><strong>Observación:</strong> ${String(doc.meta.observation)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    : '';
  const receptorLabel = isPurchase ? 'Vendedor' : 'Señor(es)';
  const defaultLine = isNc
    ? 'Nota de crédito'
    : (isPurchase ? 'Compra de chatarra / materiales' : 'Comisión intermediación Fandez');
  const isLiq = t === 43;
  const docTitle = isNc
    ? title
    : (isPurchase ? title : (isLiq ? 'LIQUIDACIÓN-FACTURA ELECTRÓNICA' : title));
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>${title} N° ${doc.folio}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:1.5rem auto;color:#0f172a}
  .box{border:2px solid #0f172a;padding:1rem;border-radius:8px}
  .badge{font-size:12px;font-weight:700;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;margin:1rem 0}
  th,td{border:1px solid #cbd5e1;padding:.5rem .75rem;font-size:14px;text-align:left}
  th{background:#f8fafc}
  .tot{font-size:1.15rem;font-weight:700}
  .muted{color:#64748b;font-size:12px}
  .barcode{text-align:center;margin-top:1.25rem}
  .barcode img{max-width:320px}
  .obs{margin:1rem 0 .25rem;padding:.75rem .9rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;line-height:1.45}
</style></head><body>
<div class="box">
  <p class="badge">R.U.T.: ${doc.emitterRut}<br>${docTitle}<br>N° ${doc.folio}</p>
  <h1 style="font-size:1.1rem;margin:.5rem 0 0">${doc.meta?.emitterName || company.legalName || company.name}</h1>
  <p class="muted">${doc.meta?.emitterGiro || ''}<br>${doc.meta?.emitterAddress || company.address || ''}<br>DTE: ${doc.meta?.emitterEmail || company.dteEmail || 'dte@fandez.cl'}</p>
  <hr>
  <p><strong>${receptorLabel}:</strong> ${doc.receptorName}<br>
  <strong>RUT:</strong> ${doc.receptorRut}<br>
  <strong>Fecha:</strong> ${issued}<br>
  <strong>Ambiente SII:</strong> ${doc.environment}</p>
  ${refBlock}
  <table>
    <thead><tr><th>Detalle</th><th>Cant.</th><th>Neto</th></tr></thead>
    <tbody>
      ${(doc.meta?.lines || [{ name: defaultLine, qty: 1, neto: doc.neto }]).map((l) =>
        `<tr><td>${l.name}</td><td>${l.qty != null ? l.qty : 1}</td><td>${formatClp(l.neto)}</td></tr>`
      ).join('')}
    </tbody>
  </table>
  ${obs}
  <p>Neto: ${formatClp(doc.neto)} · IVA 19%: ${formatClp(doc.iva)}</p>
  <p class="tot">Total: ${formatClp(doc.total)}</p>
  <p class="muted">Solicitud Fandez: ${doc.requestId} · Estado SII: ${doc.siiStatus}${doc.trackId ? ` · Track ${doc.trackId}` : ''}</p>
  ${barcode ? `<div class="barcode"><img alt="TED PDF417" src="${barcode}"><p class="muted">Timbre electrónico (TED)</p></div>` : ''}
</div>
</body></html>`;
}

module.exports = {
  renderCommissionInvoiceHtml,
  buildPdf417DataUrl
};
