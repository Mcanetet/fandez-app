/**
 * Autocompletar receptor por RUT:
 * 1) socios / DTEs previos en Fandez
 * 2) API pública de empresas (SRE) si hay cupo/token
 *
 * Nota: personas naturales / particulares suelen no aparecer en bases de empresas.
 */
'use strict';

const { formatRut, validateRut, cleanRut } = require('../rut');
const { normalizeRut } = require('./config');

function rutKey(rut) {
  return cleanRut(rut);
}

function toHyphenRut(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return '';
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

function lookupLocal(rut, { users = [], dteDocs = [] } = {}) {
  const key = rutKey(rut);
  if (!key) return null;

  for (const u of users) {
    if (u.role !== 'provider') continue;
    const billing = (() => {
      try {
        return require('./generateCommissionInvoice').pickPartnerBilling(u);
      } catch (_) {
        return null;
      }
    })();
    if (!billing?.rut || rutKey(billing.rut) !== key) continue;
    return {
      found: true,
      source: 'fandez_partner',
      rut: formatRut(billing.rut),
      name: billing.name,
      giro: billing.giro || 'Servicios técnicos',
      address: billing.address || 'Santiago',
      commune: billing.commune || 'Santiago',
      city: billing.city || 'Santiago',
      email: billing.email || null
    };
  }

  for (const doc of dteDocs) {
    if (!doc?.receptorRut || rutKey(doc.receptorRut) !== key) continue;
    const meta = doc.meta || {};
    return {
      found: true,
      source: 'fandez_dte',
      rut: formatRut(doc.receptorRut),
      name: doc.receptorName || meta.receptorName || '',
      giro: meta.receptorGiro || 'Servicios técnicos',
      address: meta.receptorAddress || 'Santiago',
      commune: meta.receptorCommune || 'Santiago',
      city: meta.receptorCity || 'Santiago',
      email: meta.partnerEmail || meta.receptorEmail || null
    };
  }

  return null;
}

async function lookupSre(rut) {
  const token = String(process.env.RUT_LOOKUP_TOKEN || process.env.SRE_TOKEN || 'token_publico').trim();
  if (!token || process.env.RUT_LOOKUP_ENABLED === 'false') {
    return { found: false, error: 'lookup_disabled' };
  }
  const hyphen = toHyphenRut(rut);
  if (!hyphen) return { found: false, error: 'rut_invalido' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://sre.cl/api/company_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token, rut: hyphen, version: '2.0' }),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (data.message && /consumido|consultas|token/i.test(String(data.message))) {
      return { found: false, error: 'quota', message: data.message };
    }
    const name = data.razon_social || data.razonSocial || data.nombre || '';
    if (!name) {
      return {
        found: false,
        error: 'not_found',
        message: 'No hay razón social pública para ese RUT (puede ser persona natural o no estar en el registro).'
      };
    }

    // Campos públicos post Ley 21.719: razón social, giro/glosa, email DTE, actecos, resolución.
    // Dirección / comuna / teléfono YA NO se entregan por APIs públicas.
    const giroRaw = data.glosa_giro || data.giro || data.glosaGiro
      || (Array.isArray(data.actecos) && data.actecos[0] ? `Actividad ${data.actecos[0]}` : '')
      || 'Servicios';
    const emailDte = data.dte_email || data.email_dte || data.correo_dte || null;

    return {
      found: true,
      source: 'sre',
      rut: formatRut(normalizeRut(hyphen)),
      name: String(name).trim().slice(0, 100),
      giro: String(giroRaw).trim().slice(0, 40),
      address: null,
      commune: null,
      city: null,
      email: emailDte ? String(emailDte).trim().slice(0, 80) : null,
      actecos: Array.isArray(data.actecos) ? data.actecos.slice(0, 5) : [],
      resolutionNumber: data.numero_resol || data.nro_resol || null,
      resolutionDate: data.fecha_resol || null,
      fillable: ['name', 'giro', 'email'],
      note: 'Autocompletado: razón social, giro y email DTE. La dirección hay que ingresarla a mano (ya no es pública).'
    };
  } catch (err) {
    return {
      found: false,
      error: 'network',
      message: err.name === 'AbortError' ? 'Timeout consultando RUT' : (err.message || 'Error de red')
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} rut
 * @param {{ users?: object[], dteDocs?: object[], external?: boolean }} opts
 */
async function lookupReceptor(rut, opts = {}) {
  if (!validateRut(rut)) {
    return { found: false, error: 'rut_invalido', message: 'RUT inválido' };
  }

  const local = lookupLocal(rut, opts);
  if (local) return local;

  if (opts.external === false) {
    return {
      found: false,
      error: 'not_local',
      message: 'RUT nuevo en Fandez. Completa razón social a mano o habilita consulta externa.'
    };
  }

  return lookupSre(rut);
}

module.exports = {
  lookupReceptor,
  lookupLocal,
  lookupSre,
  toHyphenRut
};
