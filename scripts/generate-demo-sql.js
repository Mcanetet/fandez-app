#!/usr/bin/env node
/**
 * Genera db/fandez-demo.sql — esquema completo + datos demo para phpMyAdmin.
 * Uso: node scripts/generate-demo-sql.js
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const {
  SEED_SERVICES,
  SEED_MODULES,
  SEED_PROMOS,
  SEED_USERS,
  SEED_LOGBOOK,
  SEED_COMPLAINTS,
  SEED_CHATS,
  SEED_CONSENTS,
  SEED_SECURITY_LOGS
} = require('../models/repository');
const { DEFAULT_PRICING } = require('../lib/pricing');
const { flattenCatalog, flattenRegionsCatalog } = require('../lib/chile-geo');
const { DEFAULT_CONFIG } = require('../lib/aland/store');

const OUT = path.join(__dirname, '../db/fandez-demo.sql');
const SCHEMA = path.join(__dirname, '../db/fandez-schema-hostinger.sql');
const BCRYPT_ROUNDS = 12;

function q(str) {
  if (str == null) return 'NULL';
  return `'${String(str).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function j(obj) {
  if (obj == null) return 'NULL';
  return q(JSON.stringify(obj));
}

function dt(value) {
  if (!value) return 'NULL';
  const s = String(value).replace('T', ' ').replace(/\.\d{3}Z$/, '');
  return q(s);
}

function pedroLocationShareFixed() {
  return {
    consent: true,
    consentAt: '2025-10-01T12:00:00.000Z',
    lat: -33.442,
    lng: -70.654,
    updatedAt: '2025-10-01T12:00:00.000Z'
  };
}

function userToSqlRow(user, hashedPassword) {
  const locationShare = user.id === 'provider-pedro' || user.id === 'tecnico-pedro-demo'
    ? pedroLocationShareFixed()
    : user.locationShare || null;

  const emailVerified = user.emailVerifiedAt
    || (user.role === 'client' ? '2025-11-01 10:00:00' : null)
    || (user.role === 'admin' ? '2025-10-01 12:00:00' : null)
    || (user.role === 'provider' && user.providerContract?.status === 'approved' ? '2025-10-01 12:00:00' : null);

  return [
    q(user.id),
    q(user.email),
    q(hashedPassword),
    q(user.name),
    q(user.role),
    user.parentId ? q(user.parentId) : 'NULL',
    user.parentIds ? j(user.parentIds) : 'NULL',
    user.phone ? q(user.phone) : 'NULL',
    user.address ? q(user.address) : 'NULL',
    user.addressLat != null ? user.addressLat : (user.id === 'client-1' ? -33.4322 : 'NULL'),
    user.addressLng != null ? user.addressLng : (user.id === 'client-1' ? -70.6103 : 'NULL'),
    user.addressPlaceId ? q(user.addressPlaceId) : 'NULL',
    user.referralCode ? q(user.referralCode) : 'NULL',
    user.ziloPoints || 0,
    user.creditsCLP || 0,
    user.referralsCount || 0,
    user.servicesCount || 0,
    user.usedWelcomePromo ? 1 : 0,
    user.usedReferral ? 1 : 0,
    user.memberSince ? q(user.memberSince) : 'NULL',
    user.onboardingCompleted ? 1 : 0,
    user.onboardingCompletedAt ? dt(user.onboardingCompletedAt) : 'NULL',
    user.specialties ? j(user.specialties) : 'NULL',
    user.rating != null ? user.rating : 'NULL',
    user.reviewsCount || 0,
    user.online ? 1 : 0,
    user.avatar ? q(user.avatar) : 'NULL',
    user.bio ? q(user.bio) : 'NULL',
    user.reviews ? j(user.reviews) : 'NULL',
    user.verification ? j(user.verification) : 'NULL',
    locationShare ? j(locationShare) : 'NULL',
    user.billing ? j(user.billing) : 'NULL',
    user.mfa ? j(user.mfa) : 'NULL',
    user.adminAccess ? j(user.adminAccess) : 'NULL',
    user.providerContract ? j(user.providerContract) : 'NULL',
    user.active === false ? 0 : 1,
    emailVerified ? dt(emailVerified) : 'NULL',
    'NULL',
    'NULL',
    'NULL',
    user.clientEnabled ? 1 : 0
  ].join(', ');
}

function extractSchemaBody() {
  const raw = fs.readFileSync(SCHEMA, 'utf8');
  const start = raw.indexOf('SET NAMES utf8mb4');
  const end = raw.indexOf('SET FOREIGN_KEY_CHECKS = 1');
  if (start < 0 || end < 0) throw new Error('No se pudo leer fandez-schema-hostinger.sql');
  return raw.slice(start, end).trim();
}

function buildServicesSql() {
  const values = SEED_SERVICES.map((s) =>
    `(${q(s.id)}, ${q(s.name)}, ${q(s.icon)}, ${q(s.color)}, ${s.visitPrice}, ${s.basicMin}, ${s.basicMax}, ${q(s.description)}, ${s.enabled ? 1 : 0})`
  ).join(',\n');
  return `-- ---------- Servicios (9) ----------\n\nINSERT INTO services (id, name, icon, color, visit_price, basic_min, basic_max, description, enabled) VALUES\n${values}\nON DUPLICATE KEY UPDATE\n  name = VALUES(name), icon = VALUES(icon), color = VALUES(color),\n  visit_price = VALUES(visit_price), basic_min = VALUES(basic_min),\n  basic_max = VALUES(basic_max), description = VALUES(description), enabled = VALUES(enabled);`;
}

function buildModulesSql() {
  const values = SEED_MODULES.map((m) =>
    `(${q(m.id)}, ${q(m.audience)}, ${q(m.name)}, ${q(m.description)}, ${m.sortOrder}, ${m.enabled ? 1 : 0})`
  ).join(',\n');
  return `-- ---------- Módulos (cliente y socio) ----------\n\nINSERT INTO modules (id, audience, name, description, sort_order, enabled) VALUES\n${values}\nON DUPLICATE KEY UPDATE\n  name = VALUES(name), description = VALUES(description), sort_order = VALUES(sort_order), enabled = VALUES(enabled);`;
}

function buildPromosSql() {
  const values = SEED_PROMOS.map((p) =>
    `(${q(p.id)}, ${q(p.title)}, ${q(p.desc)}, ${p.code ? q(p.code) : 'NULL'}, ${q(p.color)}, ${p.sortOrder}, ${p.enabled ? 1 : 0}, ${p.discountPercent != null ? p.discountPercent : 'NULL'}, ${p.showBanner ? 1 : 0}, ${p.checkoutEnabled ? 1 : 0})`
  ).join(',\n');
  return `-- ---------- Promociones ----------\n\nINSERT INTO promos (id, title, description, code, color, sort_order, enabled, discount_percent, show_banner, checkout_enabled) VALUES\n${values}\nON DUPLICATE KEY UPDATE\n  title = VALUES(title), description = VALUES(description), code = VALUES(code),\n  color = VALUES(color), sort_order = VALUES(sort_order), enabled = VALUES(enabled),\n  discount_percent = VALUES(discount_percent), show_banner = VALUES(show_banner),\n  checkout_enabled = VALUES(checkout_enabled);`;
}

function buildPricingSql() {
  return `-- ---------- Configuración de precios ----------\n\nINSERT INTO pricing_config (id, config) VALUES ('default', ${j(DEFAULT_PRICING)})\nON DUPLICATE KEY UPDATE config = VALUES(config);`;
}

async function buildUsersSql() {
  const rows = [];
  for (const user of SEED_USERS) {
    const hashed = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    rows.push(`(${userToSqlRow(user, hashed)})`);
  }
  const cols = `id, email, password, name, role, parent_id, parent_ids, phone, address, address_lat, address_lng, address_place_id, referral_code,
  zilo_points, credits_clp, referrals_count, services_count,
  used_welcome_promo, used_referral, member_since,
  onboarding_completed, onboarding_completed_at,
  specialties, rating, reviews_count, online, avatar, bio, reviews, verification, location_share, billing, mfa, admin_access, provider_contract, active,
  email_verified_at, email_verification_code_hash, email_verification_expires_at, email_verification_sent_at, client_enabled`;
  return `-- ---------- Usuarios demo (contraseñas bcrypt) ----------\n-- cliente@fandez.cl / cliente123 | pedro@fandez.cl / proveedor123 | admin@fandez.cl / admin123\n\nINSERT INTO users (${cols}) VALUES\n${rows.join(',\n')}\nON DUPLICATE KEY UPDATE\n  email = VALUES(email), password = VALUES(password), name = VALUES(name), role = VALUES(role),\n  parent_id = VALUES(parent_id), parent_ids = VALUES(parent_ids),\n  phone = VALUES(phone), address = VALUES(address), address_lat = VALUES(address_lat), address_lng = VALUES(address_lng),\n  referral_code = VALUES(referral_code), zilo_points = VALUES(zilo_points), credits_clp = VALUES(credits_clp),\n  specialties = VALUES(specialties), rating = VALUES(rating), reviews_count = VALUES(reviews_count),\n  avatar = VALUES(avatar), bio = VALUES(bio), reviews = VALUES(reviews),\n  verification = VALUES(verification), location_share = VALUES(location_share),\n  billing = VALUES(billing), admin_access = VALUES(admin_access),\n  provider_contract = VALUES(provider_contract), email_verified_at = VALUES(email_verified_at);`;
}

function buildCoverageSql() {
  const regions = flattenRegionsCatalog().map((r) =>
    `(${q(r.regionCode)}, ${q(r.regionName)}, ${r.enabled ? 1 : 0})`
  ).join(',\n');
  const communes = flattenCatalog().map((c) =>
    `(${q(c.regionCode)}, ${q(c.communeCode)}, ${q(c.regionName)}, ${q(c.communeName)}, ${c.enabled ? 1 : 0})`
  ).join(',\n');
  return `-- ---------- Cobertura territorial (Chile) ----------\n\nINSERT INTO coverage_regions (region_code, region_name, enabled) VALUES\n${regions}\nON DUPLICATE KEY UPDATE region_name = VALUES(region_name), enabled = VALUES(enabled);\n\nINSERT INTO coverage_communes (region_code, commune_code, region_name, commune_name, enabled) VALUES\n${communes}\nON DUPLICATE KEY UPDATE region_name = VALUES(region_name), commune_name = VALUES(commune_name), enabled = VALUES(enabled);`;
}

function buildLogbookSql() {
  const values = SEED_LOGBOOK.map((e) =>
    `(${q(e.id)}, ${q(e.clientId)}, ${q(e.address)}, ${q(e.serviceName)}, ${q(e.category)}, ${q(e.date)}, ${q(e.note)}, ${e.healthImpact}, ${q(e.providerName)})`
  ).join(',\n');
  return `-- ---------- Pasaporte Hogar ----------\n\nINSERT IGNORE INTO home_logbook (id, client_id, address, service_name, category, entry_date, note, health_impact, provider_name) VALUES\n${values};`;
}

function buildComplaintsSql() {
  const values = SEED_COMPLAINTS.map((c) =>
    `(${q(c.id)}, NULL, ${q(c.clientName)}, ${q(c.clientEmail)}, ${q(c.type)}, ${q(c.subject)}, ${q(c.description)}, ${q(c.status)}, ${q(c.priority)}, ${dt(c.createdAt)}, ${c.resolvedAt ? dt(c.resolvedAt) : 'NULL'})`
  ).join(',\n');
  return `-- ---------- Reclamos de ejemplo ----------\n\nINSERT IGNORE INTO complaints (id, request_id, client_name, client_email, type, subject, description, status, priority, created_at, resolved_at) VALUES\n${values};`;
}

function buildChatsSql() {
  const values = SEED_CHATS.map((c) =>
    `(${q(c.id)}, ${q(c.clientName)}, ${q(c.clientPhone)}, ${q(c.lastMessage)}, ${q(c.channel)}, ${q(c.status)}, ${c.unread}, ${dt(c.updatedAt)})`
  ).join(',\n');
  return `-- ---------- Chats WhatsApp ----------\n\nINSERT IGNORE INTO chats (id, client_name, client_phone, last_message, channel, status, unread, updated_at) VALUES\n${values};`;
}

function buildConsentsSql() {
  const values = SEED_CONSENTS.map((c) =>
    `(${q(c.id)}, ${c.userId ? q(c.userId) : 'NULL'}, ${c.ip ? q(c.ip) : 'NULL'}, ${q(c.type)}, ${c.granted ? 1 : 0}, ${q(c.version)}, NULL, ${dt(c.createdAt)})`
  ).join(',\n');
  return `-- ---------- Consentimientos ----------\n\nINSERT IGNORE INTO consent_records (id, user_id, ip, type, granted, version, user_agent, created_at) VALUES\n${values};`;
}

function buildSecuritySql() {
  const values = SEED_SECURITY_LOGS.map((l) =>
    `(${q(l.id)}, ${q(l.event)}, ${l.detail ? q(l.detail) : 'NULL'}, ${l.user ? q(l.user) : 'NULL'}, ${l.ip ? q(l.ip) : 'NULL'}, ${dt(l.createdAt)})`
  ).join(',\n');
  return `-- ---------- Registros de seguridad ----------\n\nINSERT IGNORE INTO security_logs (id, event, detail, \`user\`, ip, created_at) VALUES\n${values};`;
}

function buildAlandSql() {
  const knowledge = [
    { id: 'know-company', source_type: 'company', service_id: null, title: 'Qué es Fandez', content: 'Fandez es una plataforma on-demand de servicios del hogar en Santiago, Chile. Conecta clientes con socios técnicos verificados.', sort_order: 1 },
    { id: 'know-pricing', source_type: 'pricing', service_id: null, title: 'Cómo se cobra la visita', content: 'El cliente paga una visita de diagnóstico al solicitar. El trabajo adicional se cotiza en terreno con presupuesto visible en la app.', sort_order: 2 },
    { id: 'know-coverage', source_type: 'custom', service_id: null, title: 'Cobertura', content: 'Operamos principalmente en la Región Metropolitana. La cobertura exacta se valida por comuna al solicitar un servicio.', sort_order: 3 }
  ];
  const kValues = knowledge.map((k) =>
    `(${q(k.id)}, ${q(k.source_type)}, NULL, ${q(k.title)}, ${q(k.content)}, 1, ${k.sort_order}, NOW(), NOW())`
  ).join(',\n');
  return `-- ---------- Aland IA ----------\n\nINSERT INTO aland_config (id, config) VALUES ('default', ${j(DEFAULT_CONFIG)})\nON DUPLICATE KEY UPDATE config = VALUES(config);\n\nINSERT INTO aland_knowledge (id, source_type, service_id, title, content, active, sort_order, created_at, updated_at) VALUES\n${kValues}\nON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), active = VALUES(active);`;
}

function buildCrmSql() {
  return `-- ---------- CRM (lead de ejemplo) ----------\n\nINSERT INTO crm_leads (id, company_name, contact_name, email, phone, rut, pipeline_stage, interested_services, coverage_area, source, notes, created_at, updated_at) VALUES\n('crm-demo-1', 'Servicios RM SpA', 'Roberto Soto', 'roberto@serviciosrm.cl', '+56 9 5555 1234', '76.123.456-7', 'reunion', 'electrico,gasfiter', 'Región Metropolitana', 'web', 'Lead demo — interesado en unirse como socio electricista.', NOW(), NOW())\nON DUPLICATE KEY UPDATE company_name = VALUES(company_name), contact_name = VALUES(contact_name);`;
}

function buildRequestsSql() {
  const completedPayload = {
    serviceName: 'Gásfiter',
    serviceId: 'gasfiter',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    status: 'completed',
    paymentStatus: 'paid',
    visitPrice: 105000,
    totalPaid: 105000,
    urgencyTier: 'today',
    clientName: 'María González',
    demo: true
  };
  const searchingPayload = {
    serviceName: 'Eléctrico',
    serviceId: 'electrico',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    status: 'searching',
    paymentStatus: 'paid',
    visitPrice: 100000,
    totalPaid: 100000,
    urgencyTier: 'immediate',
    clientName: 'María González',
    demo: true
  };
  return `-- ---------- Solicitudes de ejemplo ----------\n\nINSERT INTO service_requests (id, client_id, provider_id, service_id, status, payment_status, payload, created_at, updated_at) VALUES\n('req-demo-completed', 'client-1', 'provider-pedro', 'gasfiter', 'completed', 'paid', ${j(completedPayload)}, '2026-06-15 14:00:00', '2026-06-15 18:30:00'),\n('req-demo-searching', 'client-1', NULL, 'electrico', 'searching', 'paid', ${j(searchingPayload)}, '2026-06-30 10:00:00', '2026-06-30 10:05:00')\nON DUPLICATE KEY UPDATE status = VALUES(status), payload = VALUES(payload);`;
}

function buildFlorenciaSql() {
  const content = JSON.stringify({ body: '¿Problemas con tu termo? En Fandez un técnico verificado puede revisarlo hoy en tu comuna.', hashtags: ['Fandez', 'Santiago', 'Hogar'] });
  return `-- ---------- Florencia (contenido demo) ----------\n\nINSERT INTO florencia_marketing_items (id, kind, title, channel, status, scheduled_at, content, created_at, updated_at) VALUES\n('flor-demo-1', 'content', 'Post termos — demo', 'instagram', 'draft', NULL, ${q(content)}, NOW(), NOW())\nON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content);`;
}

function buildNotificationsSql() {
  return `-- ---------- Notificación de ejemplo ----------\n\nINSERT IGNORE INTO notifications (id, event, channel, status, recipient, subject, body, created_at) VALUES\n('notif-demo-1', 'payment_confirmed', 'email', 'sent', 'cliente@fandez.cl', 'Pago confirmado — Fandez', 'Tu pago de visita Gásfiter fue confirmado. Un socio te contactará pronto.', '2026-06-30 10:01:00');`;
}

async function main() {
  const header = `-- ============================================================
-- Fandez — Esquema completo + datos demo (Hostinger phpMyAdmin)
-- ============================================================
-- Base de datos: u482073296_fandez_bd
--
-- Cómo importar:
--   1. hPanel → Databases → u482073296_fandez_bd → phpMyAdmin
--   2. Import → este archivo → Go
--
-- Re-importable (ON DUPLICATE KEY / INSERT IGNORE).
-- Contraseñas demo en bcrypt (login directo en la app).
--
-- Credenciales:
--   Cliente:   cliente@fandez.cl   / cliente123
--   Proveedor: pedro@fandez.cl     / proveedor123 (KYC + contrato OK)
--   Técnico:   tecnico.pedro@fandez.cl / tecnico123
--   Admin:     admin@fandez.cl     / admin123
-- ============================================================
-- Generado: ${new Date().toISOString()}
`;

  const parts = [
    header,
    extractSchemaBody(),
    buildServicesSql(),
    buildModulesSql(),
    buildPromosSql(),
    buildPricingSql(),
    await buildUsersSql(),
    buildCoverageSql(),
    buildAlandSql(),
    buildCrmSql(),
    buildRequestsSql(),
    buildLogbookSql(),
    buildComplaintsSql(),
    buildChatsSql(),
    buildConsentsSql(),
    buildSecuritySql(),
    buildNotificationsSql(),
    buildFlorenciaSql(),
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
    '-- Listo: 24 tablas + datos demo.'
  ];

  fs.writeFileSync(OUT, parts.join('\n\n'), 'utf8');
  console.log(`✅ Generado: ${OUT}`);
  console.log(`   Servicios: ${SEED_SERVICES.length} | Usuarios: ${SEED_USERS.length} | Comunas: ${flattenCatalog().length}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
