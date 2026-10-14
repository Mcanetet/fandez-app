/**
 * Consulta de estado de un envío (Track ID) ante el SII.
 */
'use strict';

function soapEnvelope(bodyXml) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:ws="http://DefaultNamespace">` +
    `<soapenv:Header/><soapenv:Body>${bodyXml}</soapenv:Body></soapenv:Envelope>`
  );
}

function extractTag(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * Mapea respuesta SII → estado interno Fandez.
 * pending | sent | processing | accepted | rejected
 */
function mapSiiEstado(estado) {
  const e = String(estado || '').toUpperCase();
  if (!e) return 'processing';
  if (e.includes('EPR') || e.includes('ACEPT') || e === 'DOK' || e.includes('RCT')) {
    // RCT = recepción conforme del envío; el DTE individual puede seguir en revisión
    if (e.includes('RCT') || e.includes('EPR')) return 'accepted';
    return 'accepted';
  }
  if (e.includes('RCH') || e.includes('RECH') || e.includes('RLV')) return 'rejected';
  if (e.includes('SOK') || e.includes('FOK')) return 'processing';
  return 'processing';
}

async function queryUploadStatus({ endpoints, trackId, emitterRut }) {
  const rut = String(emitterRut || '').replace(/\./g, '');
  const body = soapEnvelope(
    `<ws:getEstUp>` +
    `<ws:rutCompany>${rut.split('-')[0]}</ws:rutCompany>` +
    `<ws:dvCompany>${rut.split('-')[1] || ''}</ws:dvCompany>` +
    `<ws:trackId>${trackId}</ws:trackId>` +
    `<ws:token>0</ws:token>` +
    `</ws:getEstUp>`
  );
  const res = await fetch(endpoints.query, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SII QueryEstUp HTTP ${res.status}`);
  const inner = extractTag(text, 'getEstUpReturn') || text;
  const decoded = inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  const estado = extractTag(decoded, 'ESTADO') || extractTag(decoded, 'Estado') || '';
  const glosa = extractTag(decoded, 'GLOSA') || extractTag(decoded, 'Glosa') || '';
  return {
    estado,
    glosa,
    siiStatus: mapSiiEstado(estado),
    raw: decoded
  };
}

module.exports = {
  queryUploadStatus,
  mapSiiEstado
};
