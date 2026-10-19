const { v4: uuidv4 } = require('uuid');
const { loadState, saveState } = require('./state');
const { normalizePeriod, inPeriod } = require('./taxPeriod');

const DATE_WINDOW_DAYS = 5;
const TOLERANCE = 1;

function listBankMovements() {
  return loadState().bankMovements || [];
}

function movementKey(row) {
  return [
    String(row.date || '').slice(0, 10),
    Math.round(Number(row.amount) || 0),
    String(row.description || '').trim().toLowerCase()
  ].join('|');
}

function addBankMovement(payload = {}) {
  const state = loadState();
  const row = {
    id: payload.id || `bm-${uuidv4().slice(0, 8)}`,
    date: payload.date || new Date().toISOString().slice(0, 10),
    amount: Math.round(Number(payload.amount) || 0),
    description: String(payload.description || '').trim() || 'Movimiento bancario',
    reference: String(payload.reference || '').trim(),
    type: (Number(payload.amount) || 0) >= 0 ? 'credit' : 'debit',
    category: payload.category || 'payment',
    matchedPaymentId: payload.matchedPaymentId || null,
    matchedRequestId: payload.matchedRequestId || null,
    status: payload.status || 'open',
    source: payload.source || 'manual',
    createdAt: new Date().toISOString()
  };
  state.bankMovements.unshift(row);
  saveState(state);
  return { success: true, movement: row };
}

function importBankMovements(rows = [], { skipDuplicates = true } = {}) {
  const existing = new Set(listBankMovements().map(movementKey));
  const imported = [];
  const skipped = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const prepared = {
      ...row,
      source: row.source || 'bank_import',
      date: String(row.date || '').slice(0, 10),
      amount: Math.round(Number(row.amount) || 0),
      description: String(row.description || '').trim()
    };
    if (!prepared.date || !prepared.amount) {
      skipped.push({ reason: 'invalid', row });
      return;
    }
    const key = movementKey(prepared);
    if (skipDuplicates && existing.has(key)) {
      skipped.push({ reason: 'duplicate', row: prepared });
      return;
    }
    existing.add(key);
    const r = addBankMovement(prepared);
    imported.push(r.movement);
  });
  return {
    success: true,
    imported: imported.length,
    skipped: skipped.length,
    movements: imported,
    skipDetails: skipped.slice(0, 20)
  };
}

function parseAmountCell(raw) {
  let s = String(raw ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s || s === '-' || s === '—') return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/^\+/, '');
  if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || (s.includes('.') && s.includes(','))) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(Math.abs(n));
  return neg ? -rounded : rounded;
}

function parseDateCell(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const day = String(dmy[1]).padStart(2, '0');
    const month = String(dmy[2]).padStart(2, '0');
    return `${y}-${month}-${day}`;
  }
  return '';
}

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectSeparator(headerLine) {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis >= commas) return ';';
  return ',';
}

function normalizeHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parsea CSV de cartolas bancarias chilenas / MP.
 * Soporta: fecha+monto+glosa; o cargo/abono separados.
 */
