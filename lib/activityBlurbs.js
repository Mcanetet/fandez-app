/**
 * Textos cortos de venta para subservicios (cliente).
 * Si el catálogo trae description, esa gana.
 */
'use strict';

const BLURBS = {
  'gas-cambio-llave': 'Cambiamos o reparamos la llave/grifería que gotea o no cierra bien.',
  'gas-pkg-griferia': 'Mano de obra para grifería y llaves. Si hace falta un repuesto ≥ $10.000, se suma en el diagnóstico con tu OK.',
  'gas-llave-paso': 'Cambio de llave de paso. El repuesto, si supera $10.000, se cobra aparte en el diagnóstico.',
  'gas-sifones': 'Limpieza o cambio de sifón / desagüe. Piezas ≥ $10.000 se suman en el diagnóstico.',
  'gas-sanitario': 'Revisión y arreglo o cambio de WC / sanitario en el baño.',
  'gas-ducha': 'Instalación o reparación de ducha para que vuelva a salir agua como corresponde.',
  'gas-tina': 'Diagnóstico y reparación de tina o hidromasaje.',
  'gas-lavamanos': 'Instalación o reparación de lavamanos y desagüe.',
  'gas-destape': 'Destape de cañería o alcantarillado con herramientas de oficio.',
  'elec-corto': 'Buscamos el corto o falla y dejamos el circuito seguro.',
  'elec-tablero': 'Revisión y arreglo de tablero, diferenciales o interruptores.',
  'elec-enchufe': 'Cambio o reparación de enchufes e interruptores.',
  'elec-luminaria': 'Instalación o cambio de luminarias.',
  'ac-mantencion': 'Limpieza y chequeo del split para que enfríe mejor y dure más.',
  'ac-serpentines': 'Limpieza profunda de serpentines y filtros.',
  'ac-refrigerante': 'Recarga o revisión de gas refrigerante.',
  'ac-instalacion': 'Instalación de equipo split (mano de obra; equipo aparte si no lo tienes).',
  'cer-apertura': 'Apertura de puerta sin destrozar la chapa cuando sea posible.',
  'cer-cambio': 'Cambio de cerradura o cilindro por una nueva.',
  'cer-llaves': 'Copia de llaves o ajuste de chapas.',
  'term-resistencia': 'Cambio de resistencia del termo eléctrico.',
  'term-mantencion': 'Mantención y revisión del termo (agua caliente otra vez).',
  'term-cambio': 'Cambio de termo (mano de obra; equipo según acuerdo).',
  'jard-poda': 'Poda de árboles o arbustos para dejar el jardín ordenado y seguro.',
  'jard-cesped': 'Corte de pasto / césped en el área que indiques.',
  'jard-maleza': 'Limpieza de maleza y desmalezado del terreno.',
  'jard-riego-reparacion': 'Reparación del sistema de riego que no está llegando bien.',
  'jard-urgente-otro': 'Otro arreglo de jardinería: lo revisamos en terreno y te avisamos.',
  'jard-pkg-cesped': 'Patio o antejardín ordenado. Desde el mínimo de visita; jardines grandes se ajustan en terreno.',
  'jard-pkg-maleza': 'Desmalezado y limpieza de terreno. Ideal si el jardín está muy cerrado.',
  'jard-pkg-poda': 'Poda de forma o seguridad. Según altura y cantidad puede subir; te lo confirman en el diagnóstico.',
  'jard-pkg-riego': 'Riego que no llega, goteros o válvulas. Incluye diagnóstico en tu casa.',
  'jard-pkg-otro': 'Cuéntanos qué te pasa (o habla con Sofía). En el diagnóstico el técnico valida el valor según el servicio real; si cambia, te pide OK antes.',
  'pisc-mantencion': 'Recuperación de agua verde o mantención básica de la piscina.',
  'pisc-bomba': 'Diagnóstico y reparación de la bomba de la piscina.',
  'pisc-filtro': 'Revisión de filtro / arena para que circule bien el agua.',
  'pisc-proyecto': 'Evaluación para remodelar o armar un proyecto de piscina.',
  'pisc-otro': 'Otro problema de piscina: lo vemos en la visita.',
  'pint-habitacion': 'Pintura de una habitación (hasta ~12 m² de muro típico).',
  'pint-living': 'Pintura de living o comedor.',
  'pint-techo': 'Pintura de techo en el ambiente acordado.',
  'pint-retouche': 'Retoques y corrección de manchas.',
  'pint-muros-humedad': 'Preparación de muro con humedad + pintura (alcance acotado).',
  'cal-mantencion': 'Mantención y calibración de caldera.',
  'gen-mantencion': 'Mantención preventiva y prueba del generador.',
  otro: 'Cuéntanos qué necesitas; el técnico confirma en terreno el alcance y precio.'
};

function activityClientBlurb(activity) {
  if (!activity) return '';
  const fromCatalog = String(activity.description || '').trim();
  if (fromCatalog) return fromCatalog;
  const id = String(activity.id || '');
  if (BLURBS[id]) return BLURBS[id];
  const name = String(activity.name || '').trim();
  if (!name) return 'El técnico revisa en terreno y te confirma el alcance.';
  return `${name}: el técnico llega, diagnostica y deja el trabajo listo según lo acordado.`;
}

function enrichActivityForClient(activity) {
  if (!activity) return activity;
  return {
    ...activity,
    clientBlurb: activityClientBlurb(activity)
  };
}

module.exports = {
  BLURBS,
  activityClientBlurb,
  enrichActivityForClient
};
