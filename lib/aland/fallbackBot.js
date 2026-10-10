/**
 * Respuestas de Sofía sin OpenAI (API caída o sin OPENAI_API_KEY).
 * Bot por palabras clave + tono Chile, conciso.
 */
const routing = require('./routing');

const RULES = [
  {
    id: 'greet',
    test: (t) => /^(hola|buenas|buen\s+d[ií]a|hey|holi|qué\s+tal|que\s+tal)\b/i.test(t) || t.length < 12 && /hola|buenas/i.test(t),
    reply: () =>
      'Hola, soy Sofía de Fandez. Puedo ayudarte con servicios a domicilio, pagos o el estado de tu solicitud. ¿Qué necesitas?'
  },
  {
    id: 'thanks',
    test: (t) => /\b(gracias|thank|bacán|listo|perfecto|ok\s*gracias)\b/i.test(t),
    reply: () => 'De nada. Si necesitas algo más de Fandez, aquí estoy.'
  },
  {
    id: 'bye',
    test: (t) => /\b(chao|adi[oó]s|hasta\s+luego|nos\s+vemos|bye)\b/i.test(t),
    reply: () => 'Hasta luego. Cualquier cosa con tu servicio o pago, escribe de nuevo.'
  },
  {
    id: 'payment',
    test: (t) => routing.classifyTopic(t) === 'payment',
    reply: () =>
      'Para pagos, cobros o facturación: revisa el comprobante en tu historial del pedido o en el correo de facturación. Si el cargo no aparece o hay un cobro raro, déjame el detalle (monto y fecha) y derivo al equipo de pagos de Fandez.',
    escalatePayments: true
  },
  {
    id: 'safety_home',
    test: (t) => /\b(olor\s+a\s+gas|fuga\s+de\s+gas|inund|chispas?|humo|incendio)\b/i.test(t),
    reply: () =>
      'Si hay riesgo inmediato (gas, inundación, fuego o electricidad peligrosa), prioriza tu seguridad: corta la llave o el suministro si puedes hacerlo sin riesgo y llama a emergencias (133 / bomberos 132). Después avísame y te ayudo a pedir visita urgente en Fandez.'
  },
  {
    id: 'tracking',
    test: (t) => /\b(d[oó]nde\s+est[aá]|tracking|seguimiento|en\s+camino|cu[aá]ndo\s+llega|t[eé]cnico\s+asignad)\b/i.test(t),
    reply: () =>
      'El estado de tu visita está en la pantalla del servicio (búsqueda, asignado, en camino, en terreno). Si lleva mucho rato buscando técnico, puedes escribirme el ID del pedido o el servicio y lo revisamos con el equipo.'
  },
  {
    id: 'how_it_works',
    test: (t) => /\b(c[oó]mo\s+funciona|qu[eé]\s+es\s+fandez|c[oó]mo\s+pido|pasos|proceso)\b/i.test(t),
    reply: () =>
      'En Fandez eliges el servicio, describes el problema, pagas la visita y buscamos un técnico verificado cerca. El trabajo se confirma en terreno; materiales u ajustes se pagan aparte si corresponde.'
  },
  {
    id: 'price',
    test: (t) => /\b(precio|cu[aá]nto\s+(cuesta|vale|cobran)|tarifa|desde\s+cu[aá]nto)\b/i.test(t),
    reply: () =>
      'Los precios parten desde el valor de visita de cada oficio (los ves en el catálogo). El total final depende del diagnóstico en terreno. Si ya pagaste, el monto queda en el resumen del pedido.'
  },
  {
    id: 'cancel',
    test: (t) => /\b(cancelar|anular|no\s+quiero\s+el\s+servicio|desistir)\b/i.test(t),
    reply: () =>
      'Para cancelar o pedir devolución, indica el servicio y el motivo. Según el estado del pedido (antes o después de asignar técnico) aplican reglas distintas; puedo derivarlo a pagos o al equipo del servicio.'
  },
  {
    id: 'provider',
    test: (t) => routing.classifyTopic(t) === 'service',
    reply: (ctx) => {
      const svc = ctx.serviceName && ctx.serviceName !== 'Soporte Fandez'
        ? ` sobre ${ctx.serviceName}`
        : '';
      return `Entiendo que necesitas ayuda${svc}. Cuéntame en una frase qué pasa (por ejemplo: “termo sin agua caliente” o “llave gotea”) y te guío para pedir la visita. Si ya tienes un pedido abierto, dime y lo revisamos.`;
    },
    escalate: true
  },
  {
    id: 'hours',
    test: (t) => /\b(horario|a\s+qu[eé]\s+hora|fines\s+de\s+semana|domingo|disponible)\b/i.test(t),
    reply: () =>
      'Atendemos servicios a domicilio según disponibilidad de técnicos en tu comuna. Urgencias tienen recargo y horarios más amplios; lo ves al elegir el tipo de visita al pedir.'
  },
  {
    id: 'commune',
    test: (t) => /\b(comuna|cobertura|llega(n)?\s+a|zona|santiago|providencia|ñuñoa|nunoa)\b/i.test(t),
    reply: () =>
      'La cobertura depende de técnicos activos en tu comuna. Al pedir el servicio con tu dirección, Fandez solo muestra opciones donde hay cobertura. Si no encuentra técnico, puedes ampliar búsqueda o reintentar más tarde.'
  },
  {
    id: 'account',
    test: (t) => /\b(cuenta|login|contrase[nñ]a|registro|iniciar\s+sesi[oó]n|correo)\b/i.test(t),
    reply: () =>
      'Para problemas de acceso o cuenta, prueba recuperar contraseña en el login. Si no llega el correo, revisa spam o escribe con el RUT/email registrado y lo derivaremos a soporte.'
  }
];

const DEFAULT_REPLY =
  'Estoy en modo asistencia rápida (sin IA en este momento). Puedo orientarte sobre pedidos, pagos, cobertura y cómo pedir un servicio. ¿Tu consulta es de servicio, pago o una solicitud en curso?';

/**
 * @param {string} userMessage
 * @param {{ serviceName?: string, serviceId?: string }} [ctx]
 */
function buildFallbackReply(userMessage, ctx = {}) {
  const text = String(userMessage || '').trim();
  if (!text) {
    return {
      reply: DEFAULT_REPLY,
      escalate: false,
      escalatePayments: false,
      model: 'fallback_bot'
    };
  }

  for (const rule of RULES) {
    try {
      if (rule.test(text)) {
        const reply = typeof rule.reply === 'function' ? rule.reply(ctx) : rule.reply;
        return {
          reply: String(reply).trim(),
          escalate: Boolean(rule.escalate),
          escalatePayments: Boolean(rule.escalatePayments),
          model: `fallback_bot:${rule.id}`
        };
      }
    } catch (_) { /* next rule */ }
  }

  const topic = routing.classifyTopic(text);
  if (topic === 'payment') {
    return {
      reply: RULES.find((r) => r.id === 'payment').reply(),
      escalate: false,
      escalatePayments: true,
      model: 'fallback_bot:payment'
    };
  }
  if (topic === 'service') {
    return {
      reply: RULES.find((r) => r.id === 'provider').reply(ctx),
      escalate: true,
      escalatePayments: false,
      model: 'fallback_bot:service'
    };
  }

  return {
    reply: DEFAULT_REPLY,
    escalate: false,
    escalatePayments: false,
    model: 'fallback_bot:default'
  };
}

module.exports = {
  buildFallbackReply,
  DEFAULT_REPLY
};
