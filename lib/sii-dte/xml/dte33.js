/**
 * Generación del XML DTE tipo 33 (Factura Electrónica) según esquema SII.
 * Estructura Encabezado / Detalle / Totales + TED + TmstFirma.
 */
'use strict';

const { buildTed } = require('../crypto/ted');
const { esc, buildDetalleXml } = require('./detalle');

function formatDate(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

/**
 * @returns {{ documentoXml: string, documentoId: string, ted: string }}
 */
function buildDocumento33({
  folio,
  issuedAt,
  emitter,
  receptor,
  amounts,
  caf,
  paymentMethod = 2,
  observation = null
}) {
  const documentoId = `F${folio}T33`;
  const fchEmis = formatDate(issuedAt);
  const lines = (amounts.lines && amounts.lines.length)
    ? amounts.lines
    : [{ name: 'Servicios de intermediación', neto: amounts.neto, totalIvaIncluded: amounts.total }];

  const detalleXml = buildDetalleXml(lines, observation);

  const { ted } = buildTed({
    emitterRut: emitter.rut,
    dteType: 33,
    folio,
    issuedAt: issuedAt || new Date().toISOString(),
    receptorRut: receptor.rut,
    total: amounts.total,
    itemName: lines[0]?.name || 'Intermediación Fandez',
    caf
  });

  const tmst = (issuedAt || new Date().toISOString()).replace(/\.\d{3}Z$/, '').replace('Z', '');

  const documentoXml =
    `<Documento ID="${documentoId}">` +
    `<Encabezado>` +
    `<IdDoc>` +
    `<TipoDTE>33</TipoDTE>` +
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
    `${ted}` +
    `<TmstFirma>${tmst.slice(0, 19)}</TmstFirma>` +
    `</Documento>`;

  return { documentoXml, documentoId, ted };
}

/**
 * Envoltorio EnvioDTE (SetDTE) listo para ZIP → UploadDTE.
 */
function buildEnvioDte({ emitter, documentoFirmadoXml, folio, caratula, dteType = 33 }) {
  const fchResol = caratula?.resolutionDate || '2024-01-01';
  const nroResol = caratula?.resolutionNumber || '0';
  const tmst = new Date().toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '').slice(0, 19);
  const setId = `SetDoc`;
  const tpo = [33, 43, 46, 61].includes(Number(dteType)) ? Number(dteType) : 33;
  return (
    `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">` +
    `<SetDTE ID="${setId}">` +
    `<Caratula version="1.0">` +
    `<RutEmisor>${esc(emitter.rut)}</RutEmisor>` +
    `<RutEnvia>${esc(caratula?.rutEnvia || emitter.rut)}</RutEnvia>` +
    `<RutReceptor>60803000-K</RutReceptor>` +
    `<FchResol>${fchResol}</FchResol>` +
    `<NroResol>${nroResol}</NroResol>` +
    `<TmstFirmaEnv>${tmst}</TmstFirmaEnv>` +
    `<SubTotDTE><TpoDTE>${tpo}</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>` +
    `</Caratula>` +
    `<DTE version="1.0">${documentoFirmadoXml}</DTE>` +
    `</SetDTE>` +
    `</EnvioDTE>`
  );
}

module.exports = {
  buildDocumento33,
  buildEnvioDte
};
