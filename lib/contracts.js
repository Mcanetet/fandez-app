/**
 * Marco legal — Contratos de prestación de servicios para socios Fandez.
 * Referencias: Ley 19.496 (consumidor), Ley 19.628 (datos), CC Chile,
 * intermediación de plataformas digitales de servicios.
 */

const TEMPLATE_VERSION = '1.2';
const CONTRACT_VALIDITY_MONTHS = 12;

const ENTITY_TYPES = {
  natural: {
    id: 'natural',
    label: 'Persona natural con giro',
    description: 'Trabajas a tu nombre (inicio de actividades).'
  },
  empresa: {
    id: 'empresa',
    label: 'Empresa (SPA, EIRL, Ltda.)',
    description: 'Persona jurídica constituida en Chile.'
  }
};

/**
 * Documentos del socio — mínimo viable.
 * Obligatorio: carnet (frente + reverso). Empresa: + escritura.
 * El resto queda opcional / oculto en el wizard.
 */
const DOCUMENT_CATALOG = {
  rep_id_front: {
    key: 'rep_id_front',
    label: 'Carnet de identidad (frente)',
    hint: 'Foto clara del anverso. Debe coincidir con tu RUT.',
    required: true,
    showInWizard: true,
    entities: ['natural', 'empresa'],
    category: 'identidad'
  },
  rep_id_back: {
    key: 'rep_id_back',
    label: 'Carnet de identidad (reverso)',
    hint: 'Reverso legible (domicilio y vencimiento).',
    required: true,
    showInWizard: true,
    entities: ['natural', 'empresa'],
    category: 'identidad'
  },
  incorporation_deed: {
    key: 'incorporation_deed',
    label: 'Escritura o extracto de la empresa',
    hint: 'Constitución o extracto donde aparezcan razón social y administración.',
    required: true,
    showInWizard: true,
    entities: ['empresa'],
    category: 'societario'
  },
  company_rut: {
    key: 'company_rut',
    label: 'e-RUT / certificado RUT de la empresa (SII)',
    hint: 'PDF o foto legible con QR/código de barras del SII. Debe coincidir con el RUT de la empresa.',
    required: true,
    showInWizard: true,
    entities: ['empresa'],
    category: 'tributario'
  },
  natural_sii_start: {
    key: 'natural_sii_start',
    label: 'Inicio de actividades (SII)',
    hint: 'Opcional. Solo si te lo pide el equipo.',
    required: false,
    showInWizard: false,
    entities: ['natural'],
    category: 'tributario'
  },
  company_vigency: {
    key: 'company_vigency',
    label: 'Vigencia de la sociedad',
    hint: 'Opcional.',
    required: false,
    showInWizard: false,
    entities: ['empresa'],
    category: 'societario'
  },
  powers_vigency: {
    key: 'powers_vigency',
    label: 'Vigencia de poderes',
    hint: 'Opcional.',
    required: false,
    showInWizard: false,
    entities: ['empresa'],
    category: 'societario'
  },
  legal_rep_powers: {
    key: 'legal_rep_powers',
    label: 'Poder del representante',
    hint: 'Opcional. Solo si no apareces como administrador en la escritura.',
    required: false,
    showInWizard: false,
    entities: ['empresa'],
    category: 'societario'
  },
  domicilio_proof: {
    key: 'domicilio_proof',
    label: 'Comprobante de domicilio',
    hint: 'Opcional.',
    required: false,
    showInWizard: false,
    entities: ['natural', 'empresa'],
    category: 'tributario'
  },
  liability_insurance: {
    key: 'liability_insurance',
    label: 'Póliza de responsabilidad civil',
    hint: 'Opcional.',
    required: false,
    showInWizard: false,
    entities: ['natural', 'empresa'],
    category: 'seguros'
  },
  technical_certs: {
    key: 'technical_certs',
    label: 'Certificaciones técnicas',
    hint: 'Opcional (SEC, gas, etc.).',
    required: false,
    showInWizard: false,
    entities: ['natural', 'empresa'],
    category: 'tecnico',
    multiple: true
  },
  worker_registry: {
    key: 'worker_registry',
    label: 'Nómina de técnicos',
    hint: 'Opcional.',
    required: false,
    showInWizard: false,
    entities: ['natural', 'empresa'],
    category: 'operacional'
  }
};

const BANK_ACCOUNT_TYPES = [
  { id: 'cuenta corriente', label: 'Cuenta corriente' },
  { id: 'cuenta vista', label: 'Cuenta vista / RUT' },
  { id: 'cuenta ahorro', label: 'Cuenta de ahorro' }
];

function defaultBankAccount() {
  return {
    bankName: '',
    accountType: 'cuenta corriente',
    accountNumber: '',
    holderName: '',
    holderRut: ''
  };
}

