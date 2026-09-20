/**
 * Briefs de reunión con socios / proveedores para crear servicios nuevos.
 * Guarda las respuestas del procedimiento docs/procesos/06-reunion-nuevo-servicio.md
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');

let memory = [];
let tableReady = false;

const STATUSES = [
  { id: 'borrador', label: 'Borrador (en reunión)' },
  { id: 'completo', label: 'Completo (listo para producto)' },
  { id: 'en_desarrollo', label: 'En desarrollo en app' },
  { id: 'publicado', label: 'Publicado' },
  { id: 'descartado', label: 'Descartado' }
];

async function ensureTable() {
  if (!db.isConfigured || !db.isConfigured()) return false;
  if (tableReady) return true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS service_briefs (
      id VARCHAR(64) PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'borrador',
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      phone VARCHAR(64) DEFAULT NULL,
      rubro VARCHAR(255) DEFAULT NULL,
      audience VARCHAR(64) DEFAULT NULL,
      comunas TEXT DEFAULT NULL,
      answers_json JSON NOT NULL,
      prompt_text MEDIUMTEXT DEFAULT NULL,
      crm_lead_id VARCHAR(64) DEFAULT NULL,
      provider_id VARCHAR(64) DEFAULT NULL,
      created_by VARCHAR(64) DEFAULT NULL,
      updated_by VARCHAR(64) DEFAULT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      KEY idx_briefs_status (status),
      KEY idx_briefs_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
  return true;
}

function newId() {
  return `brief-${crypto.randomBytes(6).toString('hex')}`;
}

function emptyAnswers() {
  return {
    // A — Quiénes son
    a_razon_social: '',
    a_rut: '',
    a_anos_rubro: '',
    a_cobertura: '',
    a_tipos_cliente: '',
    a_equipos_online: '',
    a_seguro_rc: '',
    a_boleta_factura: '',
    a_disponibilidad: '',
    // B — Catálogo (texto libre + packs)
    b_packs: '',
    b_incluye_no_incluye: '',
    b_unidad_trabajo: '',
    b_duracion_cuadrilla: '',
    b_diagnostico_previo: '',
    // C — Precio
    c_unidad_cobro: '',
    c_tarifa_base: '',
    c_minimo_job: '',
    c_factores_suben: '',
    c_factores_bajan: '',
    c_addons: '',
    c_materiales: '',
    c_recurrencia: '',
    c_tope_cotizar: '',
    c_formula: '',
    // D — Intake
    d_campos_obligatorios: '',
    d_campos_opcionales: '',
    d_fotos: '',
    d_acceso: '',
    d_especiales: '',
    // E — Ops
    e_cancelaciones: '',
    e_realidad_distinta: '',
    e_reagendamiento: '',
    e_evidencia_cierre: '',
    // F — Cierre
    f_split_ok: '',
    f_plazo_tarifas: '',
    f_piloto: '',
    f_notas: ''
  };
}

function normalizeAnswers(raw) {
  const base = emptyAnswers();
  const src = raw && typeof raw === 'object' ? raw : {};
  Object.keys(base).forEach((k) => {
    if (src[k] != null) base[k] = String(src[k]);
  });
  return base;
}

function buildPrompt(brief) {
  const a = brief.answers || emptyAnswers();
  return [
    `# BRIEF SERVICIO FANDEZ — ${brief.rubro || brief.companyName || 'SIN NOMBRE'}`,
    '',
    '## Meta',
    'Crear servicio cliente en app Fandez con precio calculado 100% desde intake.',
    '',
    '## Identidad',
    `- empresa: ${brief.companyName || '—'}`,
    `- contacto: ${brief.contactName || '—'} · ${brief.email || ''} · ${brief.phone || ''}`,
    `- rubro: ${brief.rubro || '—'}`,
    `- B2C/B2B: ${brief.audience || '—'}`,
    `- comunas piloto: ${brief.comunas || '—'}`,
    '',
    '## Modelo económico',
    '- Split: 15% Fandez / ~3% tarjeta / 82% socio (transporte ⊂ 82%)',
    `- Materiales: ${a.c_materiales || '—'}`,
    '',
    '## Quiénes son',
    a.a_razon_social || a.a_cobertura || a.a_equipos_online
      ? [
        `- Razón/RUT: ${a.a_razon_social || '—'} / ${a.a_rut || '—'}`,
        `- Años / cobertura: ${a.a_anos_rubro || '—'} · ${a.a_cobertura || '—'}`,
        `- Clientes: ${a.a_tipos_cliente || '—'}`,
        `- Capacidad online: ${a.a_equipos_online || '—'}`,
        `- Seguro / DTE: ${a.a_seguro_rc || '—'} · ${a.a_boleta_factura || '—'}`,
        `- Disponibilidad: ${a.a_disponibilidad || '—'}`
      ].join('\n')
      : '(sin datos)',
    '',
    '## Actividades / packs',
    a.b_packs || '(pendiente)',
    '',
    'Incluye / no incluye:',
    a.b_incluye_no_incluye || '—',
    '',
    `Unidad: ${a.b_unidad_trabajo || '—'} · Duración/cuadrilla: ${a.b_duracion_cuadrilla || '—'}`,
    `Diagnóstico previo: ${a.b_diagnostico_previo || '—'}`,
    '',
    '## Fórmula / tarifas',
    a.c_formula || [
      `Unidad cobro: ${a.c_unidad_cobro || '—'}`,
      `Base: ${a.c_tarifa_base || '—'} · Mínimo: ${a.c_minimo_job || '—'}`,
      `Suben: ${a.c_factores_suben || '—'}`,
      `Bajan: ${a.c_factores_bajan || '—'}`,
      `Add-ons: ${a.c_addons || '—'}`,
      `Recurrencia: ${a.c_recurrencia || '—'}`,
      `Tope: ${a.c_tope_cotizar || '—'}`
    ].join('\n'),
    '',
    '## Intake (campos app)',
    `Obligatorios:\n${a.d_campos_obligatorios || '—'}`,
    `Opcionales:\n${a.d_campos_opcionales || '—'}`,
    `Fotos: ${a.d_fotos || '—'}`,
    `Acceso: ${a.d_acceso || '—'}`,
    `Especiales: ${a.d_especiales || '—'}`,
    '',
    '## Ops / riesgos',
    `- Cancelaciones: ${a.e_cancelaciones || '—'}`,
    `- Realidad ≠ declarado: ${a.e_realidad_distinta || '—'}`,
    `- Reagendamiento: ${a.e_reagendamiento || '—'}`,
    `- Evidencia cierre: ${a.e_evidencia_cierre || '—'}`,
    '',
    '## Cierre',
    `- Split OK: ${a.f_split_ok || '—'}`,
    `- Plazo tarifas: ${a.f_plazo_tarifas || '—'}`,
    `- Piloto: ${a.f_piloto || '—'}`,
    `- Notas: ${a.f_notas || '—'}`,
    '',
    'Split fijo 15/3/82. Dirección desde perfil del cliente.'
  ].join('\n');
}

function rowToBrief(row) {
  let answers = emptyAnswers();
  try {
    const raw = row.answers_json ?? row.answersJson ?? row.answers;
    if (typeof raw === 'string') answers = normalizeAnswers(JSON.parse(raw));
    else if (raw && typeof raw === 'object') answers = normalizeAnswers(raw);
  } catch (_) { /* ignore */ }
  return {
    id: row.id,
    status: row.status || 'borrador',
    companyName: row.company_name || row.companyName || '',
    contactName: row.contact_name || row.contactName || '',
    email: row.email || '',
    phone: row.phone || '',
    rubro: row.rubro || '',
    audience: row.audience || '',
    comunas: row.comunas || '',
    answers,
    promptText: row.prompt_text || row.promptText || '',
    crmLeadId: row.crm_lead_id || row.crmLeadId || null,
    providerId: row.provider_id || row.providerId || null,
    createdBy: row.created_by || row.createdBy || null,
    updatedBy: row.updated_by || row.updatedBy || null,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function toPublic(brief) {
  return {
    ...brief,
    statusLabel: (STATUSES.find((s) => s.id === brief.status) || {}).label || brief.status
  };
}

async function listBriefs({ limit = 100 } = {}) {
  try {
    if (await ensureTable()) {
      const result = await db.query(
        `SELECT * FROM service_briefs ORDER BY updated_at DESC LIMIT ?`,
        [Math.min(200, Math.max(1, limit))]
      );
      return (result.rows || []).map(rowToBrief).map(toPublic);
    }
  } catch (err) {
    console.warn('[service-briefs] list:', err.message);
  }
  return memory
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit)
    .map(toPublic);
}

