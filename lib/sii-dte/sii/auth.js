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
  const t = String(tag || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = String(xml || '').match(
    new RegExp(`<(?:[\\w.-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${t}>`, 'i')
  );
  return m ? String(m[1]).trim() : null;
}

function decodeSoapInner(xml, returnTag) {
  const inner = extractTag(xml, returnTag) || xml;
  return String(inner || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function describeSiiAuthFailure(decoded, step, rawSoap = '') {
  const estado = extractTag(decoded, 'ESTADO') || extractTag(decoded, 'Estado');
  const glosa =
    extractTag(decoded, 'GLOSA') ||
    extractTag(decoded, 'GLOSA_ERR') ||
    extractTag(decoded, 'Glosa') ||
    extractTag(decoded, 'MSG') ||
    '';
  const fault =
    extractTag(decoded, 'faultstring') ||
    extractTag(rawSoap, 'faultstring') ||
    extractTag(rawSoap, 'faultcode') ||
    '';
  if (estado || glosa) {
    return `SII ${step}: estado ${estado || '?'} ${glosa}`.trim();
  }
  if (fault) return `SII ${step}: SOAP ${fault}`.trim();
  const snippet = String(decoded || rawSoap || '').replace(/\s+/g, ' ').slice(0, 220);
  return `SII ${step}: token no encontrado${snippet ? ` (${snippet})` : ''}`;
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
  const decoded = decodeSoapInner(text, 'getSeedReturn');
  const seed = extractTag(decoded, 'SEMILLA') || extractTag(decoded, 'Semilla');
  if (!seed) throw new Error(describeSiiAuthFailure(decoded, 'getSeed') || 'SII getSeed: semilla no encontrada');
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
  if (!res.ok) throw new Error(`SII getToken HTTP ${res.status}: ${String(text).slice(0, 200)}`);
  const decoded = decodeSoapInner(text, 'getTokenReturn');
  const token = extractTag(decoded, 'TOKEN') || extractTag(decoded, 'Token');
  if (!token) throw new Error(describeSiiAuthFailure(decoded, 'getToken', text));
  return token;
}

async function authenticate(endpoints, certificateBundle) {
  const seed = await getSeed(endpoints);
  const token = await getToken(endpoints, seed, certificateBundle);
  return { seed, token };
}

/**
 * Prueba getSeed+getToken sin emitir DTE ni gastar folio.
 */
async function probeAuth(cfg, certificateBundle) {
  const seed = await getSeed(cfg.endpoints);
  const token = await getToken(cfg.endpoints, seed, certificateBundle);
  return {
    ok: true,
    environment: cfg.environment,
    seed: String(seed).slice(0, 6) + '…',
    tokenPreview: String(token).slice(0, 8) + '…',
    certSubject: certificateBundle.subject || ''
  };
}

module.exports = {
  getSeed,
  getToken,
  authenticate,
  probeAuth
};
