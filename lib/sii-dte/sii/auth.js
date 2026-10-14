/**
 * Autenticación SII: getSeed → firmar semilla → getToken.
 * SOAP 1.1 sobre HTTPS (maullin = sandbox, palena = producción).
 */
'use strict';

const { signSeed } = require('../crypto/xmldsig');

function soapEnvelope(bodyXml) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:ws="http://DefaultNamespace">` +
    `<soapenv:Header/><soapenv:Body>${bodyXml}</soapenv:Body></soapenv:Envelope>`
  );
}

function extractTag(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

async function getSeed(endpoints) {
  const body = soapEnvelope('<ws:getSeed/>');
  const res = await fetch(endpoints.seed, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: ''
    },
    body
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SII getSeed HTTP ${res.status}`);
  // La respuesta trae XML escapado dentro de getSeedReturn
  const inner = extractTag(text, 'getSeedReturn') || text;
  const decoded = inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  const seed = extractTag(decoded, 'SEMILLA') || extractTag(decoded, 'Semilla');
  if (!seed) throw new Error('SII getSeed: semilla no encontrada');
  return seed;
}

async function getToken(endpoints, seed, certificateBundle) {
  const signed = signSeed(seed, certificateBundle);
  const payload = soapEnvelope(`<ws:getToken><ws:pszXml><![CDATA[${signed}]]></ws:pszXml></ws:getToken>`);
  const res = await fetch(endpoints.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: ''
    },
    body: payload
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SII getToken HTTP ${res.status}`);
  const inner = extractTag(text, 'getTokenReturn') || text;
  const decoded = inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  const token = extractTag(decoded, 'TOKEN') || extractTag(decoded, 'Token');
  if (!token) throw new Error('SII getToken: token no encontrado');
  return token;
}

async function authenticate(endpoints, certificateBundle) {
  const seed = await getSeed(endpoints);
  const token = await getToken(endpoints, seed, certificateBundle);
  return { seed, token };
}

module.exports = {
  getSeed,
  getToken,
  authenticate
};
