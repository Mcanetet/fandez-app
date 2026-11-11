/**
 * Firma XMLDSig compatible con SII:
 *  - Digest SHA1 del nodo (C14N ≈ aplanar + xmlns SII heredado) en UTF-8
 *  - SignatureMethod RSA-SHA1
 *  - KeyInfo: KeyValue/RSAKeyValue + X509Certificate
 *  - DTE: Signature hermana de Documento
 *  - Envio: Signature hermana de SetDTE
 *
 * El SII recalcula el digest con xmlns="http://www.sii.cl/SiiDte" heredado
 * del EnvioDTE. Si firmamos sin ese xmlns → RFR "Error en Firma".
 * TED/FRMT sigue en latin1 (otra regla); XMLDSig usa UTF-8 (C14N).
 */
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');
const { flattenXml } = require('./xmlFlatten');

const SII_NS = 'http://www.sii.cl/SiiDte';

/** Inyecta xmlns SII si falta (orden C14N: xmlns antes de otros attrs). */
function ensureSiiXmlns(xml, tagName) {
  const flat = flattenXml(xml);
  const re = new RegExp(`^<${tagName}\\b([^>]*)>`);
  const m = flat.match(re);
  if (!m) return flat;
  if (/\sxmlns\s*=/.test(m[1])) return flat;
  return flat.replace(re, `<${tagName} xmlns="${SII_NS}"$1>`);
}

/**
 * Digest XMLDSig: aplanar + SHA1 UTF-8 (octetos de C14N).
 * No usar latin1 aquí: Ó en C14N es C3 93, no D3.
 */
function sha1DigestXml(data) {
  const flat = flattenXml(data);
  return crypto.createHash('sha1').update(Buffer.from(flat, 'utf8')).digest('base64');
}

/** @deprecated alias — seed/libros; preferir sha1DigestXml */
function sha1Base64(data) {
  return sha1DigestXml(data);
}

function signRsaSha1(privateKeyForge, data) {
  const md = forge.md.sha1.create();
  // SignedInfo es ASCII; utf8 ≡ latin1.
  md.update(Buffer.from(String(data), 'utf8').toString('binary'), 'raw');
  return forge.util.encode64(privateKeyForge.sign(md));
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

function buildSignatureXml(signedInfo, signatureValue, cert) {
  const x509Body = x509CertificatePemBody(cert);
  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `${signedInfo}` +
    `<SignatureValue>${wrap76(signatureValue)}</SignatureValue>` +
    `<KeyInfo>` +
    `${rsaKeyValueXml(cert)}` +
    `<X509Data><X509Certificate>${x509Body}</X509Certificate></X509Data>` +
    `</KeyInfo>` +
    `</Signature>`
  );
}

function buildSignedInfo(referenceUri, digestValue) {
  // enveloped (no-op si Signature es hermana) + C14N explícito (como verificadores SII).
  return (
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="${referenceUri}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

function extractDocumentoId(xml) {
  const m = xml.match(/\bID="([^"]+)"/i) || xml.match(/\bId="([^"]+)"/i);
  return m ? m[1] : 'F1T33';
}

function stripInnerSignature(documentoXml) {
  return String(documentoXml || '').replace(/<Signature\b[^>]*>[\s\S]*?<\/Signature>/gi, '');
}

/**
 * Firma Documento → <DTE>…</DTE> con Signature hermana.
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

  // xmlns SII: el verificador del SII lo incluye al recalcular el digest.
  doc = ensureSiiXmlns(doc, 'Documento');
  const digest = sha1DigestXml(doc);
  const signedInfo = buildSignedInfo(`#${extractDocumentoId(doc)}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
  return `<DTE version="1.0">${doc}${signature}</DTE>`;
}

/**
 * Firma EnvioDTE sobre SetDTE (con xmlns SII).
 */
function signEnvio(envioXml, cert) {
  const setMatch = envioXml.match(/<SetDTE\b[^>]*>[\s\S]*?<\/SetDTE>/i);
  if (!setMatch) throw new Error('EnvioDTE sin SetDTE para firmar');
  const setXml = ensureSiiXmlns(setMatch[0], 'SetDTE');
  const idMatch = setXml.match(/\bID="([^"]+)"/i);
  const setId = idMatch ? idMatch[1] : 'SetDoc';
  const digest = sha1DigestXml(setXml);
  const signedInfo = buildSignedInfo(`#${setId}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
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
  const signedInfoSeed = buildSignedInfo('', digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfoSeed);
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
  let envioXml = ensureSiiXmlns(envioMatch[0], 'EnvioLibro');
  const idMatch = envioXml.match(/\bID="([^"]+)"/i);
  const envioId = idMatch ? idMatch[1] : 'Libro';
  const digest = sha1DigestXml(envioXml);
  const signedInfo = buildSignedInfo(`#${envioId}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
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
  SII_NS
};
