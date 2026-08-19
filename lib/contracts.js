/**
 * Marco legal — Contratos de prestación de servicios para socios Fandez.
 * Referencias: Ley 19.496 (consumidor), Ley 19.628 (datos), CC Chile,
 * intermediación de plataformas digitales de servicios.
 */

const TEMPLATE_VERSION = '1.0';
const CONTRACT_VALIDITY_MONTHS = 12;

const ENTITY_TYPES = {
  natural: {
    id: 'natural',
    label: 'Persona natural con giro',
    description: 'Profesional o técnico independiente que presta servicios a su nombre.'
  },
  empresa: {
    id: 'empresa',
    label: 'Persona jurídica (empresa)',
    description: 'Sociedad, EIRL, SPA u otra persona jurídica constituida en Chile.'
  }
};

/** Documentos exigidos según tipo de entidad y mercado (home services / gig platforms) */
const DOCUMENT_CATALOG = {
  rep_id_front: {
    key: 'rep_id_front',
    label: 'Cédula de identidad del representante legal (anverso)',
    hint: 'Foto legible, sin recortes. Debe coincidir con el RUT declarado.',
    required: true,
    entities: ['natural', 'empresa'],
    category: 'identidad'
  },
  rep_id_back: {
    key: 'rep_id_back',
    label: 'Cédula de identidad del representante legal (reverso)',
    hint: 'Incluir domicilio y fecha de vencimiento visibles.',
    required: true,
    entities: ['natural', 'empresa'],
    category: 'identidad'
  },
  natural_sii_start: {
    key: 'natural_sii_start',
    label: 'Certificado de inicio de actividades (SII)',
    hint: 'Emitido por el Servicio de Impuestos Internos, vigente.',
    required: true,
    entities: ['natural'],
    category: 'tributario'
  },
  company_rut: {
    key: 'company_rut',
    label: 'Certificado RUT de la empresa (SII)',
    hint: 'RUT de la persona jurídica, no del representante.',
    required: true,
    entities: ['empresa'],
    category: 'tributario'
  },
  incorporation_deed: {
    key: 'incorporation_deed',
    label: 'Escritura de constitución / creación de la empresa',
    hint: 'Escritura pública o extracto autorizado con socios, objeto social y administración.',
    required: true,
    entities: ['empresa'],
    category: 'societario'
  },
  company_vigency: {
    key: 'company_vigency',
    label: 'Certificado de vigencia de la sociedad',
    hint: 'Emitido por Registro de Empresas o notaría, con antigüedad máxima 60 días.',
    required: true,
    entities: ['empresa'],
    category: 'societario'
  },
  powers_vigency: {
    key: 'powers_vigency',
    label: 'Certificado de vigencia de poderes del representante legal',
    hint: 'Acredita que el representante tiene facultades vigentes para actuar en nombre de la empresa.',
    required: true,
    entities: ['empresa'],
    category: 'societario'
  },
  legal_rep_powers: {
    key: 'legal_rep_powers',
    label: 'Poder simple del representante legal',
    hint: 'Solo si quien firma no aparece como administrador titular en la escritura.',
    required: false,
    entities: ['empresa'],
    category: 'societario'
  },
  domicilio_proof: {
    key: 'domicilio_proof',
    label: 'Comprobante de domicilio fiscal o comercial',
    hint: 'Boleta de servicios, contrato de arriendo o certificado de domicilio.',
    required: true,
    entities: ['natural', 'empresa'],
    category: 'tributario'
  },
  liability_insurance: {
    key: 'liability_insurance',
    label: 'Póliza de responsabilidad civil vigente',
    hint: 'Cobertura mínima recomendada UF 500 por evento. Debe incluir daños a terceros.',
    required: true,
    entities: ['natural', 'empresa'],
    category: 'seguros'
  },
  technical_certs: {
    key: 'technical_certs',
    label: 'Certificaciones técnicas por especialidad',
    hint: 'SEC (eléctrico), certificación gas, u otra exigida por la especialidad declarada.',
    required: true,
    entities: ['natural', 'empresa'],
    category: 'tecnico',
    multiple: true
  },
  worker_registry: {
    key: 'worker_registry',
    label: 'Nómina de técnicos/subcontratados bajo su responsabilidad',
    hint: 'Listado con nombre, RUT y especialidad de cada técnico que operará en Fandez.',
    required: false,
    entities: ['natural', 'empresa'],
    category: 'operacional'
  }
};

