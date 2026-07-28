function getClientOnboardingSteps() {
  return [
    {
      target: '[data-tour="welcome"]',
      title: 'Tu espacio en Fundez',
      body: 'Desde aquí ves tu saludo, créditos y acceso rápido a tu perfil. Todo tu hogar, en un solo lugar.'
    },
    {
      target: '[data-tour="passport"]',
      title: 'Pasaporte Hogar',
      body: 'El historial técnico de tu vivienda. Cada servicio suma puntaje de salud y registros de mantenimiento.'
    },
    {
      target: '[data-tour="promos"]',
      title: 'Beneficios y promos',
      body: 'Descuentos activos, regalar visitas a familiares y otras promociones disponibles para ti.'
    },
    {
      target: '[data-tour="points"]',
      title: 'Puntos y referidos',
      body: 'Ganas puntos en cada servicio y $5.000 por cada amigo que invites. Canjéalos al pagar.'
    },
    {
      target: '[data-tour="services"]',
      title: 'Solicita un servicio',
      body: 'Elige gásfiter, eléctrico, cerrajero u otro. Ingresa la dirección, paga la visita y sigue al técnico en vivo.'
    },
    {
      target: '[data-tour="nav"]',
      title: 'Navegación principal',
      body: 'Hogar: pasaporte · Invitar: referidos · Historial: servicios pasados · Perfil: tus datos.'
    },
    {
      target: '[data-tour="concierge"]',
      title: 'Aland, tu acompañante',
      body: 'Durante todo el servicio Aland te informa de cada hito (búsqueda, asignación, llegada, presupuesto). Ábrelo con el botón de Aland cuando necesites ayuda.'
    }
  ];
}

function getProviderOnboardingSteps({ hasVerificationBanner = false } = {}) {
  const steps = [
    {
      target: '[data-tour="welcome"]',
      title: 'Panel del socio',
      body: 'Bienvenido a Fundez Pro. Aquí gestionas disponibilidad, trabajos y reputación. El estándar Fundez es atención de nivel europeo: puntualidad, claridad y respeto al hogar.'
    }
  ];

  if (hasVerificationBanner) {
    steps.push({
      target: '[data-tour="verification"]',
      title: 'Verificación obligatoria',
      body: 'Antes de trabajar debes subir tu carnet, verificar tu rostro y activar la ubicación. Los clientes verán tus sellos de confianza.'
    });
  }

  steps.push(
    {
      target: '[data-tour="online"]',
      title: 'Modo en línea',
      body: 'Activa el modo en línea y revisa el muro. El primero que toma el servicio se lo queda. Activa alertas del navegador para no perder pedidos.'
    },
    {
      target: '[data-tour="stats"]',
      title: 'Tu reputación',
      body: 'Rating y reseñas mejoran tu visibilidad. Cumple el Procedimiento de atención Fundez en cada visita.'
    },
    {
      target: '[data-tour="specialties"]',
      title: 'Tus especialidades',
      body: 'Solo recibirás trabajos de las categorías asignadas. Si necesitas ampliarlas, escribe a soporte@fundez.cl.'
    },
    {
      target: '[data-tour="history"]',
      title: 'Historial y procedimiento',
      body: 'Tras aceptar: En camino → En sitio → Diagnóstico → (presupuesto si aplica) → Completar. Foto inicio/fin, permiso de ingreso y limpieza son obligatorios.'
    },
    {
      target: '[data-tour="profile"]',
      title: 'Perfil y verificación',
      body: 'Mantén teléfono, correo y documentos al día. El cliente confía en lo que ve en tu perfil.'
    }
  );

  return steps;
}

function getTechnicianOnboardingSteps() {
  return [
    {
      target: '[data-tour="tech-online"]',
      title: 'Disponibilidad',
      body: 'Activa el modo en línea para ver el muro de trabajos de tu socio. Sin estar en línea no recibes nuevas asignaciones.'
    },
    {
      target: '[data-tour="tech-wall"]',
      title: 'Muro de trabajos',
      body: 'Revisa detalle, dirección y fotos del cliente antes de tomar. El primero que acepta se queda con el servicio.'
    },
    {
      target: '[data-tour="tech-jobs"]',
      title: 'Visitas asignadas',
      body: 'En cada visita sigue el Procedimiento Fundez: saludo, permiso de ingreso, explicación, aprobación de sobrecostos, foto inicio/fin y despedida.'
    }
  ];
}

/** Checklist de cortesía / atención europea (técnico en terreno) */
const ATTENTION_CHECKLIST = [
  { id: 'punctual', label: 'Llegué en el horario comprometido (o avisé demora)' },
  { id: 'presentation', label: 'Me presenté con nombre y mencioné Fundez' },
  { id: 'entry_permission', label: 'Pedí permiso antes de ingresar al domicilio' },
  { id: 'explain', label: 'Expliqué el diagnóstico y el plan de trabajo al cliente' },
  { id: 'approval', label: 'Pedí aprobación antes de cualquier sobrecosto o cambio' },
  { id: 'photo_start_end', label: 'Tomé foto de inicio y de cierre' },
  { id: 'cleanup', label: 'Dejé el área limpia y ordenada' },
  { id: 'farewell', label: 'Me despedí y recordé calificar el servicio en la app' }
];

module.exports = {
  getClientOnboardingSteps,
  getProviderOnboardingSteps,
  getTechnicianOnboardingSteps,
  ATTENTION_CHECKLIST
};