function parseBankCsv(text = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return { success: false, error: 'CSV vacío', rows: [] };

  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { success: false, error: 'CSV sin filas de datos', rows: [] };

  const sep = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], sep).map(normalizeHeader);
  const idx = {
    date: headers.findIndex((h) => /^(fecha|date|fechacontable|fechamovimiento)$/.test(h)),
    description: headers.findIndex((h) => /^(descripcion|description|glosa|detalle|concepto|historial|narrativa)$/.test(h)),
    amount: headers.findIndex((h) => /^(monto|amount|importe|valor)$/.test(h)),
    cargo: headers.findIndex((h) => /^(cargo|cargos|debe|debito|retiro)$/.test(h)),
    abono: headers.findIndex((h) => /^(abono|abonos|haber|credito|deposito)$/.test(h)),
    reference: headers.findIndex((h) => /^(referencia|reference|nro|numero|iddocumento|paymentid|externalreference)$/.test(h))
  };

  if (idx.date < 0) {
    // fallback: primera columna fecha
    idx.date = 0;
  }
  if (idx.description < 0) {
    idx.description = Math.min(1, headers.length - 1);
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], sep);
    if (!cols.length || cols.every((c) => !c)) continue;
    const date = parseDateCell(cols[idx.date]);
    let amount = 0;
    if (idx.amount >= 0) {
      amount = parseAmountCell(cols[idx.amount]);
    } else if (idx.cargo >= 0 || idx.abono >= 0) {
      const cargo = idx.cargo >= 0 ? parseAmountCell(cols[idx.cargo]) : 0;
      const abono = idx.abono >= 0 ? parseAmountCell(cols[idx.abono]) : 0;
      amount = abono - Math.abs(cargo);
    }
    if (!date || !amount) {
      errors.push({ line: i + 1, error: 'fecha o monto inválido' });
      continue;
    }
    const description = idx.description >= 0 ? (cols[idx.description] || 'Movimiento') : 'Movimiento';
    const reference = idx.reference >= 0 ? (cols[idx.reference] || '') : '';
    const looksLikeFee = /comision|comisión|mantencion|mantenimiento|impuesto|iva\s*mp|fee/i.test(description);
    rows.push({
      date,
      amount,
      description: String(description).slice(0, 240),
      reference: String(reference).slice(0, 120),
      category: looksLikeFee ? 'fee' : 'payment',
      source: 'csv_import'
    });
  }

  return {
    success: rows.length > 0,
    error: rows.length ? null : 'No se pudieron leer movimientos del CSV',
    rows,
    parsed: rows.length,
    errors: errors.slice(0, 15),
    headers
  };
}

function importBankCsv(text) {
  const parsed = parseBankCsv(text);
  if (!parsed.success) return parsed;
  const result = importBankMovements(parsed.rows);
  return {
    ...result,
    parsed: parsed.parsed,
    parseErrors: parsed.errors
  };
}

function daysBetween(a, b) {
  const ta = Date.parse(String(a).slice(0, 10));
  const tb = Date.parse(String(b).slice(0, 10));
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / 86400000;
}

function scoreMatch(mov, payment) {
  const absAmount = Math.abs(mov.amount);
  const payAmount = Math.round(Number(payment.visitPaid || payment.amount || 0));
  if (Math.abs(payAmount - absAmount) > TOLERANCE) return -1;

  let score = 10;
  const ref = String(mov.reference || '');
  const desc = String(mov.description || '');
  if (ref && payment.paymentId && ref.includes(String(payment.paymentId))) score += 100;
  if (payment.id && (ref.includes(payment.id) || desc.includes(payment.id))) score += 80;
  if (payment.paymentId && desc.includes(String(payment.paymentId))) score += 60;

  const payDate = payment.paidAt || payment.createdAt || '';
  const gap = daysBetween(mov.date, payDate);
  if (gap <= DATE_WINDOW_DAYS) score += 40 - Math.floor(gap) * 5;
  else if (Number.isFinite(gap) && gap < 30) score += 5;
  else if (!payDate) score += 0;
  else score -= 20;

  if (mov.category === 'fee') score -= 50;
  return score;
}

/**
 * Conciliación automática: empareja movimientos abiertos con cobros
 * por monto (±$1), referencia y ventana de fecha.
 */
