/**
 * Marco legal — Contratos de prestación de servicios para socios Fandez.
 * Referencias: Ley 19.496 (consumidor), Ley 19.628 (datos), Código del Trabajo,
 * Ley 16.744, Ley 20.169, intermediación de plataformas digitales.
 */

const TEMPLATE_VERSION = '2.0';
const CONTRACT_VALIDITY_MONTHS = 12;
/** Acuerdo comercial individual de comisión (separado del contrato marco). */
const COMMISSION_AGREEMENT_VERSION = '1.0';
const DEFAULT_LABOR_COMMISSION_RATE = 0.15;

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
    text: 'Presto servicios por mi propia cuenta y riesgo. Declaro explícitamente que no soy empleado ni dependiente de Fandez SpA.'
  },
  {
    id: 'technician_liability',
    text: 'Asumo la plena responsabilidad legal, tributaria y previsional por el trabajo ejecutado por mi persona y por los técnicos que inscriba bajo mi cuenta.'
  },
  {
    id: 'tax_compliance',
    text: 'Declaro que toda la documentación e inicio de actividades adjuntados son reales, verídicos y vigentes.'
  }
];

const CONTRACT_CLAUSES = [
  {
    title: '1. Partes e intermediación digital',
    body: 'El presente instrumento regula la relación entre Gestión Integral y Servicios Fandez SpA ("Fandez"), RUT 78.494.038-1, domiciliada en la ciudad de Santiago, Región Metropolitana, Chile, y la persona natural o jurídica que opera como prestador independiente de servicios a través de la plataforma digital (el "Socio"). Fandez opera de manera exclusiva como una plataforma tecnológica de intermediación que conecta usuarios/clientes finales con prestadores autónomos de servicios para el hogar. Las partes declaran que Fandez no es empleador, subcontratista principal, mandatario comercial ni garante de la ejecución material de las prestaciones, limitándose su rol al soporte tecnológico y procesamiento de datos.'
  },
  {
    title: '2. Naturaleza independiente y ausencia de subordinación',
    body: 'El Socio presta servicios por su propia cuenta, costo y riesgo. Define libremente sus horarios, medios materiales, herramientas, movilidad y metodología de trabajo, manteniendo la facultad irrestricta de aceptar o rechazar solicitudes. No existe entre las partes relación de exclusividad, jornada laboral, subordinación, ni dependencia económica o administrativa. El Socio declara poseer una organización empresarial/técnica autónoma.'
  },
  {
    title: '3. Dependientes, técnicos y subcontratados (indemnidad laboral y previsional)',
    body: 'Todo personal, técnico, empleado o contratista que el Socio inscriba o autorice para prestar servicios vinculados a su cuenta en la plataforma actuará bajo la exclusiva dirección y responsabilidad del Socio. Cumplimiento de Obligaciones: El Socio certifica que todo su personal cuenta con sus contratos de trabajo, cotizaciones previsionales, seguros de accidentes del trabajo (Ley N° 16.744) e impuestos al día, actuando en pleno cumplimiento del Código del Trabajo chileno. Responsabilidad y Solidaridad: El Socio responderá directamente por los daños materiales, lesiones, fraude, mala praxis, faltas a la seguridad, filtraciones o incumplimientos normativos generados por sus dependientes o técnicos. Indemnidad Laboral: El Socio se obliga a mantener a Fandez completamente indemne ante cualquier reclamo, fiscalización, demanda laboral, previsional, tributaria o sanción administrativa interpuesta por sus técnicos o por la Dirección del Trabajo. Fandez queda facultada para descontar o retener fondos de la cuenta del Socio ante eventuales reclamos judiciales de su personal.'
  },
  {
    title: '4. Documentación, habilitación y enrolamiento biométrico',
    body: 'El Socio debe mantener vigentes sus certificaciones profesionales (SEC, licencias sanitarias o según corresponda), seguro de responsabilidad civil, inicio de actividades ante el SII y documentos constitutivos o de identificación personal. Enrolamiento de Terceros: Prohibida la atención presencial de técnicos no registrados ni validados previamente en la plataforma Fandez. Falsedad Documental: La falta de veracidad o caducidad documental faculta a Fandez para suspender o congelar la cuenta de forma inmediata y remitir los antecedentes a las autoridades competentes.'
  },
  {
    title: '5. Seguro de responsabilidad civil',
    body: 'El Socio declara y garantiza contar con una póliza de responsabilidad civil vigente con cobertura idónea para los daños a terceros derivados de su actividad profesional. Ante cualquier siniestro, el Socio gestionará el reclamo de forma directa con su aseguradora. En caso de indemnizaciones asumidas preventivamente por Fandez para resguardar su reputación, Fandez ejercerá las acciones de repetición correspondientes.'
  },
  {
    title: '6. Relación directa con el cliente y Ley del Consumidor',
    body: 'El Socio ostenta la calidad de proveedor directo e independiente frente al usuario o cliente final para efectos de garantías legales, calidad técnica, idoneidad de los materiales, presupuesto de ejecución y atención postventa conforme a la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores. Fandez no responde por pactos, trabajos adicionales ni pagos en efectivo acordados al margen de la plataforma.'
  },
  {
    title: '7. Esquema de pagos, facturación y liquidaciones',
    body: 'El modelo de liquidación de fondos al Socio se estructurará formalmente de acuerdo con la tipología del servicio ejecutado. A. Servicios Spot (trabajos directos / inmediatos): Periodicidad semanal. Para recibir la liquidación el día viernes, el Socio deberá haber emitido y subido a la plataforma la factura o documento tributario equivalente antes del día miércoles a las 12:00 PM (mediodía). Las facturas ingresadas después de ese plazo se procesarán el viernes de la semana siguiente. B. Proyectos por hitos: Las liquidaciones parciales o finales se realizarán los días viernes, sujeto a (i) que el flujo pagado por el cliente haya ingresado y quedado disponible antes del miércoles a las 12:00 PM, y (ii) que el Socio haya subido la factura del hito finalizado y aprobado. C. Comisiones, descuentos y retenciones: La comisión aplicable será individualizada para cada Socio y se informará en su panel al recibir o aceptar cada operación, considerando costos de pasarela de pago (Mercado Pago) e impuestos aplicables. El Socio autoriza a Fandez a efectuar retenciones preventivas o descuentos por contracargos, devoluciones fundadas, ajustes auditables o daños acreditados antes de liquidar. Los materiales cobrados directamente al cliente se liquidan en un 100% al Socio.'
  },
  {
    title: '8. Reajuste anual y condiciones económicas',
    body: 'Estabilidad Inicial y Reajuste por IPC: Durante los primeros 12 (doce) meses contados desde la aceptación de este contrato, la tasa de comisión informada individualmente al Socio se mantendrá fija. Transcurrido ese año, las condiciones económicas podrán actualizarse anualmente con un tope máximo equivalente a la variación acumulada del Índice de Precios al Consumidor (IPC) publicado por el INE en los últimos 12 meses. Plazo de Notificación: Cualquier actualización se informará por correo registrado o notificación en la plataforma con al menos 30 (treinta) días de anticipación a su vigencia. Resguardo de Trabajos en Curso: Las operaciones, servicios o proyectos presupuestados, aceptados o iniciados antes de la vigencia de una actualización mantendrán la comisión convenida al momento de su aceptación previa.'
  },
  {
    title: '9. Prohibición de desintermediación y pactos directos con clientes (cláusula penal)',
    body: 'Prohibición de Contratación Directa: El Socio reconoce que la relación con los clientes presentados o contactados a través de Fandez se originó gracias a la tecnología, marketing e infraestructura de la plataforma. Queda estrictamente prohibido al Socio —y a sus dependientes, técnicos o colaboradores— ofrecer, cotizar, acordar, ejecutar o cobrar servicios, ampliaciones de obra o trabajos adicionales de forma directa con dichos clientes fuera del sistema Fandez, así como incitar, sugerir o aceptar pagos en efectivo o transferencias bancarias directas no procesadas mediante la aplicación. Período de Restricción: Durante toda la relación contractual y hasta 12 (doce) meses posteriores al término o cancelación de la cuenta, respecto de clientes contactados a través de Fandez. Multa y Cláusula Penal: Ante incumplimiento acreditado, Fandez podrá (i) exigir una multa o pena convencional equivalente a 30 UF por cada infracción o cliente desviado; (ii) compensar y descontar dicho monto de saldos o liquidaciones pendientes; y (iii) desconectar, bloquear y suspender de manera definitiva e inmediata la cuenta del Socio, sin derecho a indemnización. Reserva de Acciones Legales: La multa no limita el derecho de Fandez SpA a ejercer acciones civiles y penales por competencia desleal (Ley N° 20.169), indemnización de perjuicios superiores a la pena y/o daños reputacionales ante los Tribunales Ordinarios de Justicia.'
  },
  {
    title: '10. Protección de datos personales',
    body: 'Las partes darán estricto cumplimiento a la Ley N° 19.628 y sus modificaciones sobre protección de la vida privada. El Socio actuará como mero Encargado del Tratamiento respecto de los datos de contacto y domicilio de los clientes, comprometiéndose a: utilizarlos exclusivamente para ejecutar el trabajo asignado; no almacenar, copiar ni transferir los datos fuera del entorno de la aplicación; y eliminar de sus registros cualquier dato de clientes una vez concluido el servicio.'
  },
  {
    title: '11. Propiedad intelectual y marca',
    body: 'El software, las marcas registradas, los logotipos y el diseño de la plataforma Fandez son propiedad exclusiva de Gestión Integral y Servicios Fandez SpA. Se prohíbe al Socio utilizar la marca fuera de la plataforma o presentarse ante terceros como empleado, representante o franquiciado de Fandez.'
  },
  {
    title: '12. Suspensión y terminación del contrato',
    body: 'Por parte de Fandez: podrá suspender o rescindir el acceso al panel en cualquier momento ante incumplimientos del Socio, vencimiento de documentación, reclamos graves de usuarios, sospecha de fraude o riesgo legal/reputacional. Por parte del Socio: podrá dar de baja su cuenta voluntariamente previa liquidación de los trabajos o proyectos en curso pendientes.'
  },
  {
    title: '13. Limitación de responsabilidad de Fandez',
    body: 'En la máxima medida permitida por las leyes de Chile, la responsabilidad total de Fandez frente al Socio por cualquier controversia se limita a las comisiones efectivamente percibidas por Fandez respecto del servicio puntual reclamado dentro de los últimos 3 (tres) meses. Fandez no responderá por lucro cesante, pérdida de oportunidad ni daños indirectos.'
  },
  {
    title: '14. Jurisdicción y legislación aplicable',
    body: 'El presente contrato se rige por las leyes de la República de Chile. Para todos los efectos legales, las partes fijan domicilio en la ciudad y comuna de Santiago y se someten a la jurisdicción de sus Tribunales Ordinarios de Justicia.'
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
  companyName = 'Gestión Integral y Servicios Fandez SpA',
  companyRut = '78.494.038-1',
  companyAddress = 'Santiago, Región Metropolitana, Chile',
  version = TEMPLATE_VERSION
} = {}) {
  const clauses = CONTRACT_CLAUSES.map((c) => ({
    title: c.title,
    body: String(c.body || '')
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
    'DECLARACIONES EXPLÍCITAS DEL SOCIO',
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
  <p class="meta">Versión ${version} · ${escapeHtml(companyName)} · RUT ${escapeHtml(companyRut)}<br>${escapeHtml(companyAddress)}<br>Emitido: ${escapeHtml(issuedAt)}</p>
  <p>El presente instrumento regula la relación entre Fandez y el Socio (prestador independiente) que opera en la plataforma digital de intermediación.</p>
  ${clauses.map((c) => `<h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.body)}</p>`).join('\n  ')}
  <h2>Declaraciones explícitas del Socio</h2>
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

function formatPercentDisplay(rateOrPercent, { alreadyPercent = false } = {}) {
  const n = Number(rateOrPercent);
  if (!Number.isFinite(n)) return '—';
  const pct = alreadyPercent ? n : n * 100;
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function defaultCommissionAgreement() {
  return {
    status: 'none',
    laborCommissionRate: null,
    merchantCardFeePercent: null,
    transferCardFeePercent: 0,
    commissionIvaIncluded: true,
    templateVersion: COMMISSION_AGREEMENT_VERSION,
    offeredAt: null,
    offeredBy: null,
    acceptedAt: null,
    expiresAt: null,
    notes: '',
    signature: null,
    history: []
  };
}

function normalizeCommissionAgreement(raw = {}) {
  const base = defaultCommissionAgreement();
  const status = ['none', 'offered', 'accepted', 'superseded', 'revoked'].includes(raw.status)
    ? raw.status
    : 'none';
  let labor = Number(raw.laborCommissionRate);
  if (!Number.isFinite(labor) || labor < 0 || labor > 1) labor = null;
  let merchant = parseFloat(raw.merchantCardFeePercent);
  if (!Number.isFinite(merchant) || merchant < 0) merchant = null;
  return {
    ...base,
    ...raw,
    status,
    laborCommissionRate: labor,
    merchantCardFeePercent: merchant,
    transferCardFeePercent: 0,
    commissionIvaIncluded: raw.commissionIvaIncluded !== false,
    templateVersion: String(raw.templateVersion || COMMISSION_AGREEMENT_VERSION).slice(0, 16),
    offeredAt: raw.offeredAt || null,
    offeredBy: raw.offeredBy || null,
    acceptedAt: raw.acceptedAt || null,
    expiresAt: raw.expiresAt || null,
    notes: String(raw.notes || '').slice(0, 500),
    signature: raw.signature && typeof raw.signature === 'object' ? raw.signature : null,
    history: Array.isArray(raw.history) ? raw.history.slice(-40) : []
  };
}

function getCommissionAgreementSummary(agreement) {
  const a = normalizeCommissionAgreement(agreement);
  const laborPct = a.laborCommissionRate != null
    ? formatPercentDisplay(a.laborCommissionRate)
    : null;
  const labels = {
    none: 'Sin oferta de comisión',
    offered: 'Contrato de comisión pendiente de firma',
    accepted: 'Contrato de comisión aceptado',
    superseded: 'Comisión reemplazada',
    revoked: 'Comisión revocada'
  };
  return {
    status: a.status,
    label: labels[a.status] || a.status,
    laborCommissionRate: a.laborCommissionRate,
    laborPercent: laborPct,
    merchantCardFeePercent: a.merchantCardFeePercent,
    transferCardFeePercent: 0,
    commissionIvaIncluded: a.commissionIvaIncluded,
    canAccept: a.status === 'offered' && a.laborCommissionRate != null,
    isActive: a.status === 'accepted' && a.laborCommissionRate != null,
    offeredAt: a.offeredAt,
    acceptedAt: a.acceptedAt,
    templateVersion: a.templateVersion
  };
}

/**
 * Acuerdo individual de comisión: % Fandez (IVA incluido) + costo entidad de pago.
 * Transferencia bancaria: 0% de comisión de entidad.
 */
function buildCommissionAgreementDocument({
  companyName = 'Gestión Integral y Servicios Fandez SpA',
  companyRut = '78.494.038-1',
  companyAddress = 'Santiago, Región Metropolitana, Chile',
  partnerName = '',
  partnerRut = '',
  laborCommissionRate = DEFAULT_LABOR_COMMISSION_RATE,
  merchantCardFeePercent = 3.8,
  version = COMMISSION_AGREEMENT_VERSION
} = {}) {
  const laborPct = formatPercentDisplay(laborCommissionRate);
  const bankPct = formatPercentDisplay(merchantCardFeePercent, { alreadyPercent: true });
  const issuedAt = new Date().toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const partnerLine = [partnerName, partnerRut].filter(Boolean).join(' · ') || 'el Socio identificado en la plataforma';

  const clauses = [
    {
      title: '1. Objeto',
      body: `El presente Acuerdo de Comisión Individual complementa el Contrato de Prestación de Servicios vigente entre ${companyName} (“Fandez”) y ${partnerLine} (“el Socio”). Fija las condiciones económicas de intermediación aplicables a las operaciones que el Socio ejecute a través de la plataforma.`
    },
    {
      title: '2. Comisión de plataforma (mano de obra)',
      body: `Fandez retendrá una comisión del ${laborPct}% (IVA incluido) sobre la mano de obra cobrada al cliente (visita diagnóstica + trabajo / presupuesto aprobado). Esta comisión no se suma al precio que ve el cliente: se descuenta de la liquidación del Socio. Los materiales cobrados al cliente se liquidan al Socio al 100%, sin comisión de plataforma.`
    },
    {
      title: '3. Comisión de la entidad de pago (tarjeta / pasarela)',
      body: `Cuando el cliente pague con tarjeta u otra pasarela digital (p. ej. Mercado Pago, Transbank), se descontará además el costo de la entidad de pago a valor presente. Al momento de emitir este acuerdo, dicho costo referencial es aproximadamente ${bankPct}% IVA incluido sobre la mano de obra (puede ajustarse según cuotas y tarifas vigentes de la entidad). Ese costo tampoco se suma al cliente: se descuenta de la liquidación del Socio.`
    },
    {
      title: '4. Pago por transferencia bancaria',
      body: 'Si el cliente paga mediante transferencia bancaria a la cuenta informada por Fandez, no se cobra la comisión de la entidad de pago descrita en la cláusula 3 (0%). Sí aplica la comisión de plataforma de la cláusula 2.'
    },
    {
      title: '5. Vigencia y estabilidad',
      body: `La tasa de comisión de plataforma (${laborPct}% IVA incluido) se mantiene fija durante 12 (doce) meses desde la aceptación de este acuerdo, sin perjuicio de lo dispuesto en el contrato marco sobre reajuste por IPC y trabajos en curso. El costo de la entidad de pago se calcula con las tarifas vigentes al momento de cada operación.`
    },
    {
      title: '6. Aceptación',
      body: 'Al aceptar este acuerdo en la plataforma (/proveedor/contrato), el Socio declara haber leído y aceptado estas condiciones económicas individuales. Este documento no sustituye el contrato marco ni la documentación legal ya aprobada.'
    }
  ];

  const text = [
    'ACUERDO DE COMISIÓN INDIVIDUAL — SOCIO FANDEZ',
    `Versión ${version} · ${companyName}`,
    `RUT ${companyRut} · ${companyAddress}`,
    `Emitido: ${issuedAt}`,
    partnerName || partnerRut ? `Socio: ${partnerLine}` : '',
    '',
    `Comisión plataforma: ${laborPct}% IVA incluido sobre mano de obra.`,
    `Entidad de pago (tarjeta): ~${bankPct}% IVA incluido a valor presente (referencia al emitir).`,
    'Transferencia bancaria: 0% comisión de entidad de pago.',
    '',
    ...clauses.flatMap((c) => [c.title, c.body, ''])
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acuerdo de comisión Fandez v${version}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 2rem auto; padding: 0 1.25rem 3rem; color: #1a1a1a; line-height: 1.55; }
    h1 { font-size: 1.4rem; margin: 0 0 .35rem; }
    .meta { color: #555; font-size: .92rem; margin-bottom: 1.25rem; }
    .rates { background: #f7f3ee; border-radius: 10px; padding: 1rem 1.1rem; margin: 0 0 1.4rem; font-family: system-ui, sans-serif; font-size: .9rem; }
    .rates strong { display: block; margin-bottom: .35rem; }
    h2 { font-size: 1.05rem; margin: 1.35rem 0 .4rem; }
    p { margin: 0 0 .85rem; text-align: justify; }
    .actions { margin: 0 0 1.5rem; }
    .actions a { display: inline-block; margin-right: .5rem; padding: .55rem .9rem; background: #C45C14; color: #fff; text-decoration: none; border-radius: 8px; font-family: system-ui, sans-serif; font-size: .875rem; font-weight: 600; }
    @media print { .actions { display: none; } body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="actions">
    <a href="#" onclick="window.print(); return false;">Imprimir / Guardar PDF</a>
  </div>
  <h1>Acuerdo de comisión individual — Socio Fandez</h1>
  <p class="meta">Versión ${version} · ${escapeHtml(companyName)} · RUT ${escapeHtml(companyRut)}<br>${escapeHtml(companyAddress)}<br>Emitido: ${escapeHtml(issuedAt)}${partnerName || partnerRut ? `<br>Socio: ${escapeHtml(partnerLine)}` : ''}</p>
  <div class="rates">
    <strong>Condiciones de este acuerdo</strong>
    Comisión plataforma: <b>${escapeHtml(laborPct)}%</b> IVA incluido sobre mano de obra.<br>
    Entidad de pago (tarjeta): ~<b>${escapeHtml(bankPct)}%</b> IVA incluido (referencia).<br>
    Transferencia bancaria: <b>0%</b> comisión de entidad.
  </div>
  ${clauses.map((c) => `<h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.body)}</p>`).join('\n  ')}
</body>
</html>`;

  return {
    version,
    text,
    html,
    clauses,
    laborCommissionRate,
    laborPercent: laborPct,
    merchantCardFeePercent,
    transferCardFeePercent: 0
  };
}

module.exports = {
  TEMPLATE_VERSION,
  COMMISSION_AGREEMENT_VERSION,
  DEFAULT_LABOR_COMMISSION_RATE,
  CONTRACT_VALIDITY_MONTHS,
  ENTITY_TYPES,
  DOCUMENT_CATALOG,
  BANK_ACCOUNT_TYPES,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  defaultProviderContract,
  defaultBankAccount,
  normalizeProviderContract,
  defaultCommissionAgreement,
  normalizeCommissionAgreement,
  getCommissionAgreementSummary,
  buildCommissionAgreementDocument,
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
