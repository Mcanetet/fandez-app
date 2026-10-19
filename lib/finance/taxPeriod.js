/**
 * Resumen IVA por período (mensual) — estilo “centro del mes”.
 * Débito: IVA del margen Fandez en servicios completados.
 * Crédito: IVA de facturas de compra + FC46.
 */
const { computeRequestFinancials } = require('../pricing');

function normalizePeriod(period) {
  const raw = String(period || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function inPeriod(dateStr, period) {
  if (!dateStr || !period) return false;
  return String(dateStr).slice(0, 7) === period;
}

function ivaFromGross(gross, rate = 0.19) {
  const g = Math.round(Number(gross) || 0);
  if (g <= 0) return 0;
  return Math.round(g - g / (1 + rate));
}

function periodLabel(period) {
  const [y, m] = String(period).split('-').map(Number);
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const name = months[(m || 1) - 1] || period;
  return `${name} ${y || ''}`.trim();
}

/**
 * @param {{
 *   period?: string,
 *   requests?: object[],
 *   pricing?: object,
 *   purchaseInvoices?: object[],
 *   dteDocs?: object[],
 *   ivaRate?: number
 * }} opts
 */
function buildIvaPeriodSummary(opts = {}) {
  const period = normalizePeriod(opts.period);
  const rate = Number(opts.ivaRate) > 0 ? Number(opts.ivaRate) : 0.19;
  const pricing = opts.pricing || {};
  const requests = Array.isArray(opts.requests) ? opts.requests : [];
  const purchases = Array.isArray(opts.purchaseInvoices) ? opts.purchaseInvoices : [];
  const dteDocs = Array.isArray(opts.dteDocs) ? opts.dteDocs : [];

  const completed = requests.filter((r) => (
    r.paymentStatus === 'approved'
    && r.status === 'completed'
    && inPeriod(r.completedAt || r.paidAt, period)
  ));

  let debitFromServices = 0;
  const debitLines = [];
  completed.forEach((r) => {
    const fin = r.financials || computeRequestFinancials(r, pricing);
    const iva = Math.max(0, Math.round(fin.ivaOnFees || 0));
    debitFromServices += iva;
    if (iva > 0) {
      debitLines.push({
        id: r.id,
        date: String(r.completedAt || r.paidAt || '').slice(0, 10),
        label: `Margen · ${r.serviceName || r.serviceId || r.id}`,
        iva,
        netFees: Math.max(0, Math.round(fin.feesBeforeIva || 0)),
        appTotal: Math.max(0, Math.round(fin.appTotal || 0)),
        source: 'service_fee'
      });
    }
  });

  let debitFromDte = 0;
  let creditFromDte46 = 0;
  let creditFromNc = 0;
  dteDocs.forEach((d) => {
    const date = d.issuedAt || d.createdAt || d.signedAt || '';
    if (!inPeriod(date, period)) return;
    const total = Math.round(Number(d.amount ?? d.total) || 0);
    const iva = d.iva != null ? Math.max(0, Math.round(Number(d.iva) || 0)) : ivaFromGross(total, rate);
    if (!iva) return;
    const type = Number(d.dteType || d.type || 33);
    if (type === 61 || type === 112) {
      creditFromNc += iva;
    } else if (type === 46) {
      creditFromDte46 += iva;
    } else if ([33, 34, 39, 41, 43].includes(type)) {
      debitFromDte += iva;
    }
  });

  let creditFromPurchases = 0;
  const creditLines = [];
  purchases.forEach((inv) => {
    if (!inPeriod(inv.issuedAt, period)) return;
    let iva = Math.max(0, Math.round(Number(inv.taxAmount) || 0));
    if (!iva && inv.totalAmount && inv.netAmount != null) {
      iva = Math.max(0, Math.round(Number(inv.totalAmount) || 0) - Math.round(Number(inv.netAmount) || 0));
    }
    if (!iva && inv.totalAmount && !inv.netAmount) {
      iva = ivaFromGross(inv.totalAmount, rate);
    }
    creditFromPurchases += iva;
    if (iva > 0) {
      creditLines.push({
        id: inv.id,
        date: String(inv.issuedAt || '').slice(0, 10),
        label: `${inv.supplierName || 'Proveedor'} · folio ${inv.folio || '—'}`,
        iva,
        total: Math.round(Number(inv.totalAmount) || 0),
        source: inv.source || 'purchase'
      });
    }
  });

  if (creditFromDte46 > 0) {
    creditLines.push({
      id: 'dte-46',
      date: period,
      label: 'Facturas de compra (tipo 46)',
      iva: creditFromDte46,
      source: 'dte_46'
    });
  }

  const ivaDebitoBruto = debitFromServices;
  const ivaDebito = Math.max(0, ivaDebitoBruto - creditFromNc);
  const ivaCredito = creditFromPurchases + creditFromDte46;
  const ivaPagar = Math.max(0, ivaDebito - ivaCredito);
  const ivaFavor = Math.max(0, ivaCredito - ivaDebito);

  return {
    period,
    periodLabel: periodLabel(period),
    ivaRate: rate,
    ivaDebito,
    ivaCredito,
    ivaPagar,
    ivaFavor,
    status: ivaPagar > 0 ? 'a_pagar' : (ivaFavor > 0 ? 'saldo_favor' : 'cuadrado'),
    breakdown: {
      debitFromServices: ivaDebitoBruto,
      debitFromDte,
      creditFromPurchases,
      creditFromDte46,
      creditFromNc,
      varianceDebitVsDte: ivaDebitoBruto - debitFromDte
    },
    debitLines: debitLines.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60),
    creditLines: creditLines.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60),
    completedCount: completed.length,
    purchaseCount: creditLines.filter((l) => l.source !== 'dte_46').length,
    note: 'IVA débito = desglose IVA del margen Fandez (servicios completados del mes). IVA crédito = facturas de compra registradas + FC46. Las NC (61) restan al débito.'
  };
}

function listRecentPeriods(count = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i += 1) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const period = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ period, label: periodLabel(period) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

module.exports = {
  normalizePeriod,
  inPeriod,
  ivaFromGross,
  periodLabel,
  buildIvaPeriodSummary,
  listRecentPeriods
};