const LEGAL_DECLARATIONS = [
  {
    id: 'independent_contractor',
    text: 'Trabajo por mi cuenta. No soy empleado de Fandez.'
  },
  {
    id: 'technician_liability',
    text: 'Respondo por mi trabajo y el de mis técnicos. Los documentos que subo son reales.'
  },
  {
    id: 'tax_compliance',
    text: 'Cumplo SII, derechos del consumidor y protección de datos de los clientes.'
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
    body: 'Fandez retiene la comisión informada en el panel al momento de cada operación (hoy, salvo modificación posterior notificada, 15% IVA incluido sobre la mano de obra, más el costo de Mercado Pago a valor presente). El Socio autoriza descuentos por comisiones, contracargos, devoluciones fundadas y ajustes auditables antes de liquidaciones. Los materiales van íntegros al Socio, salvo pacto distinto publicado en la plataforma.'
  },
  {
    title: '8. Modificación de precios y condiciones económicas',
    body: 'Fandez puede modificar en cualquier momento, a su sola discreción, precios de catálogo, tarifas de visita o diagnóstico, recargos por urgencia u horario, comisiones de la plataforma, costos de medios de pago traspasados al Socio, cargos de cancelación y demás condiciones económicas. Toda modificación se notificará al correo electrónico registrado del Socio e indicará la fecha de entrada en vigencia. Salvo exigencia legal distinta, los cambios rigen desde esa fecha o, si no se indica, desde el envío del correo. El uso continuado de la plataforma tras la notificación implica aceptación. Si el Socio no acepta, debe solicitar la baja conforme a este contrato, regularizando servicios pendientes. Las operaciones ya pagadas o aceptadas antes de la vigencia se liquidan con las condiciones de esa operación, salvo aviso expreso en contrario o exigencia legal.'
  },
  {
    title: '9. Protección de datos',
    body: 'Las partes cumplirán la Ley N° 19.628. El Socio solo usará datos de clientes para ejecutar el servicio contratado, los mantendrá confidenciales y los eliminará cuando no sean necesarios.'
  },
  {
    title: '10. Propiedad intelectual y marca',
    body: 'La marca Fandez, software y contenidos de la plataforma son de titularidad de Fandez. El Socio no podrá usarlos fuera de la plataforma ni sugerir una relación distinta a la de socio independiente.'
  },
  {
    title: '11. Terminación y suspensión',
    body: 'Fandez puede suspender o terminar el acceso por incumplimiento, reclamos graves, documentación vencida, riesgo reputacional o legal. El Socio puede solicitar baja voluntaria con servicios pendientes regularizados.'
  },
  {
    title: '12. Limitación de responsabilidad de Fandez',
    body: 'En la máxima medida permitida por la ley, la responsabilidad total de Fandez se limita a las comisiones pagadas por el Socio en los últimos 3 meses por el hecho reclamado. Fandez no responde por lucro cesante, daño indirecto o emergente del Socio.'
  },
  {
    title: '13. Jurisdicción',
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
    bankAccount: defaultBankAccount(),
    representativeMatch: {
      status: 'pending',
      validated: false,
      label: 'Representante pendiente',
      reason: '',
      carnetName: '',
      carnetRut: '',
      deedName: '',
      deedRut: '',
      declaredName: '',
      declaredRut: '',
      confidence: null,
      reviewedAt: null
    },
    erutValidation: {
      status: 'pending',
      validated: false,
      label: 'e-RUT pendiente',
      reason: '',
      extractedRut: '',
      extractedLegalName: '',
      declaredRut: '',
      declaredLegalName: '',
      hasQrOrBarcode: null,
      qrLooksAuthentic: null,
      dataMatches: null,
      confidence: null,
      reviewedAt: null
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
    history: [],
    serviceRequests: []
  };
}

function normalizeProviderContract(raw) {
  if (!raw || typeof raw !== 'object') return defaultProviderContract();
  const base = defaultProviderContract();
  const documents = {};
  Object.entries(raw.documents || {}).forEach(([key, value]) => {
    const rec = normalizeDocumentRecord(value);
    if (rec?.url) documents[key] = rec;
  });
  return {
    ...base,
    ...raw,
    legalEntity: { ...base.legalEntity, ...(raw.legalEntity || {}) },
    legalRepresentative: { ...base.legalRepresentative, ...(raw.legalRepresentative || {}) },
    bankAccount: { ...base.bankAccount, ...(raw.bankAccount || {}) },
    representativeMatch: { ...base.representativeMatch, ...(raw.representativeMatch || {}) },
    erutValidation: { ...base.erutValidation, ...(raw.erutValidation || {}) },
    documents,
    technicalCerts: Array.isArray(raw.technicalCerts)
      ? raw.technicalCerts.map((cert) => normalizeDocumentRecord(cert)).filter((cert) => cert?.url)
      : [],
    declarations: { ...(raw.declarations || {}) },
    signature: raw.signature ? { ...base.signature, ...raw.signature } : null,
    review: { ...base.review, ...(raw.review || {}) },
    history: Array.isArray(raw.history) ? raw.history : [],
    serviceRequests: Array.isArray(raw.serviceRequests) ? raw.serviceRequests : []
  };
}

function defaultDocumentMeta() {
  return {
    url: '',
    uploadedAt: null,
    fileName: '',
    mimeType: '',
    label: '',
    ai: { status: 'pending', authentic: null, confidence: null, reason: '', reviewedAt: null },
    human: { status: 'pending', notes: '', reviewedBy: null, reviewedAt: null }
  };
}

function normalizeDocumentRecord(doc) {
  const base = defaultDocumentMeta();
  if (!doc) return null;
  if (typeof doc === 'string') {
    return { ...base, url: doc };
  }
  return {
    ...base,
    ...doc,
    url: doc.url || '',
    uploadedAt: doc.uploadedAt || null,
    fileName: doc.fileName || '',
    mimeType: doc.mimeType || '',
    label: doc.label || '',
    ai: { ...base.ai, ...(doc.ai || {}) },
    human: { ...base.human, ...(doc.human || {}) }
  };
}

function getContractDocumentEntries(contract) {
  const c = normalizeProviderContract(contract);
  const entries = [];
  Object.keys(DOCUMENT_CATALOG).forEach((key) => {
    if (key === 'technical_certs') return;
    const rec = normalizeDocumentRecord(c.documents[key]);
    if (!rec?.url) return;
    entries.push({
      key,
      kind: 'contract',
      def: DOCUMENT_CATALOG[key],
      ...rec
    });
  });
  Object.keys(c.documents || {}).forEach((key) => {
    if (DOCUMENT_CATALOG[key] || key === 'technical_certs') return;
    const rec = normalizeDocumentRecord(c.documents[key]);
    if (!rec?.url) return;
    entries.push({ key, kind: 'contract', def: { key, label: key }, ...rec });
  });
  (c.technicalCerts || []).forEach((cert, idx) => {
    const rec = normalizeDocumentRecord(cert);
    if (!rec?.url) return;
    entries.push({
      key: `technical_certs:${idx}`,
      kind: 'cert',
      index: idx,
      def: { ...DOCUMENT_CATALOG.technical_certs, label: rec.label || `Certificación ${idx + 1}` },
      ...rec
    });
  });
  return entries;
}

function requiredDocumentsHumanApproved(contract) {
  const c = normalizeProviderContract(contract);
  const missing = [];
  for (const key of getRequiredDocumentKeys(c.entityType)) {
    if (key === 'technical_certs') continue;
    const rec = normalizeDocumentRecord(c.documents[key]);
    if (!rec?.url) {
      missing.push(DOCUMENT_CATALOG[key]?.label || key);
      continue;
    }
    if (rec.human.status !== 'approved') {
      missing.push(DOCUMENT_CATALOG[key]?.label || key);
    }
  }
  return { ok: missing.length === 0, missing };
}

const PROVIDER_REGISTRATION_DOC_KEYS = [
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

/** Solo lo que ve el socio en el wizard (pocos papeles). */
function getWizardDocumentsForEntity(entityType) {
  return getDocumentsForEntity(entityType).filter((d) => d.showInWizard !== false && d.required);
}

function getRequiredDocumentKeys(entityType) {
  return getDocumentsForEntity(entityType)
    .filter((d) => d.required)
    .map((d) => d.key);
}

function validateBankAccount(bank) {
  const b = { ...defaultBankAccount(), ...(bank || {}) };
  const errors = [];
  if (!String(b.bankName || '').trim()) errors.push('Banco de la cuenta es obligatorio.');
  if (!String(b.accountType || '').trim()) errors.push('Tipo de cuenta es obligatorio.');
  if (!String(b.accountNumber || '').trim()) errors.push('Número de cuenta es obligatorio.');
  if (!String(b.holderName || '').trim()) errors.push('Titular de la cuenta es obligatorio.');
  if (!String(b.holderRut || '').trim()) errors.push('RUT del titular de la cuenta es obligatorio.');
  return { ok: errors.length === 0, errors, bank: b };
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
  const rep = c.legalRepresentative;
  if (!rep.fullName?.trim()) errors.push('Nombre del representante / titular es obligatorio.');
  if (!rep.rut?.trim()) errors.push('RUT del representante / titular es obligatorio.');

  const bankCheck = validateBankAccount(c.bankAccount);
  if (!bankCheck.ok) errors.push(...bankCheck.errors);

  const requiredDocs = getRequiredDocumentKeys(c.entityType);
  for (const key of requiredDocs) {
    if (!c.documents[key]?.url) {
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
    canOperate: isContractOperational(c),
    representativeMatch: c.representativeMatch || null,
    erutValidation: c.erutValidation || null
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
    bankAccount: {
      bankName: 'Banco Estado',
      accountType: 'cuenta corriente',
      accountNumber: '00000000',
      holderName: name,
      holderRut: rut || '11.111.111-1'
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

function buildPartnerContractDocument({
  companyName = 'Fandez SpA',
  companyRut = '77.777.777-7',
  companyAddress = 'Santiago, Región Metropolitana, Chile',
  version = TEMPLATE_VERSION
} = {}) {
  const clauses = CONTRACT_CLAUSES.map((c) => ({
    title: c.title,
    body: String(c.body || '').replace(
      /RUT\s+\d{1,2}\.\d{3}\.\d{3}-\d/g,
      `RUT ${companyRut}`
    )
  }));

  const declarations = LEGAL_DECLARATIONS.map((d) => d.text);
  const issuedAt = new Date().toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const text = [
    `CONTRATO DE PRESTACIÓN DE SERVICIOS — SOCIO FANDEZ`,
    `Versión ${version} · ${companyName}`,
    `RUT ${companyRut} · ${companyAddress}`,
    `Emitido: ${issuedAt}`,
    '',
    'El presente instrumento regula la relación entre Fandez y el Socio (prestador independiente) que opera en la plataforma.',
    '',
    ...clauses.flatMap((c) => [c.title, c.body, '']),
    'DECLARACIONES DEL SOCIO',
    ...declarations.map((d, i) => `${i + 1}. ${d}`),
    '',
    'Al firmar electrónicamente en la plataforma (o al aceptar en /proveedor/contrato), el Socio declara haber leído y aceptado íntegramente este contrato.'
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contrato de socio Fandez v${version}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 2rem auto; padding: 0 1.25rem 3rem; color: #1a1a1a; line-height: 1.55; }
    h1 { font-size: 1.45rem; margin: 0 0 .35rem; }
    .meta { color: #555; font-size: .92rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.05rem; margin: 1.4rem 0 .45rem; }
    p { margin: 0 0 .85rem; text-align: justify; }
    ul { padding-left: 1.2rem; }
    li { margin-bottom: .4rem; }
    .actions { margin: 0 0 1.5rem; }
    .actions a { display: inline-block; margin-right: .5rem; padding: .55rem .9rem; background: #C45C14; color: #fff; text-decoration: none; border-radius: 8px; font-family: system-ui, sans-serif; font-size: .875rem; font-weight: 600; }
    @media print {
      .actions { display: none; }
      body { margin: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <a href="#" onclick="window.print(); return false;">Imprimir / Guardar PDF</a>
  </div>
  <h1>Contrato de prestación de servicios — Socio Fandez</h1>
  <p class="meta">Versión ${version} · ${companyName} · RUT ${companyRut}<br>${companyAddress}<br>Emitido: ${issuedAt}</p>
  <p>El presente instrumento regula la relación entre Fandez y el Socio (prestador independiente) que opera en la plataforma digital de intermediación.</p>
  ${clauses.map((c) => `<h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.body)}</p>`).join('\n  ')}
  <h2>Declaraciones del Socio</h2>
  <ul>
    ${declarations.map((d) => `<li>${escapeHtml(d)}</li>`).join('\n    ')}
  </ul>
  <p>Al firmar electrónicamente en la plataforma (o al aceptar en <em>/proveedor/contrato</em>), el Socio declara haber leído y aceptado íntegramente este contrato.</p>
</body>
</html>`;

  return { version, text, html, clauses, declarations };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  TEMPLATE_VERSION,
  CONTRACT_VALIDITY_MONTHS,
  ENTITY_TYPES,
  DOCUMENT_CATALOG,
  BANK_ACCOUNT_TYPES,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  defaultProviderContract,
  defaultBankAccount,
  normalizeProviderContract,
  getDocumentsForEntity,
  getWizardDocumentsForEntity,
  getRequiredDocumentKeys,
  validateBankAccount,
  validateContractSubmission,
  computeContractStatus,
  isContractOperational,
  getContractSummary,
  buildApprovedContract,
  demoApprovedContract,
  buildPartnerContractDocument,
  PROVIDER_REGISTRATION_DOC_KEYS,
  validateProviderRegistrationDocuments,
  defaultDocumentMeta,
  normalizeDocumentRecord,
  getContractDocumentEntries,
  requiredDocumentsHumanApproved
};
