/**
 * Contenido comercial de la ficha de servicio (cliente).
 * Problemas típicos + imagen + incluye / no incluye / marcas.
 */

'use strict';

function L(es, en) {
  return { es, en };
}

const OVERVIEWS = {
  lavadora: {
    title: L('Reparación de lavadoras', 'Washing machine repair'),
    subtitle: L('Diagnóstico y reparación a domicilio.', 'On-site diagnosis and repair.'),
    image: '/img/photo-tips/photo-tip-lavadora.jpg',
    imageAlt: L('Lavadora a domicilio', 'Home washing machine service'),
    problems: L(
      ['No enciende', 'No centrifuga', 'No drena', 'Fugas de agua', 'Ruidos anormales', 'Códigos de error', 'Fallas eléctricas y mecánicas'],
      ['Won’t turn on', 'Won’t spin', 'Won’t drain', 'Water leaks', 'Unusual noises', 'Error codes', 'Electrical & mechanical faults']
    ),
    includesSummary: L(
      'Visita a domicilio, diagnóstico de la falla y reparación según el problema detectado.',
      'Home visit, fault diagnosis and repair based on the issue found.'
    ),
    includes: L(
      ['Diagnóstico en domicilio', 'Mano de obra del técnico verificado', 'Prueba de funcionamiento al cerrar', 'Seguimiento en vivo del técnico'],
      ['On-site diagnosis', 'Verified technician labor', 'Function test at close-out', 'Live technician tracking']
    ),
    excludesSummary: L(
      'Repuestos o trabajos adicionales. Si se requieren, el técnico te informará el valor antes de realizarlos.',
      'Parts or extra work. If needed, the technician will quote you before proceeding.'
    ),
    excludes: L(
      ['Repuestos y piezas (se cotizan aparte)', 'Traslado del equipo fuera del domicilio', 'Daños estructurales de la vivienda'],
      ['Parts (quoted separately)', 'Moving the unit off-site', 'Structural home damage']
    ),
    brandsSummary: L(
      'LG, Samsung, Whirlpool, Mabe, Electrolux, Bosch, Fensa y más.',
      'LG, Samsung, Whirlpool, Mabe, Electrolux, Bosch, Fensa and more.'
    ),
    brands: ['LG', 'Samsung', 'Mabe', 'Whirlpool', 'Fensa', 'Electrolux', 'Daewoo', 'Otras / Other']
  },
  gasfiter: {
    title: L('Gasfitería a domicilio', 'Plumbing at home'),
    subtitle: L('Fugas, destapes, grifería y cañerías en baño y cocina.', 'Leaks, clogs, faucets and pipes in bath & kitchen.'),
    image: '/img/photo-tips/photo-tip-gasfiter.jpg',
    imageAlt: L('Servicio de gásfiter', 'Plumbing service'),
    problems: L(
      ['Fugas de agua', 'Destape de cañerías', 'Grifería / llaves', 'Sanitario / estanque', 'Ducha o lavamanos', 'Sifones tapados', 'Filtraciones visibles'],
      ['Water leaks', 'Pipe unclogging', 'Faucets / valves', 'Toilet / tank', 'Shower or sink', 'Clogged traps', 'Visible seepage']
    ),
    includes: L(
      ['Diagnóstico en domicilio', 'Mano de obra del técnico', 'Prueba de estanqueidad cuando aplica', 'Seguimiento en vivo'],
      ['On-site diagnosis', 'Technician labor', 'Leak test when applicable', 'Live tracking']
    ),
    excludes: L(
      ['Materiales y repuestos', 'Romper muros o losas mayores', 'Redes de gas (salvo evaluación puntual)'],
      ['Materials and parts', 'Major wall/slab demolition', 'Gas networks (except spot assessment)']
    ),
    brands: ['FV', 'Stretto', 'Docol', 'Glacial', 'Genéricas / Other']
  },
  electrico: {
    title: L('Electricidad domiciliaria', 'Home electrical'),
    subtitle: L('Enchufes, tableros, cortocircuitos y puntos de luz.', 'Outlets, panels, short circuits and lighting.'),
    image: '/img/photo-tips/photo-tip-electrico.jpg',
    imageAlt: L('Servicio eléctrico', 'Electrical service'),
    problems: L(
      ['Enchufes dañados', 'Interruptores / dimmer', 'Cortocircuitos', 'Automáticos que saltan', 'Puntos de luz', 'Tablero desordenado', 'Timbre o ventilador'],
      ['Damaged outlets', 'Switches / dimmers', 'Short circuits', 'Tripping breakers', 'Light points', 'Messy panel', 'Doorbell or fan']
    ),
    includes: L(
      ['Diagnóstico eléctrico en sitio', 'Mano de obra certificable', 'Prueba de circuitos intervenidos', 'Seguimiento en vivo'],
      ['On-site electrical diagnosis', 'Certifiable labor', 'Testing of worked circuits', 'Live tracking']
    ),
    excludes: L(
      ['Materiales (cables, automáticos, etc.)', 'Certificación TE1 completa (se cotiza)', 'Obras de cableado mayor sin presupuesto'],
      ['Materials (cables, breakers, etc.)', 'Full TE1 certification (quoted)', 'Major rewiring without quote']
    ),
    brands: ['Schneider', 'Legrand', 'Bticino', 'Genéricas / Other']
  },
  cerrajero: {
    title: L('Cerrajería a domicilio', 'Locksmith at home'),
    subtitle: L('Aperturas, chapas, cilindros y refuerzos.', 'Openings, locks, cylinders and reinforcements.'),
    image: '/img/photo-tips/photo-tip-cerrajero.jpg',
    imageAlt: L('Servicio de cerrajería', 'Locksmith service'),
    problems: L(
      ['Puerta trabada', 'Pérdida de llaves', 'Cambio de chapa', 'Cambio de cilindro', 'Copia de llaves', 'Refuerzo / blindaje', 'Cerradura dañada'],
      ['Stuck door', 'Lost keys', 'Lock replacement', 'Cylinder replacement', 'Key copies', 'Reinforcement / armor', 'Damaged lock']
    ),
    includes: L(
      ['Apertura sin daño cuando es posible', 'Diagnóstico de seguridad', 'Mano de obra en domicilio', 'Seguimiento en vivo'],
      ['Damage-free opening when possible', 'Security assessment', 'On-site labor', 'Live tracking']
    ),
    excludes: L(
      ['Cerraduras y cilindros (repuestos)', 'Cerrajería automotriz', 'Cajas fuertes especializadas'],
      ['Locks and cylinders (parts)', 'Automotive locksmith', 'Specialized safes']
    ),
    brands: ['Yale', 'Phillips', 'Kallay', 'Otras / Other']
  },
  termos: {
    title: L('Termos eléctricos', 'Electric water heaters'),
    subtitle: L('Mantención, resistencia, fugas y cambio de equipo.', 'Maintenance, heating element, leaks and unit swap.'),
    image: '/img/photo-tips/photo-tip-termos.jpg',
    imageAlt: L('Termo eléctrico', 'Electric water heater'),
    problems: L(
      ['No calienta', 'Fuga de agua', 'Sarro / ánodo', 'Válvula de sobrepresión', 'Resistencia / termostato', 'Cambio de termo', 'Ruidos o sobrecalentamiento'],
      ['Not heating', 'Water leak', 'Scale / anode', 'Pressure relief valve', 'Element / thermostat', 'Unit replacement', 'Noise or overheating']
    ),
    includes: L(
      ['Diagnóstico en domicilio', 'Mano de obra de instalación/reparación', 'Prueba de calentamiento', 'Seguimiento en vivo'],
      ['On-site diagnosis', 'Install/repair labor', 'Heating test', 'Live tracking']
    ),
    excludes: L(
      ['Valor del termo o repuestos', 'Empalme eléctrico mayor sin cotización', 'Certificaciones SEC adicionales'],
      ['Heater unit or parts cost', 'Major electrical hookup without quote', 'Extra SEC certifications']
    ),
    brands: ['Splendid', 'Tesy', 'Anwo', 'Junkers', 'Otras / Other']
  },
  lavavajillas: {
    title: L('Reparación de lavavajillas', 'Dishwasher repair'),
    subtitle: L('Drenaje, fugas, bombas y fallas de programas.', 'Drainage, leaks, pumps and program faults.'),
    image: '/img/photo-tips/photo-tip-lavavajillas.jpg',
    imageAlt: L('Lavavajillas', 'Dishwasher'),
    problems: L(
      ['No drena', 'Fugas de agua', 'No enciende', 'Falla de bomba', 'Programas erráticos', 'Ruidos anormales', 'Códigos de error'],
      ['Won’t drain', 'Water leaks', 'Won’t turn on', 'Pump failure', 'Erratic programs', 'Unusual noises', 'Error codes']
    ),
    includes: L(
      ['Diagnóstico a domicilio', 'Mano de obra del técnico', 'Prueba de ciclo al finalizar', 'Seguimiento en vivo'],
      ['On-site diagnosis', 'Technician labor', 'Cycle test at finish', 'Live tracking']
    ),
    excludes: L(
      ['Repuestos y piezas', 'Instalación de mueblería', 'Daños por instalación incorrecta previa'],
      ['Parts', 'Cabinetry install', 'Damage from prior bad install']
    ),
    brands: ['Bosch', 'Miele', 'Samsung', 'LG', 'Fensa', 'Otras / Other']
  },
  calderas: {
    title: L('Calderas de edificios', 'Building boilers'),
    subtitle: L('Mantención, quemadores, bombas y seguridad.', 'Maintenance, burners, pumps and safety.'),
    image: '/img/photo-tips/photo-tip-calderas.jpg',
    imageAlt: L('Caldera de edificio', 'Building boiler'),
    problems: L(
      ['Mantención preventiva', 'Análisis de gases', 'Bombas circuladoras', 'Fuga en colector', 'Ajuste de quemador', 'Válvula de seguridad', 'Falla de encendido'],
      ['Preventive maintenance', 'Gas analysis', 'Circulator pumps', 'Manifold leak', 'Burner tuning', 'Safety valve', 'Ignition failure']
    ),
    includes: L(
      ['Visita técnica especializada', 'Diagnóstico de sala de calderas', 'Informe de hallazgos', 'Seguimiento operativo'],
      ['Specialized site visit', 'Boiler room diagnosis', 'Findings report', 'Operational tracking']
    ),
    excludes: L(
      ['Repuestos mayores y piezas', 'Permisos municipales', 'Contratos anuales (se cotizan aparte)'],
      ['Major parts', 'Municipal permits', 'Annual contracts (quoted separately)']
    ),
    brands: ['Buderus', 'Viessmann', 'Bosch', 'Otras / Other']
  },
  generadores: {
    title: L('Generadores / grupos electrógenos', 'Generators / gensets'),
    subtitle: L('Mantención, arranque, transferencia y pruebas de carga.', 'Maintenance, start-up, transfer and load tests.'),
    image: '/img/photo-tips/photo-tip-generadores.jpg',
    imageAlt: L('Generador', 'Generator'),
    problems: L(
      ['Mantención preventiva', 'Aceite y filtros', 'Falla de arranque', 'Batería de partida', 'Tablero de transferencia', 'Prueba con carga', 'Protecciones eléctricas'],
      ['Preventive maintenance', 'Oil and filters', 'Start failure', 'Starter battery', 'Transfer switch', 'Load test', 'Electrical protections']
    ),
    includes: L(
      ['Diagnóstico en sitio', 'Mano de obra especializada', 'Pruebas de funcionamiento', 'Seguimiento operativo'],
      ['On-site diagnosis', 'Specialized labor', 'Function tests', 'Operational tracking']
    ),
    excludes: L(
      ['Repuestos, aceite y filtros', 'Combustible', 'Instalación civil / sala de máquinas'],
      ['Parts, oil and filters', 'Fuel', 'Civil / machine-room install']
    ),
    brands: ['Cummins', 'Caterpillar', 'Generac', 'Otras / Other']
  },
  pintura: {
    title: L('Pintura a domicilio', 'Home painting'),
    subtitle: L('Interiores, techos, retoques y preparación de muros.', 'Interiors, ceilings, touch-ups and wall prep.'),
    image: '/img/photo-tips/photo-tip-pintura.jpg',
    imageAlt: L('Servicio de pintura', 'Painting service'),
    problems: L(
      ['Habitación / living', 'Techos', 'Retoques y manchas', 'Humedad en muros', 'Puertas y marcos', 'Preparación de superficie', 'Fachada parcial'],
      ['Room / living area', 'Ceilings', 'Touch-ups and stains', 'Wall dampness', 'Doors and frames', 'Surface prep', 'Partial facade']
    ),
    includes: L(
      ['Evaluación de metros y estado', 'Mano de obra de pintura', 'Protección básica de piso/muebles', 'Seguimiento del servicio'],
      ['Area and condition assessment', 'Painting labor', 'Basic floor/furniture protection', 'Service tracking']
    ),
    excludes: L(
      ['Pintura y materiales', 'Andamios mayores', 'Tratamiento estructural de humedad'],
      ['Paint and materials', 'Large scaffolding', 'Structural damp treatment']
    ),
    brands: ['Sipa', 'Ceresita', 'Sherwin-Williams', 'Otras / Other']
  },
  jardineria: {
    title: L('Jardinería y paisajismo', 'Gardening & landscaping'),
    subtitle: L('Mantención por m² o proyecto de paisajismo cuantificado.', 'Upkeep per m² or a quantified landscaping project.'),
    image: '/img/photo-tips/photo-tip-jardineria.jpg',
    imageAlt: L('Servicio de jardinería y paisajismo', 'Gardening and landscaping service'),
    problems: L(
      ['Corte de césped', 'Desmalezado', 'Poda de setos', 'Jardineras y canteros', 'Mantención integral', 'Plantación / pasto en rollo', 'Proyecto de paisajismo'],
      ['Lawn mowing', 'Weeding', 'Hedge pruning', 'Planters and beds', 'Full upkeep', 'Planting / sod', 'Landscaping project']
    ),
    includes: L(
      ['Mano de obra según m² o factores del proyecto', 'Evaluación visual del área', 'Retiro básico de recortes en la visita', 'Seguimiento del servicio'],
      ['Labor based on m² or project factors', 'Visual assessment of the area', 'Basic clipping removal on the visit', 'Service tracking']
    ),
    excludes: L(
      ['Tierra, pasto, plantas y fertilizantes', 'Tala de árboles grandes', 'Materiales de riego e iluminación (se cotizan aparte)'],
      ['Soil, sod, plants and fertilizer', 'Large tree felling', 'Irrigation and lighting materials (quoted separately)']
    ),
    brands: []
  }
};

