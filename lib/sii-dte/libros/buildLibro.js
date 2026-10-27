/**
 * XML LibroCompraVenta (IECV) — schema LibroCV_v10.xsd.
 * Libros ESPECIALES de certificación (FolioNotificacion).
 *
 * Orden de nodos alineado al XSD (RutEmisorLibro, TotMntTotal tras FctProp, etc.).
 */
'use strict';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roundInt(n) {
  return Math.round(Number(n) || 0);
}

function normalizeRut(rut) {
  return String(rut || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase();
}

function periodFromDate(iso) {
  const s = String(iso || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 7);
}

function earliestPeriod(docs) {
  const periods = (docs || [])
    .map((d) => periodFromDate(d.fchDoc || d.signedAt || d.date))
    .filter(Boolean)
    .sort();
  return periods[0] || new Date().toISOString().slice(0, 7);
}

function formatFctProp(factor) {
  const n = Number(factor);
  if (!(n > 0)) return null;
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function tmstFirmaNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Totales por tipo de documento (ResumenPeriodo / TotalesPeriodo).
 * Orden XSD: … TotIVAUsoComun, FctProp, TotCredIVAUsoComun … TotMntTotal.
 */
function buildTotalesPeriodo(docs, { isCompra = false, fctProp = null } = {}) {
  const byType = new Map();
  (docs || []).forEach((d) => {
    const t = Number(d.tpoDoc || d.dteType) || 33;
    const cur = byType.get(t) || {
      tpoDoc: t,
      totDoc: 0,
      totMntExe: 0,
      totMntNeto: 0,
      totMntIVA: 0,
      totMntTotal: 0,
      totIVAUsoComun: 0,
      totOpIVAUsoComun: 0,
      totMntIVANoRec: 0,
      totOpIVANoRec: 0
    };
    const exe = roundInt(d.mntExe ?? d.exento ?? 0);
    const neto = roundInt(d.mntNeto ?? d.neto ?? 0);
    const iva = roundInt(d.mntIVA ?? d.ivaRecuperable ?? d.iva ?? 0);
    const ivaUso = roundInt(d.ivaUsoComun ?? d.IVAUsoComun ?? 0);
    const ivaNoRec = roundInt(d.ivaNoRecuperable ?? d.IVANoRec ?? 0);
    const total = roundInt(d.mntTotal ?? d.total ?? (neto + exe + iva + ivaUso + ivaNoRec));
    cur.totDoc += 1;
    cur.totMntExe += exe;
    cur.totMntNeto += neto;
    cur.totMntIVA += iva;
    cur.totMntTotal += total;
    cur.totIVAUsoComun += ivaUso;
    if (ivaUso > 0) cur.totOpIVAUsoComun += 1;
    cur.totMntIVANoRec += ivaNoRec;
    if (ivaNoRec > 0) cur.totOpIVANoRec += 1;
    byType.set(t, cur);
  });

  return [...byType.values()]
    .sort((a, b) => a.tpoDoc - b.tpoDoc)
    .map((t) => {
      let mid = '';
      if (isCompra && t.totMntIVANoRec > 0) {
        mid +=
          `<TotIVANoRec>` +
          `<CodIVANoRec>1</CodIVANoRec>` +
          `<TotOpIVANoRec>${t.totOpIVANoRec}</TotOpIVANoRec>` +
          `<TotMntIVANoRec>${t.totMntIVANoRec}</TotMntIVANoRec>` +
          `</TotIVANoRec>`;
      }
      if (isCompra && t.totIVAUsoComun > 0 && fctProp != null) {
        const factorStr = formatFctProp(fctProp);
        const cred = Math.round(t.totIVAUsoComun * Number(fctProp));
        mid +=
          `<TotOpIVAUsoComun>${t.totOpIVAUsoComun}</TotOpIVAUsoComun>` +
          `<TotIVAUsoComun>${t.totIVAUsoComun}</TotIVAUsoComun>` +
          (factorStr ? `<FctProp>${factorStr}</FctProp>` : '') +
          `<TotCredIVAUsoComun>${cred}</TotCredIVAUsoComun>`;
      }
      return (
        `<TotalesPeriodo>` +
        `<TpoDoc>${t.tpoDoc}</TpoDoc>` +
        `<TotDoc>${t.totDoc}</TotDoc>` +
        `<TotMntExe>${t.totMntExe}</TotMntExe>` +
        `<TotMntNeto>${t.totMntNeto}</TotMntNeto>` +
        `<TotMntIVA>${t.totMntIVA}</TotMntIVA>` +
        `${mid}` +
        `<TotMntTotal>${t.totMntTotal}</TotMntTotal>` +
        `</TotalesPeriodo>`
      );
    })
    .join('');
}

function buildDetalleVenta(d) {
  const tpo = Number(d.tpoDoc || d.dteType) || 33;
  const folio = Math.max(1, parseInt(d.nroDoc ?? d.folio, 10) || 0);
  const fch = String(d.fchDoc || d.signedAt || d.date || '').slice(0, 10);
  const rut = normalizeRut(d.rutDoc || d.receptorRut || d.rut);
  const rzn = String(d.rznSoc || d.receptorName || d.name || '').slice(0, 50);
  const exe = roundInt(d.mntExe ?? d.exento ?? 0);
  const neto = roundInt(d.mntNeto ?? d.neto ?? 0);
  const iva = roundInt(d.mntIVA ?? d.iva ?? 0);
  const total = roundInt(d.mntTotal ?? d.total ?? (neto + exe + iva));
  const tasa = d.tasaImp != null ? Number(d.tasaImp) : (iva > 0 ? 19 : 0);

  return (
    `<Detalle>` +
    `<TpoDoc>${tpo}</TpoDoc>` +
    `<NroDoc>${folio}</NroDoc>` +
    (tasa > 0 ? `<TasaImp>${tasa}</TasaImp>` : '') +
    `<FchDoc>${esc(fch)}</FchDoc>` +
    `<RUTDoc>${esc(rut)}</RUTDoc>` +
    (rzn ? `<RznSoc>${esc(rzn)}</RznSoc>` : '') +
    `<MntExe>${exe}</MntExe>` +
    `<MntNeto>${neto}</MntNeto>` +
    `<MntIVA>${iva}</MntIVA>` +
    `<MntTotal>${total}</MntTotal>` +
    `</Detalle>`
  );
}

function buildDetalleCompra(d) {
  const tpo = Number(d.tpoDoc || d.dteType) || 33;
  const folio = Math.max(1, parseInt(d.nroDoc ?? d.folio, 10) || 0);
  const fch = String(d.fchDoc || d.date || '').slice(0, 10);
  const rut = normalizeRut(d.rutDoc || d.rutProveedor || d.rut || d.emisorRut);
  const rzn = String(d.rznSoc || d.nombre || d.name || '').slice(0, 50);
  const exe = roundInt(d.mntExe ?? d.exento ?? 0);
  const neto = roundInt(d.mntNeto ?? d.neto ?? 0);
  const ivaRec = roundInt(d.mntIVA ?? d.ivaRecuperable ?? d.iva ?? 0);
  const ivaUso = roundInt(d.ivaUsoComun ?? d.IVAUsoComun ?? 0);
  const ivaNoRec = roundInt(d.ivaNoRecuperable ?? d.IVANoRec ?? 0);
  const total = roundInt(d.mntTotal ?? d.total ?? (neto + exe + ivaRec + ivaUso + ivaNoRec));
  const tasa = d.tasaImp != null ? Number(d.tasaImp) : 19;

  let ivaNoRecXml = '';
  if (ivaNoRec > 0) {
    const cod = parseInt(d.codIVANoRec || 1, 10) || 1;
    ivaNoRecXml =
      `<IVANoRec>` +
      `<CodIVANoRec>${cod}</CodIVANoRec>` +
      `<MntIVANoRec>${ivaNoRec}</MntIVANoRec>` +
      `</IVANoRec>`;
  }

  return (
    `<Detalle>` +
    `<TpoDoc>${tpo}</TpoDoc>` +
    `<NroDoc>${folio}</NroDoc>` +
    `<TasaImp>${tasa}</TasaImp>` +
    `<FchDoc>${esc(fch)}</FchDoc>` +
    `<RUTDoc>${esc(rut)}</RUTDoc>` +
    (rzn ? `<RznSoc>${esc(rzn)}</RznSoc>` : '') +
    `<MntExe>${exe}</MntExe>` +
    `<MntNeto>${neto}</MntNeto>` +
    `<MntIVA>${ivaRec}</MntIVA>` +
    `${ivaNoRecXml}` +
    (ivaUso > 0 ? `<IVAUsoComun>${ivaUso}</IVAUsoComun>` : '') +
    `<MntTotal>${total}</MntTotal>` +
    `</Detalle>`
  );
}

/**
 * @param {'VENTA'|'COMPRA'} tipoOperacion
 * @returns {string} XML sin firma (incluye TmstFirma; Signature la agrega signEnvioLibro)
 */
function buildEnvioLibroXml({
  tipoOperacion = 'VENTA',
  folioNotificacion,
  periodoTributario,
  emitterRut,
  rutEnvia,
  resolutionDate,
  resolutionNumber,
  docs = [],
  fctProp = null,
  envioId = null,
  tmstFirma = null
}) {
  const op = String(tipoOperacion || 'VENTA').toUpperCase() === 'COMPRA' ? 'COMPRA' : 'VENTA';
  const folioNotif = String(folioNotificacion || '').replace(/\D/g, '');
  if (!folioNotif) {
    throw new Error('Indica el Folio de Notificación del SII (Atención).');
  }
  const periodo = periodoTributario || earliestPeriod(docs);
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    throw new Error('Periodo tributario inválido (usa AAAA-MM).');
  }
  const id = String(envioId || `Libro${op}${folioNotif}`).replace(/[^\w.-]/g, '').slice(0, 40);
  if (!id) throw new Error('ID de EnvioLibro inválido.');
  const isCompra = op === 'COMPRA';
  const factor = isCompra
    ? (fctProp != null ? Number(fctProp) : 0.6)
    : null;

  const detalles = (docs || [])
    .map((d) => (isCompra ? buildDetalleCompra(d) : buildDetalleVenta(d)))
    .join('');

  const totales = buildTotalesPeriodo(docs, { isCompra, fctProp: factor });
  const stamp = tmstFirma || tmstFirmaNow();

  return (
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">\n` +
    `<EnvioLibro ID="${esc(id)}">` +
    `<Caratula>` +
    `<RutEmisorLibro>${esc(normalizeRut(emitterRut))}</RutEmisorLibro>` +
    `<RutEnvia>${esc(normalizeRut(rutEnvia || emitterRut))}</RutEnvia>` +
    `<PeriodoTributario>${esc(periodo)}</PeriodoTributario>` +
    `<FchResol>${esc(resolutionDate || '2024-01-01')}</FchResol>` +
    `<NroResol>${esc(resolutionNumber ?? '0')}</NroResol>` +
    `<TipoOperacion>${op}</TipoOperacion>` +
    `<TipoLibro>ESPECIAL</TipoLibro>` +
    `<TipoEnvio>TOTAL</TipoEnvio>` +
    `<FolioNotificacion>${folioNotif}</FolioNotificacion>` +
    `</Caratula>` +
    `<ResumenPeriodo>${totales}</ResumenPeriodo>` +
    `${detalles}` +
    `<TmstFirma>${esc(stamp)}</TmstFirma>` +
    `</EnvioLibro>` +
    `\n</LibroCompraVenta>`
  );
}

function dteDocsToVentaRows(dteDocs = []) {
  return (dteDocs || []).map((doc) => ({
    tpoDoc: Number(doc.dteType) || 33,
    nroDoc: doc.folio,
    fchDoc: String(doc.signedAt || doc.sentAt || doc.createdAt || '').slice(0, 10),
    rutDoc: doc.receptorRut,
    rznSoc: doc.receptorName,
    mntExe: 0,
    mntNeto: doc.neto,
    mntIVA: doc.iva,
    mntTotal: doc.total,
    tasaImp: 19
  }));
}

/**
 * Filtra DTE del set básico (excluye el pack EnvioDTE).
 */
function filterSetBasicoDocs(allDocs, setId) {
  const sid = String(setId || '').replace(/\D/g, '');
  if (!sid) return [];
  return (allDocs || []).filter((doc) => {
    if (doc.phase === 'certification_set' || doc.meta?.certificationSet) return false;
    const sc = doc.meta?.setCase;
    if (!sc) return false;
    if (typeof sc === 'object' && String(sc.setId || '').replace(/\D/g, '') === sid) return true;
    const ref = String(sc.razonRef || sc || '');
    return ref.includes(sid);
  }).sort((a, b) => {
    const ca = Number(a.meta?.setCase?.caseNumber) || 0;
    const cb = Number(b.meta?.setCase?.caseNumber) || 0;
    return ca - cb || (Number(a.folio) || 0) - (Number(b.folio) || 0);
  });
}

module.exports = {
  buildEnvioLibroXml,
  buildTotalesPeriodo,
  buildDetalleVenta,
  buildDetalleCompra,
  dteDocsToVentaRows,
  filterSetBasicoDocs,
  earliestPeriod,
  normalizeRut,
  periodFromDate,
  formatFctProp,
  tmstFirmaNow
};
