/**
 * XML DTE tipo 61 (Nota de Crédito Electrónica).
 * Debe referenciar el documento que corrige/anula (típicamente Factura 33).
 */
'use strict';

const { buildTed } = require('../crypto/ted');
const { esc, buildDetalleXml } = require('./detalle');
const { buildReferenciasXml } = require('./referencia');

function formatDate(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

/**
 * CodRef SII:
 * 1 = Anula documento de referencia
 * 2 = Corrige texto del documento de referencia
 * 3 = Corrige montos
 */
function normalizeCodRef(code) {
  const n = parseInt(code, 10);
  if (n === 1 || n === 2 || n === 3) return n;
  return 3;
}

/**
 * @param {object} opts
 * @param {object} opts.reference { dteType, folio, date, code, reason }
 */
function buildDocumento61({
  folio,
  issuedAt,
  emitter,
  receptor,
  amounts,
  caf,
  reference,
  observation = null,
  setCase = null
}) {
  const documentoId = `F${folio}T61`;
  const fchEmis = formatDate(issuedAt);
  const lines = (amounts.lines && amounts.lines.length)
    ? amounts.lines
    : [{ name: 'Nota de crédito', neto: amounts.neto, totalIvaIncluded: amounts.total }];

  const refType = parseInt(reference?.dteType, 10) || 33;
  const refFolio = Math.max(1, parseInt(reference?.folio, 10) || 0);
  const refDate = formatDate(reference?.date || issuedAt);
  const codRef = normalizeCodRef(reference?.code);
  const razonRef = String(reference?.reason || 'Corrección de montos').trim().slice(0, 90);

  if (!refFolio) {
    throw new Error('La nota de crédito requiere folio del documento de referencia.');
  }

  const detalleXml = buildDetalleXml(lines, observation);

  const referenciasXml = buildReferenciasXml({
    folio,
    issuedAt,
    setCase,
    reference: {
      dteType: refType,
      folio: refFolio,
      date: refDate,
      code: codRef,
      reason: razonRef
    }
  });

  const { ted } = buildTed({
    emitterRut: emitter.rut,
    dteType: 61,
    folio,
    issuedAt: issuedAt || new Date().toISOString(),
    receptorRut: receptor.rut,
    receptorName: receptor.name,
    total: amounts.total,
    itemName: lines[0]?.name || 'Nota de credito',
    caf
  });

  const tmst = (issuedAt || new Date().toISOString()).replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);

  const documentoXml =
    `<Documento ID="${documentoId}">` +
    `<Encabezado>` +
    `<IdDoc>` +
    `<TipoDTE>61</TipoDTE>` +
    `<Folio>${folio}</Folio>` +
    `<FchEmis>${fchEmis}</FchEmis>` +
    `</IdDoc>` +
    `<Emisor>` +
    `<RUTEmisor>${esc(emitter.rut)}</RUTEmisor>` +
    `<RznSoc>${esc(emitter.name).slice(0, 100)}</RznSoc>` +
    `<GiroEmis>${esc(emitter.giro).slice(0, 80)}</GiroEmis>` +
    `<Acteco>${esc(emitter.acteco)}</Acteco>` +
    `<DirOrigen>${esc(emitter.address).slice(0, 70)}</DirOrigen>` +
    `<CmnaOrigen>${esc(emitter.commune)}</CmnaOrigen>` +
    `<CiudadOrigen>${esc(emitter.city)}</CiudadOrigen>` +
    `</Emisor>` +
    `<Receptor>` +
    `<RUTRecep>${esc(receptor.rut)}</RUTRecep>` +
    `<RznSocRecep>${esc(receptor.name).slice(0, 100)}</RznSocRecep>` +
    `<GiroRecep>${esc(receptor.giro || 'Servicios').slice(0, 40)}</GiroRecep>` +
    `<DirRecep>${esc(receptor.address || 'Santiago').slice(0, 70)}</DirRecep>` +
    `<CmnaRecep>${esc(receptor.commune || 'Santiago')}</CmnaRecep>` +
    `<CiudadRecep>${esc(receptor.city || 'Santiago')}</CiudadRecep>` +
    (receptor.email ? `<CorreoRecep>${esc(receptor.email)}</CorreoRecep>` : '') +
    `</Receptor>` +
    `<Totales>` +
    `<MntNeto>${amounts.neto}</MntNeto>` +
    `<TasaIVA>19</TasaIVA>` +
    `<IVA>${amounts.iva}</IVA>` +
    `<MntTotal>${amounts.total}</MntTotal>` +
    `</Totales>` +
    `</Encabezado>` +
    `${detalleXml}` +
    `${referenciasXml}` +
    `${ted}` +
    `<TmstFirma>${tmst}</TmstFirma>` +
    `</Documento>`;

  return { documentoXml, documentoId, ted };
}

module.exports = {
  buildDocumento61,
  normalizeCodRef
};
