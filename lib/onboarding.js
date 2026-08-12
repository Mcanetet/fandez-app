function getClientOnboardingSteps(t) {
  const tr = typeof t === 'function' ? t : (key) => key;
  return [
    {
      target: '[data-tour="welcome"]',
      title: tr('client.onboarding.welcome_title'),
      body: tr('client.onboarding.welcome_body')
    },
    {
      target: '[data-tour="passport"]',
      title: tr('client.onboarding.passport_title'),
      body: tr('client.onboarding.passport_body')
    },
    {
      target: '[data-tour="promos"]',
      title: tr('client.onboarding.promos_title'),
      body: tr('client.onboarding.promos_body')
    },
    {
      target: '[data-tour="points"]',
      title: tr('client.onboarding.points_title'),
      body: tr('client.onboarding.points_body')
    },
    {
      target: '[data-tour="services"]',
      title: tr('client.onboarding.services_title'),
      body: tr('client.onboarding.services_body')
    },
    {
      target: '[data-tour="nav"]',
      title: tr('client.onboarding.nav_title'),
      body: tr('client.onboarding.nav_body')
    },
    {
      target: '[data-tour="concierge"]',
      title: tr('client.onboarding.concierge_title'),
      body: tr('client.onboarding.concierge_body')
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
      title: 'Trabajos disponibles',
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
