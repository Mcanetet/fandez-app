/**
 * Firma XMLDSig compatible con SII.
 * Digest = SHA1(UTF-8 de C14N con xmlns heredado), como dte-sii (certificación real).
 * XSD: un solo Transform enveloped-signature.
 */
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');
const { flattenXml } = require('./xmlFlatten');
const { c14nDocumento, c14nSetDte, SII_NS, XSI_NS, XMLDSIG_NS } = require('./c14n');

const C14N_ALG = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

function sha1DigestXml(data) {
  return crypto.createHash('sha1').update(Buffer.from(String(data), 'utf8')).digest('base64');
}

function sha1Base64(data) {
  return sha1DigestXml(data);
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
  const flat = flattenXml(xml);
  if (new RegExp(`^<${tagName}\\b[^>]*\\sxmlns=`).test(flat)) return flat;
  return flat.replace(new RegExp(`^<${tagName}\\b`), `<${tagName} xmlns="${SII_NS}"`);
}

/**
 * Firma Documento → DTE con xmlns SII + xsi (requerido para que el digest herede bien).
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

  doc = flattenXml(doc).replace(/^(<Documento)\s+xmlns="[^"]*"/, '$1');
  doc = doc.replace(/^(<Documento[^>]*)\s+xmlns:xsi="[^"]*"/, '$1');

  // Armar DTE temporal para C14N (xmlns + xsi en DTE, como dte-sii).
  const dteParaDigest =
    `<DTE xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">${doc}</DTE>`;
  const canonical = c14nDocumento(dteParaDigest);
  const digest = sha1DigestXml(canonical);
  const docId = extractDocumentoId(doc);

  // SignedInfo sin xsi (el digest del Documento sí lleva xmlns/xsi heredados).
  const signedInfo = buildSignedInfo(`#${docId}`, digest, { includeXsi: false });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);

  return `<DTE xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">${doc}${signature}</DTE>`;
}

/**
 * Firma EnvioDTE: digest C14N real del SetDTE (omite xmlns redundantes en DTE hijos).
 */
function signEnvio(envioXml, cert) {
  const setMatch = envioXml.match(/<SetDTE\b[^>]*>[\s\S]*?<\/SetDTE>/i);
  if (!setMatch) throw new Error('EnvioDTE sin SetDTE para firmar');

  let setXml = flattenXml(setMatch[0]);
  setXml = setXml
    .replace(/^(<SetDTE)\s+xmlns="[^"]*"/, '$1')
    .replace(/^(<SetDTE[^>]*)\s+xmlns:xsi="[^"]*"/, '$1');

  const withFlatSet = envioXml.replace(setMatch[0], setXml);
  const canonical = c14nSetDte(withFlatSet);
  const digest = sha1DigestXml(canonical);

  const idMatch = setXml.match(/\bID="([^"]+)"/i);
  const setId = idMatch ? idMatch[1] : 'SetDoc';

  const signedInfo = buildSignedInfo(`#${setId}`, digest, { includeXsi: true });
  const signatureValue = signRsaSha1Pem(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);

  if (!withFlatSet.includes('</EnvioDTE>')) {
    throw new Error('EnvioDTE inválido para firmar');
  }
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
  // Libros: digest aplanado + xmlns (sin DOM C14N completo por ahora).
  const forDigest = ensureSiiXmlns(envioXml, 'EnvioLibro').replace(
    /^(<EnvioLibro xmlns="[^"]*")/,
    `$1 xmlns:xsi="${XSI_NS}"`
  );
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
  wrap76,
  stripInnerSignature,
  SII_NS,
  c14nDocumento,
  c14nSetDte
};