const LEGAL_DECLARATIONS = [
  {
    id: 'independent_contractor',
    text: 'Declaro actuar como prestador independiente de servicios, sin relación laboral ni de subordinación con Fandez SpA.'
  },
  {
    id: 'technician_liability',
    text: 'Asumo responsabilidad civil, penal y administrativa por los actos u omisiones de los técnicos registrados bajo mi cuenta, incluyendo daños a clientes, terceros o inmuebles.'
  },
  {
    id: 'licenses_valid',
    text: 'Certifico que cuento con habilitaciones, licencias, seguros y certificaciones exigidas por la ley para las especialidades que ofrezco.'
  },
  {
    id: 'tax_compliance',
    text: 'Me obligo a emitir documentos tributarios conforme a la normativa del SII por los servicios prestados a través de la plataforma.'
  },
  {
    id: 'consumer_law',
    text: 'Conozco y cumpliré la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores en mis relaciones con clientes finales.'
  },
  {
    id: 'data_protection',
    text: 'Trataré los datos personales de clientes conforme a la Ley N° 19.628 y las instrucciones de Fandez, sin usarlos fuera de la prestación del servicio.'
  },
  {
    id: 'truthful_info',
    text: 'La información y documentos entregados son auténticos, vigentes y completos. Autorizo su verificación ante registros públicos y terceros.'
  },
  {
    id: 'indemnity',
    text: 'Mantendré indemne a Fandez SpA frente a reclamos, multas, demandas o perjuicios derivados de mi actividad o la de mis técnicos.'
  }
];

const CONTRACT_CLAUSES = [
  {
    title: '1. Partes e intermediación',
    body: `Fandez SpA ("Fandez"), RUT ${process.env.FANDEZ_RUT || '77.777.777-7'}, opera una plataforma digital de intermediación que conecta clientes con prestadores independientes de servicios para el hogar. El Socio es un prestador autónomo que utiliza la plataforma bajo las condiciones de este contrato. Fandez no es empleador, mandatario comercial ni garante de la ejecución material de los trabajos.`
  },
  {
    title: '2. Naturaleza independiente',
    body: 'El Socio presta servicios por su cuenta y riesgo, define sus medios, horarios y metodología, pudiendo rechazar solicitudes. No existe exclusividad, jornada fija, subordinación ni dependencia económica exclusiva respecto de Fandez.'
  },
  {
    title: '3. Responsabilidad por técnicos y subcontratados',
    body: 'Todo técnico o colaborador que el Socio registre en la plataforma actúa bajo su exclusiva responsabilidad. El Socio responde solidariamente por daños materiales, lesiones, incumplimientos, fraude, mala praxis, filtraciones, incumplimiento normativo y cualquier perjuicio causado por sí o por sus dependientes, contratistas o técnicos vinculados a su cuenta.'
  },
  {
    title: '4. Documentación y habilitación',
    body: 'El Socio debe mantener vigentes las certificaciones, seguros, inicio de actividades y documentos societarios exigidos por Fandez. La falsedad documental faculta a Fandez para terminar el contrato de inmediato y escalar ante autoridades.'
  },
  {
    title: '5. Seguro de responsabilidad civil',
    body: 'El Socio declara contar con póliza de responsabilidad civil vigente con cobertura razonable para su rubro. En caso de siniestro, el Socio gestionará directamente con su aseguradora, sin perjuicio de las acciones de repetición de Fandez.'
  },
  {
    title: '6. Relación con clientes y consumidor',
    body: 'El Socio es el proveedor directo frente al cliente final para efectos de calidad, garantías legales, presupuestos, materiales y postventa. Fandez no responde por pactos particulares entre Socio y cliente que excedan la intermediación digital.'
  },
  {
    title: '7. Comisiones y pagos',
    body: 'Fandez retiene la comisión informada en el panel al momento de cada operación. El Socio autoriza descuentos por comisiones, contracargos, devoluciones fundadas y ajustes auditables antes de liquidaciones.'
  },
  {
    title: '8. Protección de datos',
    body: 'Las partes cumplirán la Ley N° 19.628. El Socio solo usará datos de clientes para ejecutar el servicio contratado, los mantendrá confidenciales y los eliminará cuando no sean necesarios.'
  },
  {
    title: '9. Propiedad intelectual y marca',
    body: 'La marca Fandez, software y contenidos de la plataforma son de titularidad de Fandez. El Socio no podrá usarlos fuera de la plataforma ni sugerir una relación distinta a la de socio independiente.'
  },
  {
    title: '10. Terminación y suspensión',
    body: 'Fandez puede suspender o terminar el acceso por incumplimiento, reclamos graves, documentación vencida, riesgo reputacional o legal. El Socio puede solicitar baja voluntaria con servicios pendientes regularizados.'
  },
  {
    title: '11. Limitación de responsabilidad de Fandez',
    body: 'En la máxima medida permitida por la ley, la responsabilidad total de Fandez se limita a las comisiones pagadas por el Socio en los últimos 3 meses por el hecho reclamado. Fandez no responde por lucro cesante, daño indirecto o emergente del Socio.'
  },
  {
    title: '12. Jurisdicción',
    body: 'Para controversias entre las partes, se fija domicilio en Santiago de Chile y se someten a sus tribunales ordinarios de justicia, salvo norma imperativa en contrario aplicable al consumidor final.'
  }
];