function autoReconcile(payments = []) {
  const state = loadState();
  const open = (state.bankMovements || []).filter((m) => m.status === 'open' && m.category !== 'fee');
  const unusedPayments = payments.filter((p) => p.paidAt && !p.reconciledAt);
  const matches = [];

  // Ya usados en matches previos
  const usedRequestIds = new Set(
    (state.bankMovements || [])
      .filter((m) => m.status === 'matched' && m.matchedRequestId)
      .map((m) => m.matchedRequestId)
  );
  const candidates = unusedPayments.filter((p) => !usedRequestIds.has(p.id));

  open.forEach((mov) => {
    let best = null;
    let bestScore = 25; // umbral mínimo
    candidates.forEach((p) => {
      const score = scoreMatch(mov, p);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    });
    if (!best) return;

    // Evitar match ambiguo: otro pago con score similar (±5) y mismo monto
    const ambiguous = candidates.filter((p) => {
      if (p === best) return false;
      const s = scoreMatch(mov, p);
      return s >= bestScore - 5 && s >= 25;
    });
    if (ambiguous.length) return;

    mov.status = 'matched';
    mov.matchedPaymentId = best.paymentId || null;
    mov.matchedRequestId = best.id;
    mov.matchedAt = new Date().toISOString();
    mov.matchScore = bestScore;
    matches.push({
      movementId: mov.id,
      requestId: best.id,
      amount: Math.abs(mov.amount),
      paymentId: best.paymentId || null,
      score: bestScore
    });
    const idx = candidates.indexOf(best);
    if (idx >= 0) candidates.splice(idx, 1);
  });

  if (matches.length) {
    state.reconciliations.unshift({
      id: `rc-${uuidv4().slice(0, 8)}`,
      at: new Date().toISOString(),
      matches,
      matchedCount: matches.length
    });
    saveState(state);
  } else {
    // persist status changes even if somehow empty — no-op save avoided
  }

  return {
    success: true,
    matched: matches.length,
    matches,
    openRemaining: (state.bankMovements || []).filter((m) => m.status === 'open').length
  };
}

function updateBankMovement(id, patch = {}) {
  const state = loadState();
  const mov = (state.bankMovements || []).find((m) => m.id === id);
  if (!mov) return { success: false, error: 'Movimiento no encontrado' };
  if (patch.status && ['open', 'matched', 'ignored'].includes(patch.status)) {
    mov.status = patch.status;
    if (patch.status === 'open') {
      mov.matchedPaymentId = null;
      mov.matchedRequestId = null;
      mov.matchedAt = null;
    }
    if (patch.status === 'ignored') {
      mov.matchedPaymentId = null;
      mov.matchedRequestId = null;
      mov.ignoredAt = new Date().toISOString();
    }
  }
  if (patch.category) mov.category = String(patch.category);
  if (patch.reference != null) mov.reference = String(patch.reference).trim();
  saveState(state);
  return { success: true, movement: mov };
}

function getReconciliationSummary(payments = [], period) {
  const p = period ? normalizePeriod(period) : null;
  let movements = listBankMovements();
  let pays = payments || [];
  if (p) {
    movements = movements.filter((m) => inPeriod(m.date, p));
    pays = pays.filter((pay) => inPeriod(pay.paidAt || pay.createdAt, p));
  }
  const matched = movements.filter((m) => m.status === 'matched');
  const open = movements.filter((m) => m.status === 'open');
  const ignored = movements.filter((m) => m.status === 'ignored');
  const approvedTotal = pays.reduce((s, pay) => s + (pay.visitPaid || pay.amount || 0), 0);
  const matchedTotal = matched.reduce((s, m) => s + Math.abs(m.amount), 0);
  const openCredits = open.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const openDebits = open.filter((m) => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0);
  return {
    period: p || null,
    movementsCount: movements.length,
    matchedCount: matched.length,
    openCount: open.length,
    ignoredCount: ignored.length,
    approvedPayments: pays.length,
    approvedTotal,
    matchedTotal,
    openCredits,
    openDebits,
    unreconciledEstimate: Math.max(0, approvedTotal - matchedTotal),
    coveragePct: approvedTotal > 0 ? Math.min(100, Math.round((matchedTotal / approvedTotal) * 100)) : 0,
    recent: (loadState().reconciliations || []).slice(0, 5)
  };
}

module.exports = {
  listBankMovements,
  addBankMovement,
  importBankMovements,
  importBankCsv,
  parseBankCsv,
  parseAmountCell,
  parseDateCell,
  autoReconcile,
  updateBankMovement,
  getReconciliationSummary
};