function pickLocale(value, locale) {
  if (value && typeof value === 'object' && !Array.isArray(value) && ('es' in value || 'en' in value)) {
    return value[locale] != null ? value[locale] : value.es;
  }
  return value;
}

function getServiceOverview(serviceId, { activities = [], service, locale = 'es' } = {}) {
  const id = String(serviceId || '').toLowerCase();
  const lang = String(locale || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  const raw = OVERVIEWS[id];

  const fallback = {
    title: service?.name || (lang === 'en' ? 'Service' : 'Servicio'),
    subtitle: service?.description || (lang === 'en' ? 'On-site diagnosis and care.' : 'Diagnóstico y atención a domicilio.'),
    image: null,
    imageAlt: service?.name || 'Fandez',
    problems: [],
    includes: lang === 'en'
      ? ['On-site diagnosis', 'Verified technician', 'Live tracking']
      : ['Diagnóstico en domicilio', 'Técnico verificado', 'Seguimiento en vivo'],
    excludes: lang === 'en'
      ? ['Parts and materials', 'Work outside the agreed scope']
      : ['Repuestos y materiales', 'Trabajos fuera del alcance acordado'],
    brands: []
  };

  const base = raw
    ? {
        title: pickLocale(raw.title, lang),
        subtitle: pickLocale(raw.subtitle, lang),
        image: raw.image,
        imageAlt: pickLocale(raw.imageAlt, lang),
        problems: pickLocale(raw.problems, lang) || [],
        includes: pickLocale(raw.includes, lang) || [],
        excludes: pickLocale(raw.excludes, lang) || [],
        brands: raw.brands || [],
        includesSummary: pickLocale(raw.includesSummary, lang) || null,
        excludesSummary: pickLocale(raw.excludesSummary, lang) || null,
        brandsSummary: pickLocale(raw.brandsSummary, lang) || null
      }
    : fallback;

  const fromActivities = (activities || [])
    .map((a) => String(a.name || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  const problems = base.problems.length ? base.problems : fromActivities;
  const moreProblems = fromActivities.filter((name) => !problems.includes(name));

  if (!base.includesSummary && base.includes.length) {
    base.includesSummary = base.includes.slice(0, 3).join(', ') + '.';
  }
  if (!base.excludesSummary && base.excludes.length) {
    base.excludesSummary = base.excludes[0]
      + (lang === 'en'
        ? ' If extra work is needed, the technician will quote you first.'
        : ' Si se requieren extras, el técnico te informará el valor antes.');
  }
  if (!base.brandsSummary && base.brands.length) {
    base.brandsSummary = base.brands.slice(0, 6).join(', ')
      + (lang === 'en' ? ' and more.' : ' y más.');
  }

  return {
    ...base,
    problems,
    moreProblems,
    hasImage: Boolean(base.image)
  };
}

module.exports = {
  OVERVIEWS,
  getServiceOverview
};
