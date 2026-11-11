/**
 * Regla SII (instructivo): para digest TED/XMLDSig se eliminan
 * fines de línea y blancos/tabs ENTRE tags, sin tocar el texto terminal.
 */
'use strict';

function flattenXml(xml) {
  return String(xml || '')
    .replace(/>\s+</g, '><')
    .trim();
}

module.exports = { flattenXml };
