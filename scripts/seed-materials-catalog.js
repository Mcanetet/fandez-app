#!/usr/bin/env node
/**
 * Sincroniza el catálogo completo de productos/materiales en pricing_config (MySQL).
 * Fusiona DEFAULT_MATERIALS_CATALOG con lo ya guardado (precios custom del admin se conservan).
 *
 * Uso: node scripts/seed-materials-catalog.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../lib/db');
const { normalizePricing, DEFAULT_PRICING } = require('../lib/pricing');
const { DEFAULT_MATERIALS_CATALOG } = require('../lib/materials/catalog');

async function main() {
  if (!db.isConfigured()) {
    console.error('DB no configurada (.env con DB_HOST / DB_USER / DB_NAME).');
    process.exit(1);
  }

  const res = await db.query('SELECT config FROM pricing_config WHERE id = ?', ['default']);
  let raw = {};
  if (res.rows.length) {
    const cfg = res.rows[0].config;
    raw = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
  } else {
    raw = { ...DEFAULT_PRICING };
  }
  const before = Array.isArray(raw.materialsCatalog) ? raw.materialsCatalog.length : 0;
  const normalized = normalizePricing({
    ...raw,
    materialsCatalog: raw.materialsCatalog
  });
  const after = normalized.materialsCatalog.length;

  await db.query(
    `INSERT INTO pricing_config (id, config) VALUES ('default', ?)
     ON DUPLICATE KEY UPDATE config = VALUES(config)`,
    [JSON.stringify(normalized)]
  );

  const byService = {};
  for (const m of normalized.materialsCatalog.filter((x) => x.enabled !== false)) {
    const specs = m.specialtyIds?.length ? m.specialtyIds : ['(todos)'];
    specs.forEach((s) => {
      byService[s] = (byService[s] || 0) + 1;
    });
  }

  console.log(`OK — materiales en DB: ${before} → ${after} (defaults código: ${DEFAULT_MATERIALS_CATALOG.length})`);
  console.log('Por servicio:', byService);
  await db.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try { await db.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
