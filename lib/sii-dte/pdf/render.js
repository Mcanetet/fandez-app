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
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Factura Electrónica N° ${doc.folio}</title>
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
</style></head><body>
<div class="box">
  <p class="badge">R.U.T.: ${doc.emitterRut}<br>FACTURA ELECTRÓNICA<br>N° ${doc.folio}</p>
  <h1 style="font-size:1.1rem;margin:.5rem 0 0">${doc.meta?.emitterName || company.legalName || company.name}</h1>
  <p class="muted">${doc.meta?.emitterGiro || ''}<br>${doc.meta?.emitterAddress || company.address || ''}</p>
  <hr>
  <p><strong>Señor(es):</strong> ${doc.receptorName}<br>
  <strong>RUT:</strong> ${doc.receptorRut}<br>
  <strong>Fecha:</strong> ${issued}<br>
  <strong>Ambiente SII:</strong> ${doc.environment}</p>
  <table>
    <thead><tr><th>Detalle</th><th>Neto</th></tr></thead>
    <tbody>
      ${(doc.meta?.lines || [{ name: 'Comisión intermediación Fandez', neto: doc.neto }]).map((l) =>
        `<tr><td>${l.name}</td><td>${formatClp(l.neto)}</td></tr>`
      ).join('')}
    </tbody>
  </table>
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
