/**
 * Firma XMLDSig al estilo SII / dte-sii (probado en certificación):
 *  - 1 solo Transform: enveloped-signature (el XSD SII NO admite un 2º Transform)
 *  - Digest SHA1 UTF-8 del nodo canónico CON xmlns heredado (solo en el digest)
 *  - <DTE xmlns="http://www.sii.cl/SiiDte"> … </DTE>
 *  - Signature hermana de Documento / SetDTE
 *  - TED/FRMT (latin1 + aplanar) vive en ted.js, no aquí
 */
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');
const { flattenXml } = require('./xmlFlatten');

const SII_NS = 'http://www.sii.cl/SiiDte';
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const C14N_ALG = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

function sha1DigestXml(data) {
  return crypto.createHash('sha1').update(Buffer.from(String(data), 'utf8')).digest('base64');
}

function sha1Base64(data) {
  return sha1DigestXml(data);
}

/**
 * Forma canónica para digest: aplanar + xmlns SII (+ xsi si aplica).
 * NO se escribe así en el XML final; el SII lo hereda del padre al verificar.
 */
function canonicalWithInheritedNs(xml, tagName, { includeXsi = false } = {}) {
  let flat = flattenXml(xml);
  const re = new RegExp(`^<${tagName}\\b([^>]*)>`);
  const m = flat.match(re);
  if (!m) return flat;
  let attrs = m[1] || '';
  if (!/\sxmlns\s*=/.test(attrs)) {
    attrs = ` xmlns="${SII_NS}"${attrs}`;
  }
  if (includeXsi && !/xmlns:xsi\s*=/.test(attrs)) {
    attrs = attrs.replace(` xmlns="${SII_NS}"`, ` xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}"`);
    if (!/\sxmlns\s*=/.test(attrs)) {
      attrs = ` xmlns:xsi="${XSI_NS}"${attrs}`;
    }
  }
  return flat.replace(re, `<${tagName}${attrs}>`);
}

function signRsaSha1Pem(privateKeyForge, data) {
  const pem = forge.pki.privateKeyToPem(privateKeyForge);
  const sign = crypto.createSign('RSA-SHA1');
  sign.update(Buffer.from(String(data), 'utf8'));
  return sign.sign(pem, 'base64');
}