function defaultProviderContract() {
  return {
    status: 'unsigned',
    templateVersion: TEMPLATE_VERSION,
    entityType: null,
    legalEntity: {
      rut: '',
      legalName: '',
      tradeName: '',
      giro: '',
      fiscalAddress: '',
      commune: '',
      region: '',
      email: '',
      phone: ''
    },
    legalRepresentative: {
      fullName: '',
      rut: '',
      role: 'Representante legal',
      email: '',
      phone: ''
    },
    documents: {},
    technicalCerts: [],
    declarations: {},
    signature: null,
    review: {
      status: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: '',
      rejectionReason: '',
      requestedDocs: []
    },
    submittedAt: null,
    approvedAt: null,
    expiresAt: null,
    history: []
  };
}

function normalizeProviderContract(raw) {
  if (!raw || typeof raw !== 'object') return defaultProviderContract();
  const base = defaultProviderContract();
  return {
    ...base,
    ...raw,
    legalEntity: { ...base.legalEntity, ...(raw.legalEntity || {}) },
    legalRepresentative: { ...base.legalRepresentative, ...(raw.legalRepresentative || {}) },
    documents: { ...(raw.documents || {}) },
    technicalCerts: Array.isArray(raw.technicalCerts) ? raw.technicalCerts : [],
    declarations: { ...(raw.declarations || {}) },
    signature: raw.signature ? { ...base.signature, ...raw.signature } : null,
    review: { ...base.review, ...(raw.review || {}) },
    history: Array.isArray(raw.history) ? raw.history : []
  };
}

const PROVIDER_REGISTRATION_DOC_KEYS = [
  'incorporation_deed',
  'company_rut',
  'company_vigency',
  'powers_vigency',
  'rep_id_front',
  'rep_id_back'
];

function validateProviderRegistrationDocuments(documents) {
  const docs = documents && typeof documents === 'object' ? documents : {};
  const missing = [];
  for (const key of PROVIDER_REGISTRATION_DOC_KEYS) {
    const raw = docs[key];
    if (!raw || String(raw).length < 50) {
      const label = DOCUMENT_CATALOG[key]?.label || key;
      missing.push(label);
    }
  }
  if (missing.length) {
    return { ok: false, errorKey: 'register.error_provider_docs', missing };
  }
  return { ok: true };
}

function getDocumentsForEntity(entityType) {
  if (!entityType) return Object.values(DOCUMENT_CATALOG);
  return Object.values(DOCUMENT_CATALOG).filter((d) => d.entities.includes(entityType));
}

function getRequiredDocumentKeys(entityType) {
  return getDocumentsForEntity(entityType)
    .filter((d) => d.required)
    .map((d) => d.key);
}

function validateContractSubmission(contract) {
  const errors = [];
  const c = normalizeProviderContract(contract);
  if (!c.entityType || !ENTITY_TYPES[c.entityType]) {
    errors.push('Selecciona si eres persona natural o empresa.');
  }
  const le = c.legalEntity;
  if (!le.rut?.trim()) errors.push('RUT de la entidad es obligatorio.');
  if (!le.legalName?.trim()) errors.push('Razón social o nombre legal es obligatorio.');
  if (!le.fiscalAddress?.trim()) errors.push('Domicilio fiscal es obligatorio.');
  if (!le.email?.trim()) errors.push('Email de contacto comercial es obligatorio.');
  const rep = c.legalRepresentative;
  if (!rep.fullName?.trim()) errors.push('Nombre del representante legal es obligatorio.');
  if (!rep.rut?.trim()) errors.push('RUT del representante legal es obligatorio.');

  const requiredDocs = getRequiredDocumentKeys(c.entityType);
  for (const key of requiredDocs) {
    if (key === 'technical_certs') {
      if (!c.technicalCerts.length) errors.push('Debes subir al menos una certificación técnica.');
      continue;
    }
    if (!c.documents[key]) {
      const doc = DOCUMENT_CATALOG[key];
      errors.push(`Falta documento: ${doc?.label || key}`);
    }
  }

  for (const decl of LEGAL_DECLARATIONS) {
    if (!c.declarations[decl.id]) {
      errors.push(`Debes aceptar: ${decl.text.slice(0, 60)}…`);
    }
  }

  if (!c.signature?.accepted) {
    errors.push('Debes firmar electrónicamente el contrato.');
  }
  if (!c.signature?.signerName?.trim() || !c.signature?.signerRut?.trim()) {
    errors.push('Nombre y RUT del firmante son obligatorios.');
  }

  return { ok: errors.length === 0, errors, contract: c };
}