async function getBrief(id) {
  const list = await listBriefs({ limit: 200 });
  return list.find((b) => b.id === id) || null;
}

async function upsertBrief(input = {}, { userId = null } = {}) {
  const id = String(input.id || '').trim() || newId();
  const existing = memory.find((b) => b.id === id) || (await getBrief(id));
  const companyName = String(input.companyName || existing?.companyName || '').trim();
  if (!companyName) return { error: 'Indica la empresa o nombre del socio' };

  const answers = normalizeAnswers({
    ...(existing?.answers || {}),
    ...(input.answers && typeof input.answers === 'object' ? input.answers : {})
  });

  // Permitir campos planos a_* desde el form
  Object.keys(emptyAnswers()).forEach((k) => {
    if (input[k] != null) answers[k] = String(input[k]);
  });

  const status = STATUSES.some((s) => s.id === input.status)
    ? input.status
    : (existing?.status || 'borrador');

  const now = new Date().toISOString();
  const brief = {
    id,
    status,
    companyName,
    contactName: String(input.contactName ?? existing?.contactName ?? '').trim(),
    email: String(input.email ?? existing?.email ?? '').trim(),
    phone: String(input.phone ?? existing?.phone ?? '').trim(),
    rubro: String(input.rubro ?? existing?.rubro ?? '').trim(),
    audience: String(input.audience ?? existing?.audience ?? '').trim(),
    comunas: String(input.comunas ?? existing?.comunas ?? '').trim(),
    answers,
    promptText: '',
    crmLeadId: input.crmLeadId ?? existing?.crmLeadId ?? null,
    providerId: input.providerId ?? existing?.providerId ?? null,
    createdBy: existing?.createdBy || userId,
    updatedBy: userId,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  brief.promptText = String(input.promptText || '').trim() || buildPrompt(brief);

  const idx = memory.findIndex((b) => b.id === id);
  if (idx >= 0) memory[idx] = brief;
  else memory.unshift(brief);
  if (memory.length > 300) memory = memory.slice(0, 300);

  try {
    if (await ensureTable()) {
      const created = (brief.createdAt || now).slice(0, 19).replace('T', ' ');
      const updated = now.slice(0, 19).replace('T', ' ');
      await db.query(
        `INSERT INTO service_briefs (
          id, status, company_name, contact_name, email, phone, rubro, audience, comunas,
          answers_json, prompt_text, crm_lead_id, provider_id, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          company_name = VALUES(company_name),
          contact_name = VALUES(contact_name),
          email = VALUES(email),
          phone = VALUES(phone),
          rubro = VALUES(rubro),
          audience = VALUES(audience),
          comunas = VALUES(comunas),
          answers_json = VALUES(answers_json),
          prompt_text = VALUES(prompt_text),
          crm_lead_id = VALUES(crm_lead_id),
          provider_id = VALUES(provider_id),
          updated_by = VALUES(updated_by),
          updated_at = VALUES(updated_at)`,
        [
          brief.id,
          brief.status,
          brief.companyName,
          brief.contactName || null,
          brief.email || null,
          brief.phone || null,
          brief.rubro || null,
          brief.audience || null,
          brief.comunas || null,
          JSON.stringify(brief.answers),
          brief.promptText,
          brief.crmLeadId || null,
          brief.providerId || null,
          brief.createdBy || null,
          brief.updatedBy || null,
          created,
          updated
        ]
      );
    }
  } catch (err) {
    console.warn('[service-briefs] save:', err.message);
  }

  return { success: true, brief: toPublic(brief) };
}

async function deleteBrief(id) {
  memory = memory.filter((b) => b.id !== id);
  try {
    if (await ensureTable()) {
      await db.query('DELETE FROM service_briefs WHERE id = ?', [id]);
    }
  } catch (err) {
    console.warn('[service-briefs] delete:', err.message);
  }
  return { success: true };
}

module.exports = {
  STATUSES,
  emptyAnswers,
  buildPrompt,
  ensureTable,
  listBriefs,
  getBrief,
  upsertBrief,
  deleteBrief
};
