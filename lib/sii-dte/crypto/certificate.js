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
  const certBag = (bagsCert[forge.pki.oids.certBag] || [])[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error('No se pudo extraer llave/certificado del PFX. Revisa la contraseña.');
  }

  const privateKey = keyBag.key;
  const certificate = certBag.cert;
  const certPem = forge.pki.certificateToPem(certificate);
  const keyPem = forge.pki.privateKeyToPem(privateKey);

  return {
    privateKey,
    certificate,
    certPem,
    keyPem,
    subject: certificate.subject.getField('CN')?.value || '',
    serial: certificate.serialNumber
  };
}

module.exports = { loadPkcs12 };
