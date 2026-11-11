/**
 * Carga del certificado digital (.p12 / .pfx) con node-forge.
 * Se usa para XMLDSig del Documento y para firmar el semilla del SII.
 */
'use strict';

const fs = require('fs');
const forge = require('node-forge');
const { assertReadable } = require('../config');

function loadPkcs12(filePath, password) {
  assertReadable(filePath, 'Certificado digital');
  const der = fs.readFileSync(filePath);
  const asn1 = forge.asn1.fromDer(der.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || '');

  const bagsKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bagsCert = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBag = (bagsKey[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0]
    || (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])[0];
  const certBags = bagsCert[forge.pki.oids.certBag] || [];

  if (!keyBag?.key || !certBags.length) {
    throw new Error('No se pudo extraer llave/certificado del PFX. Revisa la contraseña.');
  }

  const privateKey = keyBag.key;
  // Si el PFX trae cadena (hoja + CA), elegir el cert cuya clave pública
  // corresponde a la llave privada (no el primero a ciegas).
  let certificate = null;
  for (const bag of certBags) {
    const c = bag?.cert;
    if (!c?.publicKey?.n || !privateKey?.n) continue;
    if (c.publicKey.n.compareTo(privateKey.n) === 0) {
      certificate = c;
      break;
    }
  }
  if (!certificate) certificate = certBags[0].cert;
  if (!certificate) {
    throw new Error('No se pudo extraer llave/certificado del PFX. Revisa la contraseña.');
  }
  const certPem = forge.pki.certificateToPem(certificate);
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  const subject = certificate.subject.getField('CN')?.value || '';
  const rut = extractRutFromCertificate(certificate);

  return {
    privateKey,
    certificate,
    certPem,
    keyPem,
    subject,
    rut,
    serial: certificate.serialNumber
  };
}

/**
 * RUT del titular del certificado (RutEnvia / rutSender).
 * Suele venir en serialNumber (OID 2.5.4.5) o en atributos del subject.
 */
function extractRutFromCertificate(certificate) {
  const attrs = certificate?.subject?.attributes || [];
  const candidates = [];
  for (const a of attrs) {
    const v = String(a?.value || '').trim();
    if (v) candidates.push(v);
  }
  try {
    const sn = certificate.subject.getField('serialNumber')?.value
      || certificate.subject.getField({ name: 'serialNumber' })?.value
      || certificate.subject.getField({ type: '2.5.4.5' })?.value;
    if (sn) candidates.unshift(String(sn).trim());
  } catch (_) { /* ignore */ }

  for (const raw of candidates) {
    const cleaned = String(raw).replace(/\./g, '').replace(/\s/g, '').toUpperCase();
    // 12345678-9 o RUN=12345678-9
    const m = cleaned.match(/(?:RUN=)?(\d{7,8}-[\dK])\b/);
    if (m) return m[1];
  }
  return '';
}

module.exports = { loadPkcs12, extractRutFromCertificate };
