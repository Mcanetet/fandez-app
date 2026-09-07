#!/usr/bin/env node
/**
 * Regenera gráficas de campaña socios con logo oficial Fandez (Florencia).
 * Uso: node scripts/generate-partner-campaign-graphics.js
 */
const path = require('path');
const { generatePartnerCampaignSet } = require('../lib/florencia/composeCreative');

async function main() {
  console.log('Generando campaña socios con isotipo oficial (app mark)…');
  const outcome = await generatePartnerCampaignSet();
  const results = outcome.results || [];
  console.log('mode:', outcome.mode, 'sharp:', outcome.sharp);
  results.forEach((r) => console.log('✓', r.file || path.basename(r.path), r.url || ''));
  console.log('Listo');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
