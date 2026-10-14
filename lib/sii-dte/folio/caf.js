/**
 * CAF (Código de Autorización de Folios) — XML del SII.
 * Contiene rango de folios autorizados y la llave privada RSA para el TED.
 */
'use strict';

const fs = require('fs');
const forge = require('node-forge');
const { assertReadable } = require('../config');

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseCafXml(xml) {
  const d = extractTag(xml, 'DA') || xml;
  const rut = extractTag(d, 'RE') || extractTag(xml, 'RE');
  const td = parseInt(extractTag(d, 'TD') || extractTag(xml, 'TD') || '33', 10);
  const rng = extractTag(d, 'RNG') || '';
  const dFrom = parseInt(extractTag(rng, 'D') || extractTag(d, 'D') || '1', 10);
  const dTo = parseInt(extractTag(rng, 'H') || extractTag(d, 'H') || String(dFrom), 10);
  const fa = extractTag(d, 'FA') || extractTag(xml, 'FA');
  const rsask = extractTag(xml, 'RSASK') || extractTag(d, 'RSASK');
  const rsapubk = extractTag(xml, 'RSAPUBK') || extractTag(d, 'RSAPUBK');
  const cafId = extractTag(xml, 'CAF') ? 'embedded' : 'file';

  if (!rut || !rsask) {
    throw new Error('CAF inválido: faltan RE o RSASK');
  }

  return {
    rut: String(rut).toUpperCase(),
    dteType: td,
    folioFrom: dFrom,
    folioTo: dTo,
    authorizedAt: fa,
    privateKeyPem: rsask.includes('BEGIN')
      ? rsask
      : `-----BEGIN RSA PRIVATE KEY-----\n${rsask.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`,
    publicKeyPem: rsapubk
      ? (rsapubk.includes('BEGIN')
        ? rsapubk
        : `-----BEGIN PUBLIC KEY-----\n${rsapubk.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`)
      : null,
    rawXml: xml,
    cafFragment: extractTag(xml, 'CAF')
      ? `<CAF version="1.0">${extractTag(xml, 'CAF')}</CAF>`
      : xml.includes('<CAF')
        ? xml.match(/<CAF[\s\S]*?<\/CAF>/)?.[0]
        : null,
    id: cafId
  };
}

function loadCaf(filePath) {
  assertReadable(filePath, 'CAF');
  const xml = fs.readFileSync(filePath, 'utf8');
  return parseCafXml(xml);
}

function getPrivateKey(caf) {
  return forge.pki.privateKeyFromPem(caf.privateKeyPem);
}

/**
 * Contador local de folios por CAF (archivo junto al CAF).
 * En producción conviene persistir en DB; este archivo evita colisiones en un solo nodo.
 */
function allocateFolio(caf, counterPath) {
  const file = counterPath || `${caf._sourcePath || 'caf'}.folio`;
  let next = caf.folioFrom;
  try {
    if (fs.existsSync(file)) {
      next = parseInt(fs.readFileSync(file, 'utf8'), 10) + 1;
    }
  } catch (_) { /* primer folio */ }
  if (next < caf.folioFrom) next = caf.folioFrom;
  if (next > caf.folioTo) {
    throw new Error(`CAF agotado: folio ${next} fuera de ${caf.folioFrom}-${caf.folioTo}. Solicita un CAF nuevo en el SII.`);
  }
  fs.writeFileSync(file, String(next));
  return next;
}

function loadCaf33(cafPath) {
  const caf = loadCaf(cafPath);
  caf._sourcePath = cafPath;
  if (caf.dteType !== 33) {
    throw new Error(`CAF no es tipo 33 (recibido TD=${caf.dteType})`);
  }
  return caf;
}

module.exports = {
  parseCafXml,
  loadCaf,
  loadCaf33,
  getPrivateKey,
  allocateFolio
};