function wrap76(b64) {
  return String(b64 || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\n') || '';
}

function x509CertificatePemBody(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes();
  return wrap76(forge.util.encode64(der));
}

function bigIntToBase64(bi) {
  let hex = bi.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  if (parseInt(hex.slice(0, 2), 16) >= 0x80) hex = `00${hex}`;
  return wrap76(forge.util.encode64(forge.util.hexToBytes(hex)));
}

function rsaKeyValueXml(cert) {
  const pub = cert.certificate.publicKey;
  if (!pub || !pub.n || !pub.e) {
    throw new Error('Certificado sin clave pública RSA para KeyValue');
  }
  return (
    `<KeyValue><RSAKeyValue>` +
    `<Modulus>${bigIntToBase64(pub.n)}</Modulus>` +
    `<Exponent>${bigIntToBase64(pub.e)}</Exponent>` +
    `</RSAKeyValue></KeyValue>`
  );
}

/**
 * SignedInfo: tags expandidos (para firmar = C14N) y 1 Transform (XSD SII).
 */
function buildSignedInfo(referenceUri, digestValue, { includeXsi = false } = {}) {
  const uri = referenceUri.startsWith('#') || referenceUri === ''
    ? referenceUri
    : `#${referenceUri}`;
  const xsi = includeXsi ? ` xmlns:xsi="${XSI_NS}"` : '';
  return (
    `<SignedInfo xmlns="${XMLDSIG_NS}"${xsi}>` +
    `<CanonicalizationMethod Algorithm="${C14N_ALG}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="${uri}">` +
    `<Transforms>` +
    `<Transform Algorithm="${ENVELOPED}"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

function buildSignatureXml(signedInfo, signatureValue, cert) {
  return (
    `<Signature xmlns="${XMLDSIG_NS}">` +
    `${signedInfo}` +
    `<SignatureValue>\n${wrap76(signatureValue)}</SignatureValue>` +
    `<KeyInfo>` +
    `${rsaKeyValueXml(cert)}` +
    `<X509Data><X509Certificate>${x509CertificatePemBody(cert)}</X509Certificate></X509Data>` +
    `</KeyInfo>` +
    `</Signature>`
  );
}

function extractDocumentoId(xml) {
  const m = xml.match(/\bID="([^"]+)"/i) || xml.match(/\bId="([^"]+)"/i);
  return m ? m[1] : 'F1T33';
}

function stripInnerSignature(documentoXml) {
  return String(documentoXml || '').replace(/<Signature\b[^>]*>[\s\S]*?<\/Signature>/gi, '');
}

function ensureSiiXmlns(xml, tagName) {
  return canonicalWithInheritedNs(xml, tagName, { includeXsi: false });
}

/**
 * Firma Documento. xmlns va en <DTE>; el digest del Documento incluye xmlns heredado.
 */
function signDocumento(documentoXml, cert) {
  let doc = stripInnerSignature(documentoXml).trim();
  if (!doc.includes('</Documento>')) {
    throw new Error('XML Documento inválido para firmar');
  }
  const dteInner = doc.match(/<DTE\b[^>]*>([\s\S]*)<\/DTE>/i);
  if (dteInner) {
    const onlyDoc = dteInner[1].match(/<Documento\b[\s\S]*?<\/Documento>/i);
    if (!onlyDoc) throw new Error('DTE sin Documento para firmar');
    doc = onlyDoc[0];
  }

  doc = flattenXml(doc);
  // Quitar xmlns del Documento si vino inyectado: debe heredar del DTE (como dte-sii).
  doc = doc.replace(/^(<Documento)\s+xmlns="http:\/\/www\.sii\.cl\/SiiDte"/, '$1');

  const digest = sha1DigestXml(canonicalWithInheritedNs(doc, 'Documento', { includeXsi: false }));
  const signedInfo = buildSignedInfo(`#${extractDocumentoId(doc)}`, digest, { includeXsi: false });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
  return `<DTE xmlns="${SII_NS}" version="1.0">${doc}${signature}</DTE>`;
}

/**
 * Firma EnvioDTE sobre SetDTE. Digest con xmlns (+xsi) heredados del EnvioDTE.
 */
function signEnvio(envioXml, cert) {
  const setMatch = envioXml.match(/<SetDTE\b[^>]*>[\s\S]*?<\/SetDTE>/i);
  if (!setMatch) throw new Error('EnvioDTE sin SetDTE para firmar');

  let setXml = flattenXml(setMatch[0]);
  // En el XML final SetDTE no lleva xmlns propio (lo hereda de EnvioDTE).
  setXml = setXml
    .replace(/^(<SetDTE)\s+xmlns="http:\/\/www\.sii\.cl\/SiiDte"/, '$1')
    .replace(/^(<SetDTE[^>]*)\s+xmlns:xsi="[^"]*"/, '$1');

  const idMatch = setXml.match(/\bID="([^"]+)"/i);
  const setId = idMatch ? idMatch[1] : 'SetDoc';

  const forDigest = canonicalWithInheritedNs(setXml, 'SetDTE', { includeXsi: true });
  const digest = sha1DigestXml(forDigest);
  const signedInfo = buildSignedInfo(`#${setId}`, digest, { includeXsi: true });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);

  if (!envioXml.includes('</EnvioDTE>')) {
    throw new Error('EnvioDTE inválido para firmar');
  }
  const withFlatSet = envioXml.replace(setMatch[0], setXml);
  return withFlatSet.replace('</EnvioDTE>', `${signature}</EnvioDTE>`);
}

function signSeed(seed, cert) {
  const body = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const digest = sha1DigestXml(body);
  const signedInfoSeed = buildSignedInfo('', digest, { includeXsi: false });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfoSeed);
  return (
    `<getToken>` +
    `<item><Semilla>${seed}</Semilla></item>` +
    buildSignatureXml(signedInfoSeed, signatureValue, cert) +
    `</getToken>`
  );
}

function signEnvioLibro(libroXml, cert) {
  const envioMatch = libroXml.match(/<EnvioLibro\b[^>]*>[\s\S]*?<\/EnvioLibro>/i);
  if (!envioMatch) throw new Error('LibroCompraVenta sin EnvioLibro para firmar');
  let envioXml = flattenXml(envioMatch[0]);
  const idMatch = envioXml.match(/\bID="([^"]+)"/i);
  const envioId = idMatch ? idMatch[1] : 'Libro';
  const forDigest = canonicalWithInheritedNs(envioXml, 'EnvioLibro', { includeXsi: true });
  const digest = sha1DigestXml(forDigest);
  const signedInfo = buildSignedInfo(`#${envioId}`, digest, { includeXsi: true });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
  if (!libroXml.includes('</EnvioLibro>')) {
    throw new Error('LibroCompraVenta inválido para firmar');
  }
  const replaced = libroXml.replace(envioMatch[0], envioXml);
  return replaced.replace('</EnvioLibro>', `</EnvioLibro>${signature}`);
}

module.exports = {
  signDocumento,
  signEnvio,
  signEnvioLibro,
  signSeed,
  sha1Base64,
  sha1DigestXml,
  ensureSiiXmlns,
  canonicalWithInheritedNs,
  wrap76,
  stripInnerSignature,
  SII_NS
};
