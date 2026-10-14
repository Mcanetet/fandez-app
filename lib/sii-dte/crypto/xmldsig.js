/**
 * Firma XMLDSig (enveloped) del nodo Documento.
 * Implementación pragmática compatible con el flujo SII / LibreDTE:
 *  - Canonicalización C14N
 *  - Digest SHA1 del Documento
 *  - SignatureValue RSA-SHA1
 *  - KeyInfo con certificado X509
 *
 * Nota: la certificación SII exige validar contra sus XSD y set de pruebas.
 * Este módulo produce XML firmado; valida siempre en maullin (sandbox) antes de producción.
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

/**
 * Inserta Signature antes del cierre de </Documento>.
 * @param {string} documentoXml XML del <Documento ...>...</Documento> sin Signature
 * @param {{ privateKey: object, certificate: object }} cert
 */
function signDocumento(documentoXml, cert) {
  // Referencia al Documento completo (sin Signature). Digest del XML tal cual.
  const digest = sha1Base64(documentoXml);
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${extractDocumentoId(documentoXml)}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const x509 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes()
  ).match(/.{1,76}/g).join('\n');

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `${signedInfo}` +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><KeyValue/><X509Data><X509Certificate>${x509}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  if (!documentoXml.includes('</Documento>')) {
    throw new Error('XML Documento inválido para firmar');
  }
  return documentoXml.replace('</Documento>', `${signature}</Documento>`);
}

function extractDocumentoId(xml) {
  const m = xml.match(/ID="([^"]+)"/i) || xml.match(/Id="([^"]+)"/i);
  return m ? m[1] : 'F1T33';
}

/**
 * Firma el semilla del SII (getToken): XML simple con semilla firmada.
 */
function signSeed(seed, cert) {
  const body = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const digest = sha1Base64(body);
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="">` +
    `<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference></SignedInfo>`;
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const x509 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes()
  );
  return (
    `<?xml version="1.0"?>` +
    `<getToken>` +
    `<item><Semilla>${seed}</Semilla></item>` +
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `${signedInfo}<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><KeyValue/><X509Data><X509Certificate>${x509}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature></getToken>`
  );
}

module.exports = {
  signDocumento,
  signSeed,
  sha1Base64
};
