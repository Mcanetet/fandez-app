/**
 * Firma XMLDSig (enveloped) compatible con flujo SII:
 *  - Digest SHA1 del nodo referenciado
 *  - SignatureMethod RSA-SHA1
 *  - KeyInfo solo con X509Certificate (sin KeyValue vacío)
 *  - Base64 partido cada 76 caracteres (instructivo SII)
 *
 * Nota: valida siempre en maullin (certificación) antes de producción.
 */
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');

function sha1Base64(data) {
  return crypto.createHash('sha1').update(data, 'utf8').digest('base64');
}

function signRsaSha1(privateKeyForge, data) {
  const md = forge.md.sha1.create();
  md.update(data, 'utf8');
  return forge.util.encode64(privateKeyForge.sign(md));
}

function wrap76(b64) {
  return String(b64 || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\n') || '';
}

function x509CertificatePemBody(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes();
  return wrap76(forge.util.encode64(der));
}

function buildSignatureXml(signedInfo, signatureValue, x509Body) {
  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `${signedInfo}` +
    `<SignatureValue>${wrap76(signatureValue)}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${x509Body}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

function buildSignedInfo(referenceUri, digestValue) {
  return (
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="${referenceUri}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

/**
 * Inserta Signature antes del cierre de </Documento>.
 * @param {string} documentoXml XML del <Documento ...>...</Documento> sin Signature
 * @param {{ privateKey: object, certificate: object }} cert
 */
function signDocumento(documentoXml, cert) {
  const digest = sha1Base64(documentoXml);
  const signedInfo = buildSignedInfo(`#${extractDocumentoId(documentoXml)}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, x509CertificatePemBody(cert));

  if (!documentoXml.includes('</Documento>')) {
    throw new Error('XML Documento inválido para firmar');
  }
  return documentoXml.replace('</Documento>', `${signature}</Documento>`);
}

function extractDocumentoId(xml) {
  const m = xml.match(/\bID="([^"]+)"/i) || xml.match(/\bId="([^"]+)"/i);
  return m ? m[1] : 'F1T33';
}

/**
 * Firma el EnvioDTE: Signature referenciando SetDTE, insertada antes de </EnvioDTE>.
 */
function signEnvio(envioXml, cert) {
  const setMatch = envioXml.match(/<SetDTE\b[^>]*>[\s\S]*?<\/SetDTE>/i);
  if (!setMatch) throw new Error('EnvioDTE sin SetDTE para firmar');
  const setXml = setMatch[0];
  const idMatch = setXml.match(/\bID="([^"]+)"/i);
  const setId = idMatch ? idMatch[1] : 'SetDoc';
  const digest = sha1Base64(setXml);
  const signedInfo = buildSignedInfo(`#${setId}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, x509CertificatePemBody(cert));
  if (!envioXml.includes('</EnvioDTE>')) {
    throw new Error('EnvioDTE inválido para firmar');
  }
  return envioXml.replace('</EnvioDTE>', `${signature}</EnvioDTE>`);
}

/**
 * Firma el semilla del SII (getToken): XML simple con semilla firmada.
 */
function signSeed(seed, cert) {
  const body = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const digest = sha1Base64(body);
  const signedInfoSeed =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="">` +
    `<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference></SignedInfo>`;
  const signatureValue = signRsaSha1(cert.privateKey, signedInfoSeed);
  const x509 = x509CertificatePemBody(cert);
  return (
    `<?xml version="1.0"?>\n` +
    `<getToken>` +
    `<item><Semilla>${seed}</Semilla></item>` +
    buildSignatureXml(signedInfoSeed, signatureValue, x509) +
    `</getToken>`
  );
}

/**
 * Firma LibroCompraVenta: digest del nodo EnvioLibro, Signature después de </EnvioLibro>.
 */
function signEnvioLibro(libroXml, cert) {
  const envioMatch = libroXml.match(/<EnvioLibro\b[^>]*>[\s\S]*?<\/EnvioLibro>/i);
  if (!envioMatch) throw new Error('LibroCompraVenta sin EnvioLibro para firmar');
  const envioXml = envioMatch[0];
  const idMatch = envioXml.match(/\bID="([^"]+)"/i);
  const envioId = idMatch ? idMatch[1] : 'Libro';
  const digest = sha1Base64(envioXml);
  const signedInfo = buildSignedInfo(`#${envioId}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, x509CertificatePemBody(cert));
  if (!libroXml.includes('</EnvioLibro>')) {
    throw new Error('LibroCompraVenta inválido para firmar');
  }
  // Signature es hermano de EnvioLibro (dentro de LibroCompraVenta), no hijo.
  return libroXml.replace('</EnvioLibro>', `</EnvioLibro>${signature}`);
}

module.exports = {
  signDocumento,
  signEnvio,
  signEnvioLibro,
  signSeed,
  sha1Base64,
  wrap76
};
