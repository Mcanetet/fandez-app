/**
 * XML DTE tipo 61 (Nota de Crédito Electrónica).
 * Debe referenciar el documento que corrige/anula (típicamente Factura 33).
 */
'use strict';

const { buildTed } = require('../crypto/ted');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  reference
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

  const detalleXml = lines.map((line, idx) => {
    const qty = 1;
    const prc = Math.round(line.neto || 0);
    return (
      `<Detalle>` +
      `<NroLinDet>${idx + 1}</NroLinDet>` +
      `<NmbItem>${esc(line.name).slice(0, 80)}</NmbItem>` +
      `<QtyItem>${qty}</QtyItem>` +
      `<PrcItem>${prc}</PrcItem>` +
      `<MontoItem>${prc * qty}</MontoItem>` +
      `</Detalle>`
    );
  }).join('');

  const referenciaXml =
    `<Referencia>` +
    `<NroLinRef>1</NroLinRef>` +
    `<TpoDocRef>${refType}</TpoDocRef>` +
    `<FolioRef>${refFolio}</FolioRef>` +
    `<FchRef>${refDate}</FchRef>` +
    `<CodRef>${codRef}</CodRef>` +
    `<RazonRef>${esc(razonRef)}</RazonRef>` +
    `</Referencia>`;

  const { ted } = buildTed({
    emitterRut: emitter.rut,
    dteType: 61,
    folio,
    issuedAt: issuedAt || new Date().toISOString(),
    receptorRut: receptor.rut,
    total: amounts.total,
    itemName: lines[0]?.name || 'Nota de crédito',
    caf
  });

  const tmst = (issuedAt || new Date().toISOString()).replace(/\.\d{3}Z$/, '').replace('Z', '');

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
    `${referenciaXml}` +
    `${ted}` +
    `<TmstFirma>${tmst.slice(0, 19)}</TmstFirma>` +
    `</Documento>`;

  return { documentoXml, documentoId, ted };
}

module.exports = {
  buildDocumento61,
  normalizeCodRef
};
