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

function getProviderOnboardingSteps({ hasVerificationBanner = false, t } = {}) {
  const tr = typeof t === 'function' ? t : (key) => key;
  const steps = [
    {
      target: '[data-tour="welcome"]',
      title: tr('provider.onboarding.welcome_title'),
      body: tr('provider.onboarding.welcome_body')
    }
  ];

  if (hasVerificationBanner) {
    steps.push({
      target: '[data-tour="verification"]',
      title: tr('provider.onboarding.verification_title'),
      body: tr('provider.onboarding.verification_body')
    });
  }

  steps.push(
    {
      target: '[data-tour="online"]',
      title: tr('provider.onboarding.online_title'),
      body: tr('provider.onboarding.online_body')
    },
    {
      target: '[data-tour="stats"]',
      title: tr('provider.onboarding.stats_title'),
      body: tr('provider.onboarding.stats_body')
    },
    {
      target: '[data-tour="specialties"]',
      title: tr('provider.onboarding.specialties_title'),
      body: tr('provider.onboarding.specialties_body')
    },
    {
      target: '[data-tour="history"]',
      title: tr('provider.onboarding.history_title'),
      body: tr('provider.onboarding.history_body')
    },
    {
      target: '[data-tour="profile"]',
      title: tr('provider.onboarding.profile_title'),
      body: tr('provider.onboarding.profile_body')
    }
  );

  return steps;
}

function getProviderActivationSteps(provider, verificationCheck, contractSummary) {
  const specialtiesOk = Array.isArray(provider?.specialties) && provider.specialties.length > 0;
  return [
    {
      id: 'verify',
      done: Boolean(verificationCheck?.ok),
      labelKey: 'provider.activation.verify',
      url: '/proveedor/perfil#verificacion'
    },
    {
      id: 'contract',
      done: Boolean(contractSummary?.canOperate),
      labelKey: 'provider.activation.contract',
      url: '/proveedor/contrato'
    },
    {
      id: 'specialties',
      done: specialtiesOk,
      labelKey: 'provider.activation.specialties',
      url: '/proveedor/equipo'
    },
    {
      id: 'online',
      done: Boolean(provider?.online),
      labelKey: 'provider.activation.online',
      url: null
    }
  ];
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
      body: 'En cada visita sigue el Procedimiento Fandez: saludo, permiso de ingreso, explicación, aprobación de sobrecostos, foto inicio/fin y despedida.'
    }
  ];
}

/** Checklist de cortesía / atención europea (técnico en terreno) */
const ATTENTION_CHECKLIST = [
  { id: 'punctual', label: 'Llegué en el horario comprometido (o avisé demora)' },
  { id: 'presentation', label: 'Me presenté con nombre y mencioné Fandez' },
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
  getProviderActivationSteps,
  getTechnicianOnboardingSteps,
  ATTENTION_CHECKLIST
};
