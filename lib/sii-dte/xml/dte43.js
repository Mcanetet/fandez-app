/**
 * XML DTE tipo 43 (Liquidación-Factura Electrónica).
 * Emisor = liquidador / comisionista (Fandez).
 * Receptor = mandante (socio u otro titular de la operación liquidada).
 */
'use strict';

const { buildTed } = require('../crypto/ted');
const { esc, buildDetalleXml } = require('./detalle');
const { buildReferenciasXml } = require('./referencia');

function formatDate(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

/**
 * @returns {{ documentoXml: string, documentoId: string, ted: string }}
 */
function buildDocumento43({
  folio,
  issuedAt,
  emitter,
  receptor,
  amounts,
  caf,
  paymentMethod = 2,
  liquidation = null,
  observation = null,
  setCase = null
}) {
  const documentoId = `F${folio}T43`;
  const fchEmis = formatDate(issuedAt);
  let lineName = (amounts.lines && amounts.lines[0]?.name)
    || 'Liquidación comisión Fandez';

  if (liquidation && liquidation.bruto > 0) {
    const brutoTxt = Math.round(liquidation.bruto).toLocaleString('es-CL');
    lineName = String(`${lineName} · bruto $${brutoTxt}`).slice(0, 80);
  }

  const lines = (amounts.lines && amounts.lines.length)
    ? amounts.lines.map((l, i) => (i === 0 ? { ...l, name: lineName } : l))
    : [{
        name: lineName,
        qty: 1,
        unitNeto: amounts.neto,
        neto: amounts.neto,
        totalIvaIncluded: amounts.total
      }];

  const detalleXml = buildDetalleXml(lines, observation);
  const referenciasXml = buildReferenciasXml({ folio, issuedAt, setCase });

  const { ted } = buildTed({
    emitterRut: emitter.rut,
    dteType: 43,
    folio,
    issuedAt: issuedAt || new Date().toISOString(),
    receptorRut: receptor.rut,
    receptorName: receptor.name,
    total: amounts.total,
    itemName: lines[0]?.name || 'Liquidacion Fandez',
    caf
  });

  const tmst = (issuedAt || new Date().toISOString()).replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);

  const documentoXml =
    `<Documento ID="${documentoId}">` +
    `<Encabezado>` +
    `<IdDoc>` +
    `<TipoDTE>43</TipoDTE>` +
    `<Folio>${folio}</Folio>` +
    `<FchEmis>${fchEmis}</FchEmis>` +
    `<FmaPago>${paymentMethod}</FmaPago>` +
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
  buildDocumento43
};
