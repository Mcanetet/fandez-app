/**
 * Referencias DTE (set de pruebas SII + documento origen en NC).
 */
'use strict';

const { esc } = require('./detalle');

function formatDate(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

/**
 * Normaliza caso de set: { setId, caseNumber } o string "1221626-1" / "CASO 1221626-1"
 */
function normalizeSetCase(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const setId = String(raw.setId || raw.id || '').replace(/\D/g, '');
    const caseNumber = parseInt(raw.caseNumber ?? raw.caso ?? raw.n, 10) || 0;
    if (!setId || caseNumber < 1) return null;
    return { setId, caseNumber, razonRef: `CASO ${setId}-${caseNumber}` };
  }
  const s = String(raw).trim().toUpperCase().replace(/^CASO\s+/, '');
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  return { setId: m[1], caseNumber: parseInt(m[2], 10), razonRef: `CASO ${m[1]}-${m[2]}` };
}

/**
 * Línea 1 del set de pruebas (obligatoria en certificación).
 */
function buildSetReferenciaXml({ folio, issuedAt, setCase, nroLinRef = 1 }) {
  const sc = normalizeSetCase(setCase);
  if (!sc) return '';
  const fch = formatDate(issuedAt);
  return (
    `<Referencia>` +
    `<NroLinRef>${nroLinRef}</NroLinRef>` +
    `<TpoDocRef>SET</TpoDocRef>` +
    `<FolioRef>${folio}</FolioRef>` +
    `<FchRef>${fch}</FchRef>` +
    `<RazonRef>${esc(sc.razonRef)}</RazonRef>` +
    `</Referencia>`
  );
}

/**
 * Referencia a documento tributario (NC/ND → factura).
 */
function buildDocReferenciaXml(reference, nroLinRef = 1) {
  if (!reference) return '';
  const refType = parseInt(reference.dteType ?? reference.tipo, 10) || 33;
  const refFolio = Math.max(1, parseInt(reference.folio, 10) || 0);
  if (!refFolio) return '';
  const refDate = formatDate(reference.date || reference.fchRef);
  const codRef = parseInt(reference.code ?? reference.codRef, 10);
  const razon = String(reference.reason || reference.razonRef || 'Correccion').trim().slice(0, 90);
  return (
    `<Referencia>` +
    `<NroLinRef>${nroLinRef}</NroLinRef>` +
    `<TpoDocRef>${refType}</TpoDocRef>` +
    `<FolioRef>${refFolio}</FolioRef>` +
    `<FchRef>${refDate}</FchRef>` +
    (codRef === 1 || codRef === 2 || codRef === 3 ? `<CodRef>${codRef}</CodRef>` : '') +
    `<RazonRef>${esc(razon)}</RazonRef>` +
    `</Referencia>`
  );
}

/**
 * Orden SII: primero SET (si hay), luego referencias a documentos.
 */
function buildReferenciasXml({ folio, issuedAt, setCase = null, reference = null }) {
  const parts = [];
  let n = 1;
  const setXml = buildSetReferenciaXml({ folio, issuedAt, setCase, nroLinRef: n });
  if (setXml) {
    parts.push(setXml);
    n += 1;
  }
  const docXml = buildDocReferenciaXml(reference, n);
  if (docXml) parts.push(docXml);
  return parts.join('');
}

module.exports = {
  normalizeSetCase,
  buildSetReferenciaXml,
  buildDocReferenciaXml,
  buildReferenciasXml,
  formatDate
};
