/**
 * Emisión de DTE (boleta/factura electrónica).
 *
 * Flujo de producto:
 *  1. Comprobante de pago (lib/voucher) — inmediato, no es tributario.
 *  2. Este módulo — documento SII al correo de facturación.
 *
 * Proveedores:
 *  - mock (default): HTML demo local
 *  - sii_direct: DTE_PROVIDER=sii_direct — firma/TED/UploadDTE open-source (lib/sii-dte)
 *  - libredte: DTE_PROVIDER=libredte + LIBREDTE_URL + LIBREDTE_HASH (opcional SaaS/self-host)
 */
const mock = require('./mock');
const libredte = require('./libredte');
const siiDirect = require('../sii-dte');

function getProvider() {
  const name = (process.env.DTE_PROVIDER || 'mock').toLowerCase();
  if (name === 'sii_direct' || name === 'sii') {
    return { name: 'sii_direct', emit: siiDirect.emitAsDteProvider };
  }
  if (name === 'libredte' && libredte.isConfigured()) return { name: 'libredte', emit: libredte.emit };
  return { name: 'mock', emit: mock.emit };
}

function isConfigured() {
  const p = getProvider();
  if (p.name === 'libredte') return libredte.isConfigured();
  if (p.name === 'sii_direct') return true; // dry-run disponible sin cert
  return true;
}

function getProviderStatus() {
  const name = (process.env.DTE_PROVIDER || 'mock').toLowerCase();
  if (name === 'sii_direct' || name === 'sii') {
    return { ...siiDirect.getStatus(), libredte: libredte.isConfigured() };
  }
  const configured = name === 'libredte' && libredte.isConfigured();
  return {
    provider: process.env.DTE_PROVIDER || 'mock',
    configured,
    libredte: libredte.isConfigured(),
    sii_direct: siiDirect.getStatus(),
    mode: configured ? 'production' : 'demo'
  };
}

async function issueDocument({ request, billing, amount, phase, description }) {
  if (!billing || !amount || amount <= 0) {
    return { error: 'Datos insuficientes para emitir documento tributario' };
  }

  const provider = getProvider();
  try {
    const result = await provider.emit({ request, billing, amount, phase, description });
    if (result.error) return result;
    return { success: true, document: result, provider: provider.name };
  } catch (err) {
    return { error: err.message || 'Error emitiendo DTE' };
  }
}

module.exports = {
  issueDocument,
  isConfigured,
  getProviderStatus,
  getProvider
};
