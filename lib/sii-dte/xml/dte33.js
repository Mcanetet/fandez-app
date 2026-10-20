/**
 * Generación del XML DTE tipo 33 (Factura Electrónica) según esquema SII.
 * Estructura Encabezado / Detalle / Totales + Referencias + TED + TmstFirma.
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
function buildDocumento33({
  folio,
  issuedAt,
  emitter,
  receptor,
  amounts,
  caf,
  paymentMethod = 2,
  observation = null,
  setCase = null
}) {
  const documentoId = `F${folio}T33`;
  const fchEmis = formatDate(issuedAt);
  const lines = (amounts.lines && amounts.lines.length)
    ? amounts.lines
    : [{ name: 'Servicios de intermediación', neto: amounts.neto, totalIvaIncluded: amounts.total }];

  const detalleXml = buildDetalleXml(lines, observation);
  const referenciasXml = buildReferenciasXml({ folio, issuedAt, setCase });

  const { ted } = buildTed({
    emitterRut: emitter.rut,
    dteType: 33,
    folio,
    issuedAt: issuedAt || new Date().toISOString(),
    receptorRut: receptor.rut,
    receptorName: receptor.name,
    total: amounts.total,
    itemName: lines[0]?.name || 'Intermediacion Fandez',
    caf
  });

  const tmst = (issuedAt || new Date().toISOString()).replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);

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
    `${referenciasXml}` +
    `${ted}` +
    `<TmstFirma>${tmst}</TmstFirma>` +
    `</Documento>`;

  return { documentoXml, documentoId, ted };
}

/**
 * @param {object} opts
 * @param {string|string[]} opts.documentoFirmadoXml — uno o varios Documentos firmados
 * @param {number|number[]} [opts.dteType]
 * @param {Array<{ dteType: number, count: number }>} [opts.subTotales]
 */
function buildEnvioDte({
  emitter,
  documentoFirmadoXml,
  folio,
  caratula,
  dteType = 33,
  subTotales = null,
  setDteId = 'SetDoc'
}) {
  const fchResol = caratula?.resolutionDate || '2024-01-01';
  const nroResol = caratula?.resolutionNumber ?? '0';
  const tmst = new Date().toISOString().replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);
  const docs = Array.isArray(documentoFirmadoXml) ? documentoFirmadoXml : [documentoFirmadoXml];
  const dteBlocks = docs.filter(Boolean).map((xml) => `<DTE version="1.0">${xml}</DTE>`).join('');

  let subXml = '';
  if (Array.isArray(subTotales) && subTotales.length) {
    subXml = subTotales
      .map((s) => `<SubTotDTE><TpoDTE>${Number(s.dteType)}</TpoDTE><NroDTE>${Number(s.count)}</NroDTE></SubTotDTE>`)
      .join('');
  } else {
    const counts = new Map();
    if (Array.isArray(dteType)) {
      dteType.forEach((t) => counts.set(Number(t), (counts.get(Number(t)) || 0) + 1));
    } else if (docs.length > 1) {
      // Inferir TipoDTE desde ID del Documento F{folio}T{type}
      docs.forEach((xml) => {
        const m = String(xml).match(/\bID="F\d+T(\d+)"/i);
        const t = m ? Number(m[1]) : Number(dteType) || 33;
        counts.set(t, (counts.get(t) || 0) + 1);
      });
    } else {
      const tpo = [33, 43, 46, 61].includes(Number(dteType)) ? Number(dteType) : 33;
      counts.set(tpo, docs.length || 1);
    }
    subXml = [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, n]) => `<SubTotDTE><TpoDTE>${t}</TpoDTE><NroDTE>${n}</NroDTE></SubTotDTE>`)
      .join('');
  }

  return (
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">\n` +
    `<SetDTE ID="${esc(setDteId)}">` +
    `<Caratula version="1.0">` +
    `<RutEmisor>${esc(emitter.rut)}</RutEmisor>` +
    `<RutEnvia>${esc(caratula?.rutEnvia || emitter.rut)}</RutEnvia>` +
    `<RutReceptor>60803000-K</RutReceptor>` +
    `<FchResol>${fchResol}</FchResol>` +
    `<NroResol>${nroResol}</NroResol>` +
    `<TmstFirmaEnv>${tmst}</TmstFirmaEnv>` +
    `${subXml}` +
    `</Caratula>` +
    `${dteBlocks}` +
    `</SetDTE>` +
    `</EnvioDTE>`
  );
}

module.exports = {
  buildDocumento33,
  buildEnvioDte
};
