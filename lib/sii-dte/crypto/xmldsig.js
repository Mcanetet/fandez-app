/**
 * Firma XMLDSig compatible con esquema SII (xmldsignature_v10.xsd):
 *  - Digest SHA1 del nodo referenciado
 *  - SignatureMethod RSA-SHA1
 *  - KeyInfo OBLIGA KeyValue/RSAKeyValue + X509Certificate
 *  - Firma del DTE: Signature hermana de Documento (dentro de <DTE>)
 *  - Firma del Envio: Signature hermana de SetDTE
 */
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');

/** Digest sobre bytes ISO-8859-1 (el XML se declara y se sube así). */
function sha1Base64(data) {
  return crypto.createHash('sha1').update(Buffer.from(String(data), 'latin1')).digest('base64');
}

function signRsaSha1(privateKeyForge, data) {
  const md = forge.md.sha1.create();
  // 'raw': cada charCode = 1 byte latin1 (no UTF-8).
  md.update(Buffer.from(String(data), 'latin1').toString('binary'), 'raw');
  return forge.util.encode64(privateKeyForge.sign(md));
}

function wrap76(b64) {
  return String(b64 || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\n') || '';
}

function x509CertificatePemBody(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes();
  return wrap76(forge.util.encode64(der));
}

/** BigInteger forge → base64 XMLDSig (con 0x00 si el bit alto está prendido). */
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

/**
 * SignedInfo con tags explícitos (C14N inclusive no usa autocerrado).
 */
function buildSignedInfo(referenceUri, digestValue) {
  return (
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="${referenceUri}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
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

/**
 * Quita una Signature interna (legado) y deja solo el Documento.
 */
function stripInnerSignature(documentoXml) {
  return String(documentoXml || '').replace(/<Signature\b[^>]*>[\s\S]*?<\/Signature>/gi, '');
}

/**
 * Firma un Documento y lo envuelve en <DTE>:
 *   <DTE version="1.0"><Documento ID="...">...</Documento><Signature>...</Signature></DTE>
 *
 * El XSD SII exige Signature como hermana de Documento, no hija.
 */
function signDocumento(documentoXml, cert) {
  let doc = stripInnerSignature(documentoXml).trim();
  if (!doc.includes('</Documento>')) {
    throw new Error('XML Documento inválido para firmar');
  }
  // Si ya viene envuelto en DTE, extraer Documento
  const dteInner = doc.match(/<DTE\b[^>]*>([\s\S]*)<\/DTE>/i);
  if (dteInner) {
    const onlyDoc = dteInner[1].match(/<Documento\b[\s\S]*?<\/Documento>/i);
    if (!onlyDoc) throw new Error('DTE sin Documento para firmar');
    doc = onlyDoc[0];
  }

  const digest = sha1Base64(doc);
  const signedInfo = buildSignedInfo(`#${extractDocumentoId(doc)}`, digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfo);
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
  return `<DTE version="1.0">${doc}${signature}</DTE>`;
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
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
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
  const signedInfoSeed = buildSignedInfo('', digest);
  const signatureValue = signRsaSha1(cert.privateKey, signedInfoSeed);
  return (
    `<getToken>` +
    `<item><Semilla>${seed}</Semilla></item>` +
    buildSignatureXml(signedInfoSeed, signatureValue, cert) +
    `</getToken>`
  );
}

/**
 * Firma LibroCompraVenta: Signature después de </EnvioLibro>.
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
  const signature = buildSignatureXml(signedInfo, signatureValue, cert);
  if (!libroXml.includes('</EnvioLibro>')) {
    throw new Error('LibroCompraVenta inválido para firmar');
  }
  return libroXml.replace('</EnvioLibro>', `</EnvioLibro>${signature}`);
}

module.exports = {
  signDocumento,
  signEnvio,
  signEnvioLibro,
  signSeed,
  sha1Base64,
  wrap76,
  stripInnerSignature
};
