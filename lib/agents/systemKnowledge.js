/**
 * Conocimiento operativo del sistema Fandez para agentes (Sofía, Florencia, Clara).
 * Fuente única: se sincroniza a la KB de Sofía y se inyecta en prompts de marketing/ops.
 *
 * Regla: NO incluir rutas admin secretas, comisiones privadas exactas hacia cliente,
 * ni datos de otros usuarios. Sí incluir qué ve el usuario y cómo avanzar en la app.
 */

const KNOWLEDGE_VERSION = 1;

function buildSystemKnowledgeBlocks(appStore = null, company = null) {
  const co = company || {};
  const web = co.appUrl || 'https://www.fandez.cl';
  const support = co.supportEmail || 'soporte@fandez.cl';

  let servicesLine = 'Servicios del hogar a domicilio (gasfitería, electricidad, cerrajería, termos, etc.).';
  if (appStore?.SERVICES) {
    const enabled = appStore.SERVICES.filter((s) => s.enabled !== false);
    if (enabled.length) {
      servicesLine = `Servicios activos: ${enabled.map((s) => s.name).join(', ')}.`;
    }
  }

  const mapa = [
    `# Mapa Fandez (v${KNOWLEDGE_VERSION})`,
    '',
    'Fandez es la plataforma de servicios del hogar a domicilio en Santiago, Chile.',
    `Web: ${web} · Soporte: ${support}`,
    servicesLine,
    '',
    '## Roles',
    '- Cliente: pide y paga servicios en la app.',
    '- Socio (empresa/profesional): recibe pedidos, arma equipo y opera visitas.',
    '- Técnico: hace el trabajo en terreno (cuenta creada por el socio).',
    '- Administración: opera la plataforma (no es un chat público).',
    '',
    '## Apps / entradas',
    '- Cliente y socio: login público en /login · registro en /registro',
    '- Socio: también /registro?role=provider',
    '- Técnico: misma pantalla de login con su email.',
    '- Tras login, cada rol va a su panel: /cliente · /proveedor · /tecnico',
    '- Verificar correo es obligatorio (código de 6 dígitos) antes de usar el panel.',
    '- Recuperar contraseña: /recuperar',
    '',
    '## Agentes del equipo',
    '- Sofía: chat de ayuda en la app (clientes; deriva a socio o a pagos).',
    '- Florencia: marketing (admin); no atiende clientes por chat público.',
    '- Clara: informes financieros internos; no es chat.'
  ].join('\n');

  const cliente = [
    '# Recorrido cliente (pantallas y botones)',
    '',
    '## 1) Entrar',
    '- Landing → Registrarse o Iniciar sesión.',
    '- Registro cliente: nombre, email, teléfono, dirección (mapa), contraseña, consentimientos.',
    '- Tras registro: Verifica tu correo (código). Botón Reenviar si no llega (revisar spam).',
    '- Si no verifica, no entra a /cliente.',
    '',
    '## 2) Panel /cliente (Inicio)',
    '- Bottom nav: Inicio · Pasaporte Hogar · Invitar · Historial · Perfil.',
    '- Inicio: catálogo de servicios (si el módulo solicitar está activo), promos, visitas activas.',
    '- Sofía: botón flotante de chat para dudas y soporte.',
    '',
    '## 3) Pedir un servicio',
    '1. Toca un servicio en Inicio → pantalla del servicio.',
    '2. Elige urgencia (Inmediato / Hoy / Mañana / En 2 días), dirección, notas; opcional foto.',
    '3. Confirma → Checkout de pago.',
    '4. Paga con tarjeta o transferencia (si está habilitada), o usa créditos/puntos/promo.',
    '5. Pago OK → la solicitud queda en búsqueda de socio (tracking en la misma solicitud).',
    '',
    '## 4) Durante la visita',
    '- Tracking: estados (buscando, asignado, en camino, en sitio, presupuesto, completado).',
    '- Chat con el servicio / Sofía según el caso.',
    '- Si hay presupuesto o cambio de servicio: el cliente aprueba o rechaza en la app.',
    '- Si no hay socio tras el aviso de timeout: elegir Continuar buscando o pedir reembolso.',
    '- Al terminar: calificar (reseña).',
    '- Modo Guardián: link de seguimiento para un familiar (si el módulo está activo).',
    '',
    '## 5) Otras pantallas cliente',
    '- Pasaporte Hogar (/cliente/hogar): historial técnico del inmueble.',
    '- Historial (/cliente/historial): servicios pasados.',
    '- Invitar (/cliente/invitar): código de referido.',
    '- Perfil (/cliente/perfil): datos y facturación (boleta/factura).',
    '',
    '## Qué puede decir Sofía al cliente',
    '- Cómo registrarse, verificar correo, pedir, pagar, seguir el pedido, ser socio.',
    '- Precios públicos estimados y cobertura (comunas activas).',
    '- No inventar ETA exacta, ni montos finales, ni diagnósticos peligrosos.'
  ].join('\n');

  const socio = [
    '# Recorrido socio (pantallas y botones)',
    '',
    '## 1) Registro',
    '- /registro?role=provider: datos empresa/persona, RUT, especialidades (servicios), docs iniciales.',
    '- Opción “Otros servicios”: nombre + descripción (revisión interna).',
    '- Verificar correo igual que el cliente.',
    '',
    '## 2) Activación (checklist en /proveedor)',
    'Orden típico:',
    '1. Verificación: carnet frente/reverso + selfie + consentimiento ubicación → Perfil → Verificación.',
    '2. Contrato: firmar y enviar → Admin aprueba → /proveedor/contrato.',
    '3. Equipo: activar servicios de la empresa + técnicos con especialidades → /proveedor/equipo.',
    '4. Toggle En línea (solo si KYC + contrato operativo lo permiten).',
    '5. Primer trabajo del muro.',
    '',
    'Mensaje honesto: la cuenta se crea rápido; la activación completa suele tomar 24–72 h (docs + revisión). No digas “cobras en un minuto”.',
    '',
    '## 3) Panel /proveedor',
    '- Toggle Online/Offline.',
    '- Muro de trabajos: ver pedidos, Aceptar o rechazar con motivo.',
    '- Finanzas resumidas (por pagar / pagado).',
    '- Iconos: Mando, Mensajes, Equipo, Perfil.',
    '',
    '## 4) Pantallas clave',
    '- Mando (/proveedor/mando): trabajos activos; asignar técnico.',
    '- Equipo (/proveedor/equipo): crear/vincular técnicos, especialidades, “yo hago el servicio”, expediente.',
    '- Mensajes (/proveedor/mensajes): chats derivados por Sofía (responder en <5 min o escala a admin).',
    '- Perfil: bio, docs, cobertura.',
    '- Contrato: estado del contrato y documentos.',
    '',
    '## 5) Operación de un pedido',
    '- Aceptar en muro → asignar técnico (o ir a terreno) → técnico hace la visita → completar → liquidación según calendario (corte semanal).',
    '- Chat con cliente desde el trabajo.',
    '- Si el socio también atiende: puede entrar a modo técnico (terreno) y volver al panel socio.'
  ].join('\n');

  const tecnico = [
    '# Recorrido técnico',
    '',
    '- Cuenta creada por el socio (Equipo). Login en /login → panel /tecnico.',
    '- Toggle Online.',
    '- Muro: aceptar trabajos del socio (hay tiempo límite para aceptar).',
    '- Trabajo en curso (/tecnico/trabajo/:id): wizard',
    '  1) Confirmar servicio 2) En camino 3) En sitio 4) Reparar / Presupuesto / Cambio',
    '  5) Materiales (foto boleta si aplica) 6) Completar 7) Cliente califica.',
    '- Checklist de atención: puntualidad, presentarse como Fandez, pedir permiso, explicar plan,',
    '  aprobación en app antes de sobrecostos, fotos inicio/cierre, dejar ordenado, pedir calificación.',
    '- Botón Volver a socio si la misma persona opera ambos roles.'
  ].join('\n');

  const pagos = [
    '# Pagos, precios y políticas (lenguaje para usuarios)',
    '',
    '## Cómo paga el cliente',
    '- Tarjeta en checkout (pasarela activa según configuración).',
    '- Transferencia bancaria: el cliente confirma; queda pendiente hasta aprobación.',
    '- Promos/créditos/puntos si están activos (ej. código BIENVENIDO en primer servicio, según reglas).',
    '- Tras pagar: se busca socio. No inventar “llega en X minutos”.',
    '',
    '## Urgencia y horario (afectan precio estimado)',
    '- Opciones típicas: Inmediato (más caro), Hoy, Mañana, En 2 días (puede haber descuento).',
    '- Horario tarde/noche puede sumar recargo. Los % exactos los define Admin → Precios; usa KB de precios sincronizada.',
    '',
    '## Si no hay socio',
    '- La app avisa tras unos minutos sin asignación.',
    '- El cliente elige: seguir buscando o solicitar reembolso (próximo día hábil según operación).',
    '',
    '## Cancelaciones (orientación)',
    '- Antes de aceptación: suele ser sin costo.',
    '- Después de aceptación / en camino: pueden aplicar cargos; deriva a pagos si hay disputa.',
    '',
    '## Socios y cobros',
    '- El socio ve lo pendiente/pagado en su panel.',
    '- Liquidaciones: corte semanal (típicamente miércoles) y pago posterior (típicamente viernes, salta feriados).',
    '- No cites % de comisión internos al cliente final. Al socio: “la comisión y el calendario están en tu contrato/panel”.',
    '',
    '## Cobertura',
    '- Solo comunas habilitadas (RM y otras que active el admin).',
    '- Si la dirección está fuera: la app lo indica; Sofía pide la comuna y explica si hay cobertura.'
  ].join('\n');

  const faq = [
    '# FAQ de navegación (dónde está cada cosa)',
    '',
    'P: ¿Cómo pido un gasfíter / eléctrico / etc.?',
    'R: Login → Inicio → elige el servicio → urgencia y dirección → Pagar → seguir tracking.',
    '',
    'P: No me llega el correo de verificación',
    'R: Revisar spam/promociones → Reenviar código en /verificar-email. Si falla, soporte.',
    '',
    'P: ¿Dónde veo mi técnico?',
    'R: En la solicitud activa / tracking del servicio en curso.',
    '',
    'P: ¿Cómo soy socio?',
    'R: /registro?role=provider → verificar correo → completar verificación, contrato y equipo → En línea.',
    '',
    'P: Soy socio y no puedo ponerme online',
    'R: Revisar checklist: verificación docs, contrato aprobado, al menos un servicio/técnico listo.',
    '',
    'P: ¿Dónde están mis técnicos?',
    'R: Panel socio → Equipo.',
    '',
    'P: Sofía me pasó con el socio y no responden',
    'R: El socio tiene minutos para contestar; si no, escala a administración. Sofía puede derivar pagos o servicio según el caso.',
    '',
    'P: Quiero factura / boleta',
    'R: Datos en Perfil (cliente). Emisión según flujo de documentos; dudas de cobro → [DERIVAR_PAGOS].',
    '',
    'P: ¿Hay app?',
    'R: Es PWA: se puede instalar desde el navegador en el celular.',
    '',
    'P: Admin / panel interno',
    'R: No orientar a rutas admin. Si es el dueño del negocio: “entra con tu URL de administración habitual”.'
  ].join('\n');

  const derivacion = [
    '# Cuándo derivar (Sofía)',
    '',
    '- Problema técnico / visita / urgencia del hogar → resume + [DERIVAR_PROVEEDOR]',
    '- Pagos, transferencias, reembolsos, boletas, doble cobro → resume + [DERIVAR_PAGOS]',
    '- Seguridad vital (gas, incendio, persona en riesgo): primero 132/133/131, luego Fandez.',
    '- Marketing / redes / “publicidad”: no es rol de Sofía para publicar; puede explicar que el equipo de marketing (Florencia) opera desde administración.'
  ].join('\n');

  return [
    { id: 'kb-sistema-mapa', sourceType: 'system', title: 'Mapa del sistema Fandez', content: mapa, sortOrder: 4 },
    { id: 'kb-flujo-cliente', sourceType: 'system', title: 'Recorrido cliente Fandez', content: cliente, sortOrder: 5 },
    { id: 'kb-flujo-socio', sourceType: 'system', title: 'Recorrido socio Fandez', content: socio, sortOrder: 6 },
    { id: 'kb-flujo-tecnico', sourceType: 'system', title: 'Recorrido técnico Fandez', content: tecnico, sortOrder: 7 },
    { id: 'kb-pagos-politicas', sourceType: 'system', title: 'Pagos y políticas Fandez', content: pagos, sortOrder: 8 },
    { id: 'kb-faq-navegacion', sourceType: 'system', title: 'FAQ navegación Fandez', content: faq, sortOrder: 9 },
    { id: 'kb-derivacion', sourceType: 'system', title: 'Reglas de derivación Sofía', content: derivacion, sortOrder: 10 }
  ];
}

/** Texto compacto para inyectar en Florencia / informes (un solo bloque). */
function buildCompactSystemBrief(appStore, company) {
  const blocks = buildSystemKnowledgeBlocks(appStore, company);
  return blocks.map((b) => `## ${b.title}\n${b.content}`).join('\n\n');
}

module.exports = {
  KNOWLEDGE_VERSION,
  buildSystemKnowledgeBlocks,
  buildCompactSystemBrief
};
