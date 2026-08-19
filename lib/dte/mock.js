const fs = require('fs');
const path = require('path');
const company = require('../../config/company');

const DTE_DIR = path.join(__dirname, '../../data/dte');

function ensureDir() {
  if (!fs.existsSync(DTE_DIR)) fs.mkdirSync(DTE_DIR, { recursive: true });
}

function nextFolio(kind) {
  ensureDir();
  const counterFile = path.join(DTE_DIR, `.folio-${kind}`);
  let n = 1000;
  try {
    n = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) + 1;
  } catch (_) { /* primer folio */ }
  fs.writeFileSync(counterFile, String(n));
  return n;
}

function formatRut(rut) {
  return String(rut || '').trim() || '—';
}

function buildHtml(doc) {
  const isFactura = doc.kind === 'factura';
  const title = isFactura ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA';
  const dteCode = isFactura ? '33' : '39';
  const issued = new Date(doc.issuedAt).toLocaleString('es-CL');
  const neto = Math.round(doc.amount / 1.19);
  const iva = doc.amount - neto;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title} N° ${doc.folio}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; color: #1e293b; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .badge { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: .25rem .75rem; border-radius: 999px; font-size: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border: 1px solid #e2e8f0; padding: .6rem .75rem; text-align: left; font-size: 14px; }
    th { background: #f8fafc; }
    .total { font-size: 1.25rem; font-weight: 700; color: #059669; }
    .muted { color: #64748b; font-size: 12px; }
    .demo { background: #fef3c7; border: 1px solid #f59e0b; padding: .75rem; border-radius: 8px; margin-top: 1.5rem; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge">DTE ${dteCode} · Modo demostración</span>
    <h1>${title}</h1>
    <p><strong>${company.name}</strong> · RUT ${company.rut}<br>${company.address}</p>
  </div>
  <p><strong>Folio:</strong> ${doc.folio} &nbsp;·&nbsp; <strong>Fecha:</strong> ${issued}</p>
  <p><strong>Receptor:</strong> ${doc.receptorName}<br><strong>RUT:</strong> ${formatRut(doc.receptorRut)}<br><strong>Email DTE:</strong> ${doc.receptorEmail || '—'}</p>
  <p class="muted">Solicitud Fandez: ${doc.requestId} · ${doc.description}</p>
  <table>
    <thead><tr><th>Detalle</th><th>Monto</th></tr></thead>
    <tbody>
      <tr><td>${doc.lineDescription}</td><td>$${doc.amount.toLocaleString('es-CL')}</td></tr>
    </tbody>
  </table>
  ${isFactura ? `<p>Neto: $${neto.toLocaleString('es-CL')} · IVA (19%): $${iva.toLocaleString('es-CL')}</p>` : '<p>Servicio exento de IVA (boleta)</p>'}
  <p class="total">Total: $${doc.amount.toLocaleString('es-CL')}</p>
  <div class="demo">
    Documento generado en <strong>modo demostración</strong>. Para emisión real ante el SII, configura
    <code>DTE_PROVIDER=libredte</code> con certificado digital y credenciales del proveedor autorizado.
  </div>
</body>
</html>`;
}

async function emit({ request, billing, amount, phase, description }) {
  const kind = billing?.type === 'empresa' ? 'factura' : 'boleta';
  const folio = nextFolio(kind);
  const docId = `dte-${request.id}-${phase}-${Date.now()}`;
  const issuedAt = new Date().toISOString();

  const doc = {
    id: docId,
    requestId: request.id,
    kind,
    dteType: kind === 'factura' ? 33 : 39,
    phase,
    folio,
    amount: Math.round(amount),
    description,
    lineDescription: description,
    receptorRut: billing?.rut,
    receptorName: billing?.legalName,
    receptorEmail: billing?.invoiceEmail,
    issuerRut: company.rut,
    issuerName: company.name,
    status: 'issued',
    provider: 'mock',
    issuedAt,
    pdfUrl: `/documentos/tributarios/${docId}`,
    siiStatus: 'demo'
  };

  ensureDir();
  fs.writeFileSync(path.join(DTE_DIR, `${docId}.html`), buildHtml(doc), 'utf8');

  return doc;
}

module.exports = { emit };