function computeContractStatus(contract) {
  const c = normalizeProviderContract(contract);
  if (c.status === 'approved' && c.expiresAt && new Date(c.expiresAt) < new Date()) {
    return 'expired';
  }
  if (c.review.status === 'approved' || c.status === 'approved') return 'approved';
  if (c.review.status === 'rejected') return 'rejected';
  if (c.review.status === 'needs_info') return 'needs_info';
  if (c.review.status === 'pending' || c.status === 'pending_review') return 'pending_review';
  if (c.submittedAt) return 'pending_review';
  const validation = validateContractSubmission(c);
  if (!validation.ok && (c.entityType || c.signature?.accepted)) return 'incomplete';
  return c.status || 'unsigned';
}

function isContractOperational(contract) {
  const status = computeContractStatus(contract);
  return status === 'approved';
}

function getContractSummary(contract) {
  const c = normalizeProviderContract(contract);
  const status = computeContractStatus(c);
  const labels = {
    unsigned: 'Sin iniciar',
    incomplete: 'Incompleto',
    pending_review: 'En revisión legal',
    needs_info: 'Requiere antecedentes',
    approved: 'Aprobado — operativo',
    rejected: 'Rechazado',
    expired: 'Vencido — renovar'
  };
  return {
    status,
    label: labels[status] || status,
    entityType: c.entityType,
    templateVersion: c.templateVersion,
    submittedAt: c.submittedAt,
    approvedAt: c.approvedAt,
    expiresAt: c.expiresAt,
    canOperate: isContractOperational(c)
  };
}

function buildApprovedContract(provider, reviewedBy) {
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + CONTRACT_VALIDITY_MONTHS);
  const c = normalizeProviderContract(provider.providerContract);
  c.status = 'approved';
  c.approvedAt = now.toISOString();
  c.expiresAt = expires.toISOString();
  c.review = {
    ...c.review,
    status: 'approved',
    reviewedBy,
    reviewedAt: now.toISOString()
  };
  c.history.push({
    at: now.toISOString(),
    action: 'approved',
    by: reviewedBy
  });
  return c;
}

/** Contrato pre-aprobado para cuentas demo de desarrollo */
function demoApprovedContract(name, rut) {
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + CONTRACT_VALIDITY_MONTHS);
  return normalizeProviderContract({
    status: 'approved',
    templateVersion: TEMPLATE_VERSION,
    entityType: 'natural',
    legalEntity: {
      rut: rut || '11.111.111-1',
      legalName: name,
      tradeName: name,
      giro: 'Servicios técnicos para el hogar',
      fiscalAddress: 'Santiago, Chile',
      email: 'demo@fandez.cl',
      phone: '+56 9 0000 0000'
    },
    legalRepresentative: {
      fullName: name,
      rut: rut || '11.111.111-1',
      role: 'Representante legal',
      email: 'demo@fandez.cl',
      phone: '+56 9 0000 0000'
    },
    declarations: Object.fromEntries(LEGAL_DECLARATIONS.map((d) => [d.id, true])),
    signature: {
      accepted: true,
      signerName: name,
      signerRut: rut || '11.111.111-1',
      signedAt: now.toISOString(),
      method: 'demo_seed'
    },
    review: {
      status: 'approved',
      reviewedBy: 'system',
      reviewedAt: now.toISOString(),
      reviewNotes: 'Cuenta demo — contrato simulado'
    },
    submittedAt: now.toISOString(),
    approvedAt: now.toISOString(),
    expiresAt: expires.toISOString()
  });
}

module.exports = {
  TEMPLATE_VERSION,
  CONTRACT_VALIDITY_MONTHS,
  ENTITY_TYPES,
  DOCUMENT_CATALOG,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  defaultProviderContract,
  normalizeProviderContract,
  getDocumentsForEntity,
  getRequiredDocumentKeys,
  validateContractSubmission,
  computeContractStatus,
  isContractOperational,
  getContractSummary,
  buildApprovedContract,
  demoApprovedContract,
  PROVIDER_REGISTRATION_DOC_KEYS,
  validateProviderRegistrationDocuments
};
