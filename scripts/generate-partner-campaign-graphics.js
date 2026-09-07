#!/usr/bin/env node
/**
 * Regenera gráficas de campaña socios con logo oficial Fandez (Florencia).
 * Uso: node scripts/generate-partner-campaign-graphics.js
 */
const path = require('path');
const { generatePartnerCampaignSet } = require('../lib/florencia/composeCreative');

async function main() {
  const outDir = path.join(__dirname, '../marketing/lanzamiento-socios');
  console.log('Generando campaña socios con isotipo oficial…');
  const results = await generatePartnerCampaignSet(outDir);
  results.forEach((r) => console.log('✓', path.basename(r.path), `${r.width}x${r.height}`));
  console.log('Listo:', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
