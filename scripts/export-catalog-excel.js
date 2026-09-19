#!/usr/bin/env node
/**
 * Exporta catálogo Fandez a Excel:
 *  - Actividades por rubro (precio mano de obra + materiales tipicos)
 *  - Materiales por rubro (precio mercado)
 *  - Notas de precios (visita, comisiones)
 *
 * Uso: node scripts/export-catalog-excel.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  SERVICE_CATALOG,
  SERVICE_TO_SPECIALTY
} = require('../lib/serviceCatalogData');
const { DEFAULT_MATERIALS_CATALOG } = require('../lib/materials/catalog');
const { MIN_DIAGNOSTIC_VISIT_CLP } = require('../lib/dynamicTariffs');

const SPECIALTY_TO_APP = {};
Object.entries(SERVICE_TO_SPECIALTY).forEach(([appId, specialtyId]) => {
  if (!SPECIALTY_TO_APP[specialtyId]) SPECIALTY_TO_APP[specialtyId] = appId;
});
SPECIALTY_TO_APP.gasfiteria = 'gasfiter';
SPECIALTY_TO_APP.electricidad = 'electrico';
SPECIALTY_TO_APP['aire-acondicionado'] = 'aires';
SPECIALTY_TO_APP['termos-electricos'] = 'termos';
SPECIALTY_TO_APP.cerrajeria = 'cerrajero';

function clp(n) {
  return Math.round(Number(n) || 0);
}

function formatClp(n) {
  return clp(n).toLocaleString('es-CL');
}

function materialsForApp(appId) {
  return DEFAULT_MATERIALS_CATALOG.filter(
    (m) => m.enabled !== false && Array.isArray(m.specialtyIds) && m.specialtyIds.includes(appId)
  );
}

function activityDescription(act) {
  const kind = act.kind === 'preventiva' ? 'Mantención preventiva' : 'Servicio correctivo / reparación';
  const parts = [
    `${kind}: ${act.name}.`,
    'Incluye diagnóstico en domicilio, mano de obra y herramientas del técnico.'
  ];
  if (act.pricingUnit === 'm2' || act.pricePerM2) {
    const min = act.minM2 || 15;
    parts.push(`Tarifa por m² (mínimo referencial ${min} m²).`);
  }
  if (act.quoteMode === 'landscape') {
    parts.push('Proyecto de paisajismo: cotización según estándar, terreno y especies.');
  }
  parts.push('Materiales se cotizan aparte según necesidad (precios de mercado referenciales).');
  return parts.join(' ');
}

function materialsText(mats) {
  if (!mats.length) return 'Sin materiales tipificados en catálogo (se cotizan en visita).';
  return mats
    .map((m) => `${m.name} (${m.unit}): $${formatClp(m.marketPrice)}`)
    .join('; ');
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sheetXml(name, headers, rows) {
  const cols = headers.map((_, i) => `<Column ss:AutoFitWidth="1" ss:Width="${i === 0 ? 120 : i === 2 ? 320 : 140}"/>`).join('');
  const headerRow = `<Row ss:StyleID="Header">${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`;
  const dataRows = rows.map((row) => {
    const cells = row.map((cell) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('\n');
  return `
<Worksheet ss:Name="${escapeXml(name)}">
  <Table>
    ${cols}
    ${headerRow}
    ${dataRows}
  </Table>
</Worksheet>`;
}

function buildWorkbook() {
  const activityRows = [];
  const materialRows = [];

  SERVICE_CATALOG.forEach((specialty) => {
    const appId = SPECIALTY_TO_APP[specialty.id] || specialty.id;
    const mats = materialsForApp(appId);
    const matsText = materialsText(mats);

    (specialty.activities || []).forEach((act) => {
      const isM2 = act.pricingUnit === 'm2' || act.pricePerM2;
      const price = isM2 ? clp(act.pricePerM2 || act.basePrice) : clp(act.basePrice);
      const unit = isM2 ? 'CLP / m²' : 'CLP (horario normal)';
      activityRows.push([
        specialty.name,
        act.name,
        activityDescription(act),
        act.kind === 'preventiva' ? 'Preventiva' : 'Correctiva',
        price,
        unit,
        matsText,
        act.id
      ]);
    });

    mats.forEach((m) => {
      materialRows.push([
        specialty.name,
        m.name,
        m.unit,
        clp(m.marketPrice),
        'CLP mercado referencial',
        m.id
      ]);
    });
  });

  // Materiales que no matchearon un specialty de catálogo (por si quedan huérfanos)
  const covered = new Set(materialRows.map((r) => r[5]));
  DEFAULT_MATERIALS_CATALOG.filter((m) => m.enabled !== false && !covered.has(m.id)).forEach((m) => {
    materialRows.push([
      (m.specialtyIds || []).join(', ') || 'General',
      m.name,
      m.unit,
      clp(m.marketPrice),
      'CLP mercado referencial',
      m.id
    ]);
  });

  const notesRows = [
    ['Visita / diagnóstico a domicilio', clp(MIN_DIAGNOSTIC_VISIT_CLP), 'CLP', 'Se cobra si no se ejecuta el trabajo o según reglas del servicio'],
    ['Precios de actividades', '', '', 'Mano de obra en horario normal; pueden aplicar recargos tarde/noche/urgencia'],
    ['Materiales', '', '', 'Referenciales de mercado; el socio cotiza lo usado en la visita. Comisión materiales Fandez: 0%'],
    ['Jardinería', '', '', 'Varias actividades van por m² (mínimo de superficie aplica)'],
    ['Paisajismo', '', '', 'Cotización por proyecto (estándar + terreno + especies)'],
    ['Fuente', '', '', 'Catálogo base Fandez (lib/serviceCatalogData.js + lib/materials/catalog.js)'],
    ['Fecha exportación', '', '', new Date().toISOString().slice(0, 10)]
  ];

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#F6E6D4" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${sheetXml(
   'Actividades',
   ['Rubro', 'Actividad', 'Descripción', 'Tipo', 'Precio mano de obra', 'Unidad precio', 'Materiales tipicos (catálogo)', 'ID actividad'],
   activityRows
 )}
 ${sheetXml(
   'Materiales',
   ['Rubro', 'Material', 'Unidad', 'Precio mercado', 'Moneda / nota', 'ID material'],
   materialRows
 )}
 ${sheetXml(
   'Notas precios',
   ['Concepto', 'Valor', 'Unidad', 'Detalle'],
   notesRows
 )}
</Workbook>`;

  return { xml, activityCount: activityRows.length, materialCount: materialRows.length };
}

function main() {
  const outDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `fandez-actividades-materiales-precios-${stamp}.xls`);
  const { xml, activityCount, materialCount } = buildWorkbook();
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log(`OK → ${outPath}`);
  console.log(`Actividades: ${activityCount} · Materiales: ${materialCount}`);
}

main();
