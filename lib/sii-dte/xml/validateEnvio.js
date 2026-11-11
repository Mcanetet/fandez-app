/**
 * Chequeos estructurales del EnvioDTE antes de subir al SII.
 * No reemplaza xmllint, pero atrapa el error que más hemos visto:
 * Signature dentro de Documento (debe ser hermana, dentro de DTE).
 */
'use strict';

function assertEnvioStructure(envioXml) {
  const xml = String(envioXml || '');
  if (!xml.includes('<EnvioDTE')) {
    return { ok: false, error: 'XML sin raíz EnvioDTE' };
  }
  if (!xml.includes('</EnvioDTE>')) {
    return { ok: false, error: 'XML EnvioDTE sin cierre' };
  }
  if (!/xsi:schemaLocation\s*=\s*["'][^"']*EnvioDTE_v10\.xsd/i.test(xml)) {
    return {
      ok: false,
      error: 'Falta xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" (SCH-00001)'
    };
  }
  const dteBlocks = xml.match(/<DTE\b[^>]*>[\s\S]*?<\/DTE>/gi) || [];
  if (!dteBlocks.length) {
    return { ok: false, error: 'EnvioDTE sin bloques <DTE>' };
  }
  for (let i = 0; i < dteBlocks.length; i += 1) {
    const block = dteBlocks[i];
    const sigInsideDoc = /<Documento\b[\s\S]*?<Signature\b[\s\S]*?<\/Signature>[\s\S]*?<\/Documento>/i.test(block);
    if (sigInsideDoc) {
      return {
        ok: false,
        error:
          `DTE #${i + 1}: Signature está DENTRO de Documento. ` +
          'El XSD del SII exige Signature como hermana de Documento (hijo de DTE). Redeploy a 85562a0+.'
      };
    }
    const hasDoc = /<Documento\b/i.test(block);
    const hasSig = /<Signature\b/i.test(block);
    if (hasDoc && !hasSig) {
      return { ok: false, error: `DTE #${i + 1}: falta Signature` };
    }
    // Hermana: </Documento> ... <Signature
    if (hasDoc && hasSig && !/<\/Documento>\s*<Signature\b/i.test(block)) {
      return {
        ok: false,
        error: `DTE #${i + 1}: Signature no sigue a </Documento> (orden inválido)`
      };
    }
  }
  if (!/<KeyValue>\s*<RSAKeyValue>/i.test(xml)) {
    return {
      ok: false,
      error: 'KeyInfo sin KeyValue/RSAKeyValue (obligatorio en xmldsignature_v10.xsd del SII)'
    };
  }
  return { ok: true, dteCount: dteBlocks.length };
}

module.exports = { assertEnvioStructure };
