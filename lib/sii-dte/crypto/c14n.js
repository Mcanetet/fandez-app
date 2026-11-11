/**
 * Canonicalización XML estilo SII (basado en dte-sii / Devlas SpA, MIT).
 * El digest se calcula sobre esta forma; el XML guardado puede heredar xmlns del padre.
 */
'use strict';

const { DOMParser } = require('@xmldom/xmldom');

const SII_NS = 'http://www.sii.cl/SiiDte';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

function escapeText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function serializeNode(node, inheritedNs) {
  if (node.nodeType === 3) return escapeText(node.nodeValue || '');
  if (node.nodeType !== 1) return '';

  const tagName = node.tagName || node.nodeName;
  const currentNs = new Map(inheritedNs);
  let result = `<${tagName}`;
  const attrs = [];

  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i += 1) {
      const attr = node.attributes[i];
      if (attr.name.startsWith('xmlns')) {
        if (currentNs.get(attr.name) === attr.value) continue;
        currentNs.set(attr.name, attr.value);
      }
      attrs.push({ name: attr.name, value: attr.value });
    }
  }

  attrs.sort((a, b) => {
    if (a.name === 'xmlns') return -1;
    if (b.name === 'xmlns') return 1;
    const aXmlns = a.name.startsWith('xmlns:');
    const bXmlns = b.name.startsWith('xmlns:');
    if (aXmlns && !bXmlns) return -1;
    if (!aXmlns && bXmlns) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const attr of attrs) {
    result += ` ${attr.name}="${escapeAttr(attr.value)}"`;
  }
  result += '>';

  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i += 1) {
      result += serializeNode(node.childNodes[i], currentNs);
    }
  }
  result += `</${tagName}>`;
  return result;
}

/**
 * C14N de <Documento> heredando xmlns del <DTE>.
 */
function c14nDocumento(dteOrEnvioXml) {
  const doc = new DOMParser().parseFromString(String(dteOrEnvioXml), 'text/xml');
  const documento = doc.getElementsByTagName('Documento')[0];
  const dteRoot = doc.getElementsByTagName('DTE')[0];
  if (!documento) throw new Error('C14N: no hay Documento');

  const inheritedNs = new Map();
  if (dteRoot) {
    const def = dteRoot.getAttribute('xmlns');
    if (def) inheritedNs.set('xmlns', def);
    const xsi = dteRoot.getAttribute('xmlns:xsi');
    if (xsi) inheritedNs.set('xmlns:xsi', xsi);
  }
  if (!inheritedNs.has('xmlns')) inheritedNs.set('xmlns', SII_NS);

  let out = '<Documento';
  out += ` xmlns="${inheritedNs.get('xmlns')}"`;
  if (inheritedNs.has('xmlns:xsi')) out += ` xmlns:xsi="${inheritedNs.get('xmlns:xsi')}"`;
  const id = documento.getAttribute('ID');
  if (id) out += ` ID="${escapeAttr(id)}"`;
  out += '>';
  for (let i = 0; i < documento.childNodes.length; i += 1) {
    out += serializeNode(documento.childNodes[i], inheritedNs);
  }
  out += '</Documento>';
  return out;
}

/**
 * C14N de <SetDTE> heredando xmlns del EnvioDTE (omite xmlns redundantes en hijos).
 */
function c14nSetDte(envioXml) {
  const doc = new DOMParser().parseFromString(String(envioXml), 'text/xml');
  const setDte = doc.getElementsByTagName('SetDTE')[0];
  const envio = doc.getElementsByTagName('EnvioDTE')[0] || doc.documentElement;
  if (!setDte) throw new Error('C14N: no hay SetDTE');

  const inheritedNs = new Map();
  if (envio) {
    const def = envio.getAttribute('xmlns');
    if (def) inheritedNs.set('xmlns', def);
    const xsi = envio.getAttribute('xmlns:xsi');
    if (xsi) inheritedNs.set('xmlns:xsi', xsi);
  }
  if (!inheritedNs.has('xmlns')) inheritedNs.set('xmlns', SII_NS);

  const id = setDte.getAttribute('ID') || 'SetDoc';
  let out = '<SetDTE';
  out += ` xmlns="${inheritedNs.get('xmlns')}"`;
  if (inheritedNs.has('xmlns:xsi')) out += ` xmlns:xsi="${inheritedNs.get('xmlns:xsi')}"`;
  out += ` ID="${escapeAttr(id)}">`;
  for (let i = 0; i < setDte.childNodes.length; i += 1) {
    out += serializeNode(setDte.childNodes[i], inheritedNs);
  }
  out += '</SetDTE>';
  return out;
}

module.exports = {
  c14nDocumento,
  c14nSetDte,
  serializeNode,
  escapeAttr,
  escapeText,
  SII_NS,
  XSI_NS,
  XMLDSIG_NS
};
