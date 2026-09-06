const { v4: uuidv4 } = require('uuid');
const mailer = require('./mailer');
const company = require('../config/company');
const { transactional, appBaseUrl } = require('./emailLayout');

const repository = require('../models/repository');

let notifications = [];

function bindStore(store) {
  if (store.notifications) notifications = store.notifications;
}

function isEnabled() {
  return process.env.NOTIFICATIONS_ENABLED !== 'false';
}

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount || 0);
}

function trackUrl(request) {
  return `${company.appUrl}/seguimiento/${request.guardianToken}`;
}

function providerPanelUrl() {
  return `${appBaseUrl()}/proveedor`;
}

function technicianPanelUrl() {
  return `${appBaseUrl()}/tecnico`;
}

function clientName(ctx) {
  return ctx.client?.name || 'cliente';
}

function whatsappUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  const num = digits.startsWith('56') ? digits : `56${digits.replace(/^0/, '')}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

const TEMPLATES = {
  'payment.approved': (ctx) => {
    const subject = `Pago confirmado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nTu pago de ${formatCLP(ctx.amount)} por ${ctx.request.serviceName} fue confirmado.\n\nDirección: ${ctx.request.address}\nSeguimiento: ${trackUrl(ctx.request)}\n\nEn otro correo te enviamos el comprobante de pago y, cuando corresponda, la boleta/factura electrónica.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Pago de ${formatCLP(ctx.amount)} confirmado por ${ctx.request.serviceName}`,
        eyebrow: 'Pago confirmado',
        heading: 'Tu pago quedó confirmado',
        greeting: `Hola ${name},`,
        intro: 'Ya registramos tu pago. Estamos buscando un socio disponible para tu servicio.',
        highlight: { label: 'Monto pagado', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' },
          { label: 'Estado', value: 'Buscando socio' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento en vivo' },
        note: 'En otro correo te enviamos el comprobante de pago y, cuando corresponda, la boleta o factura electrónica.'
      })
    };
  },

  'payment.voucher': (ctx) => {
    const subject = `Comprobante de pago ${ctx.voucherCode || ''} — Fandez`.trim();
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nAdjuntamos tu comprobante de pago por ${formatCLP(ctx.amount)}.\nCódigo: ${ctx.voucherCode}\n\nVer comprobante: ${ctx.voucherUrl}\n\nLos documentos tributarios que correspondan se entregan por separado al correo de facturación.\n\nFandez`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Comprobante ${ctx.voucherCode || ''} por ${formatCLP(ctx.amount)}`,
        eyebrow: 'Comprobante',
        heading: 'Tu comprobante de pago está listo',
        greeting: `Hola ${name},`,
        intro: 'Guarda este acuse de recibo. Es tu respaldo del pago realizado en Fandez.',
        highlight: { label: 'Monto', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Código', value: ctx.voucherCode || '—' },
          { label: 'Servicio', value: ctx.request?.serviceName || '—' }
        ],
        cta: { href: ctx.voucherUrl, label: 'Ver comprobante' },
        note: 'Este acuse no reemplaza los documentos tributarios que correspondan a Fandez y al socio prestador.'
      })
    };
  },

  'payment.transfer_pending': (ctx) => {
    const subject = `Transferencia pendiente — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const ref = `FANDEZ-${ctx.request.id.slice(0, 8).toUpperCase()}`;
    const text = `Hola ${name},\n\nRegistramos tu solicitud de transferencia por ${formatCLP(ctx.amount)}.\nReferencia: ${ref}\n\nCuando confirmemos el abono, activaremos la búsqueda de técnico.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Transferencia pendiente de ${formatCLP(ctx.amount)}`,
        eyebrow: 'Transferencia',
        heading: 'Estamos esperando tu transferencia',
        greeting: `Hola ${name},`,
        intro: 'Registramos tu solicitud. Cuando confirmemos el abono, activamos la búsqueda de socio.',
        highlight: { label: 'Monto a transferir', value: formatCLP(ctx.amount), tone: 'warning' },
        details: [
          { label: 'Referencia', value: ref },
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Estado', value: 'Pendiente de abono' }
        ],
        note: 'Usa la misma referencia al transferir para que podamos asociar el pago sin demoras.'
      })
    };
  },

  'service.searching': (ctx) => {
    const subject = `Nueva solicitud — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider.name},\n\nHay una nueva solicitud de ${ctx.request.serviceName} en ${ctx.request.address}.\nMonto visita: ${formatCLP(ctx.amount)}.\n\nIngresa a tu panel Fandez para aceptarla.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Nueva solicitud de ${ctx.request.serviceName} cerca de ti`,
        eyebrow: 'Nuevo trabajo',
        heading: 'Hay una solicitud disponible',
        greeting: `Hola ${ctx.provider.name},`,
        intro: 'Un cliente pagó y está esperando. Revisa el detalle y acéptala desde tu panel.',
        highlight: { label: 'Visita', value: formatCLP(ctx.amount), tone: 'accent' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Zona', value: ctx.request.address || '—' }
        ],
        cta: { href: providerPanelUrl(), label: 'Abrir muro de trabajos' },
        note: 'Los pedidos se toman rápido. Mantente en línea y con alertas activas.'
      })
    };
  },

  'service.no_provider': (ctx) => {
    const minutes = ctx.timeoutMinutes || 15;
    const name = clientName(ctx);
    const subject = `Aún no encontramos un socio — ${ctx.request.serviceName}`;
    const text = `Hola ${name},\n\nHan pasado ${minutes} minutos y todavía no hemos encontrado un socio para tu servicio de ${ctx.request.serviceName}.\n\n¿Quieres que sigamos buscando?\n\n1. Sí, seguir buscando: ${ctx.continueUrl}\n2. Solicitar devolución (siguiente día hábil): ${ctx.refundUrl}\n\nTambién puedes elegir desde la app de Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Sin socio aún tras ${minutes} minutos — elige cómo continuar`,
        eyebrow: 'Sin socio disponible',
        heading: 'Aún no encontramos un socio',
        greeting: `Hola ${name},`,
        intro: `Han pasado ${minutes} minutos y todavía no hay un socio disponible para tu servicio de ${ctx.request.serviceName}. Puedes seguir buscando o solicitar la devolución.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Tiempo transcurrido', value: `${minutes} minutos` },
          { label: 'Devolución', value: 'Siguiente día hábil' }
        ],
        cta: [
          { href: ctx.continueUrl, label: 'Sí, seguir buscando', variant: 'primary' },
          { href: ctx.refundUrl, label: 'Solicitar devolución', variant: 'secondary' }
        ],
        note: 'También puedes elegir desde la app de Fandez.'
      })
    };
  },

  'provider.other_service_review': (ctx) => {
    const name = clientName(ctx);
    const serviceName = ctx.otherService?.name || 'servicio propuesto';
    const description = ctx.otherService?.description || '';
    const subject = `Recibimos tu solicitud de nuevo servicio — ${serviceName}`;
    const text = [
      `Hola ${name},`,
      '',
      `Recibimos tu solicitud para incorporar el servicio «${serviceName}» en Fandez.`,
      description ? `Descripción: ${description}` : null,
      '',
      'Vamos a revisar la solicitud para evaluarla e incorporarla en el futuro si encaja con la plataforma.',
      'Te avisaremos por este mismo correo cuando haya novedades.',
      '',
      'Mientras tanto puedes completar la verificación y el contrato de socio en tu panel.',
      providerPanelUrl()
    ].filter(Boolean).join('\n');
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Revisaremos «${serviceName}» para incorporarlo`,
        eyebrow: 'Nuevo servicio',
        heading: 'Recibimos tu solicitud',
        greeting: `Hola ${name},`,
        intro: `Vamos a revisar la solicitud del servicio «${serviceName}» para evaluarla e incorporarla en el futuro si encaja con Fandez.`,
        details: [
          { label: 'Servicio propuesto', value: serviceName },
          ...(description ? [{ label: 'Descripción', value: description }] : [])
        ],
        cta: { href: providerPanelUrl(), label: 'Ir al panel socio' },
        note: 'Te avisaremos por correo cuando haya novedades.'
      })
    };
  },

  'service.assigned': (ctx) => {
    const subject = `Socio asignado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\n${ctx.provider.name} fue asignado a tu servicio de ${ctx.request.serviceName}.\n\nSeguimiento en vivo: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${ctx.provider.name} tomó tu servicio de ${ctx.request.serviceName}`,
        eyebrow: 'Socio asignado',
        heading: 'Ya tenemos socio para tu visita',
        greeting: `Hola ${name},`,
        intro: `${ctx.provider.name} aceptó tu solicitud. Pronto verás el avance en el mapa.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Socio', value: ctx.provider.name },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento' }
      })
    };
  },

  'provider.job_assigned': (ctx) => {
    const subject = `Trabajo asignado — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider?.name || 'socio'},\n\nTe asignaron una solicitud de ${ctx.request.serviceName}.\nCliente: ${ctx.client?.name || ctx.request.clientName}\nDirección: ${ctx.request.address}\n${ctx.request.technicianName ? `Técnico: ${ctx.request.technicianName}\n` : ''}Ingresa a tu panel Fandez para gestionarla.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Gestiona ${ctx.request.serviceName} desde tu panel`,
        eyebrow: 'Asignación',
        heading: 'Te asignaron un trabajo',
        greeting: `Hola ${ctx.provider?.name || 'socio'},`,
        intro: 'Revisa el pedido, asigna técnico si corresponde y mantén al cliente informado.',
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Cliente', value: ctx.client?.name || ctx.request.clientName || '—' },
          { label: 'Dirección', value: ctx.request.address || '—' },
          ...(ctx.request.technicianName ? [{ label: 'Técnico', value: ctx.request.technicianName }] : [])
        ],
        cta: { href: `${appBaseUrl()}/proveedor/mando`, label: 'Abrir mando' }
      })
    };
  },

  'technician.job_assigned': (ctx) => {
    const subject = `Te asignaron un trabajo — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.request.technicianName || 'técnico'},\n\nTe asignaron una visita de ${ctx.request.serviceName}.\nDirección: ${ctx.request.address}\nCliente: ${ctx.client?.name || ctx.request.clientName}\n\nRevisa el detalle en tu panel Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Nueva visita de ${ctx.request.serviceName}`,
        eyebrow: 'Nuevo trabajo',
        heading: 'Te asignaron una visita',
        greeting: `Hola ${ctx.request.technicianName || 'técnico'},`,
        intro: 'Acepta a tiempo y actualiza tu estado en terreno (en camino, en sitio, completar).',
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Cliente', value: ctx.client?.name || ctx.request.clientName || '—' },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: technicianPanelUrl(), label: 'Abrir panel técnico' }
      })
    };
  },

  'technician.assigned': (ctx) => {
    const subject = `Técnico asignado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nEl técnico ${ctx.request.technicianName} fue asignado a tu visita.\nTeléfono: ${ctx.request.technicianPhone || 'disponible en la app'}\n\nSeguimiento: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${ctx.request.technicianName} irá a tu domicilio`,
        eyebrow: 'Técnico asignado',
        heading: 'Tu técnico ya está definido',
        greeting: `Hola ${name},`,
        intro: 'Puedes seguir la visita en vivo y contactarlo desde la app cuando corresponda.',
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Técnico', value: ctx.request.technicianName || '—' },
          { label: 'Teléfono', value: ctx.request.technicianPhone || 'Disponible en la app' },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento' }
      })
    };
  },

  'technician.en_route': (ctx) => {
    const subject = 'Tu técnico va en camino';
    const name = clientName(ctx);
    const tech = ctx.request.technicianName || 'Tu técnico';
    const text = `Hola ${name},\n\n${tech} está en camino a ${ctx.request.address}.\n\nSigue el servicio en vivo: ${trackUrl(ctx.request)}\nO abre la app Fandez para ver el mapa.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${tech} va hacia ${ctx.request.address || 'tu domicilio'}`,
        eyebrow: 'En camino',
        heading: 'Tu técnico ya salió hacia ti',
        greeting: `Hola ${name},`,
        intro: `${tech} está en ruta. Abre el mapa para ver el avance en tiempo real.`,
        details: [
          { label: 'Técnico', value: tech },
          { label: 'Dirección', value: ctx.request.address || '—' },
          { label: 'Servicio', value: ctx.request.serviceName || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver en el mapa' },
        note: 'También puedes seguirlo desde la app Fandez.'
      })
    };
  },

  'technician.arrived': (ctx) => {
    const subject = 'Técnico en tu domicilio';
    const name = clientName(ctx);
    const tech = ctx.request.technicianName || 'El técnico';
    const text = `Hola ${name},\n\n${tech} llegó a tu domicilio para el servicio de ${ctx.request.serviceName}.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${tech} llegó a tu domicilio`,
        eyebrow: 'En domicilio',
        heading: 'Tu técnico ya llegó',
        greeting: `Hola ${name},`,
        intro: `${tech} está en tu domicilio para el servicio de ${ctx.request.serviceName}.`,
        details: [
          { label: 'Técnico', value: tech },
          { label: 'Servicio', value: ctx.request.serviceName || '—' },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver estado' }
      })
    };
  },

  'technician.on_site': (ctx) => {
    const subject = `Técnico en sitio — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const tech = ctx.request.technicianName || 'El técnico';
    const text = `Hola ${name},\n\n${tech} ya está en tu domicilio e inicia el diagnóstico de ${ctx.request.serviceName}.\n\nSeguimiento: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${tech} inicia el diagnóstico`,
        eyebrow: 'En sitio',
        heading: 'Comienza el diagnóstico',
        greeting: `Hola ${name},`,
        intro: `${tech} ya está en tu domicilio e inicia el diagnóstico de ${ctx.request.serviceName}.`,
        details: [
          { label: 'Técnico', value: tech },
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento' }
      })
    };
  },

  'budget.sent': (ctx) => {
    const subject = `Presupuesto pendiente — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nEl técnico envió un presupuesto de ${formatCLP(ctx.amount)} para tu servicio.\n\nIngresa a Fandez para aprobar o rechazar: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Presupuesto de ${formatCLP(ctx.amount)} pendiente de tu decisión`,
        eyebrow: 'Presupuesto',
        heading: 'Tienes un presupuesto por revisar',
        greeting: `Hola ${name},`,
        intro: 'El técnico envió un presupuesto para continuar el trabajo. Apruébalo o recházalo desde el seguimiento.',
        highlight: { label: 'Monto propuesto', value: formatCLP(ctx.amount), tone: 'warning' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Revisar presupuesto' },
        note: 'Sin tu decisión el trabajo no puede avanzar.'
      })
    };
  },

  'budget.approved': (ctx) => {
    const subject = `Presupuesto aprobado — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente aprobó el presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}.\n${ctx.pendingPayment ? 'Queda pendiente el pago del ajuste en la app.\n' : 'Puedes continuar el trabajo.\n'}Dirección: ${ctx.request.address}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Cliente aprobó ${formatCLP(ctx.amount)}`,
        eyebrow: 'Presupuesto aprobado',
        heading: 'El cliente aprobó el presupuesto',
        greeting: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},`,
        intro: ctx.pendingPayment
          ? 'Queda pendiente el pago del ajuste en la app antes de continuar.'
          : 'Puedes continuar el trabajo con el monto aprobado.',
        highlight: { label: 'Presupuesto', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' },
          { label: 'Estado', value: ctx.pendingPayment ? 'Esperando pago del ajuste' : 'Listo para continuar' }
        ],
        cta: { href: providerPanelUrl(), label: 'Abrir panel' }
      })
    };
  },

  'budget.rejected': (ctx) => {
    const subject = `Presupuesto rechazado — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente rechazó el presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}. La visita quedó cerrada.\nDirección: ${ctx.request.address}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: 'El cliente rechazó el presupuesto',
        eyebrow: 'Presupuesto rechazado',
        heading: 'La visita quedó cerrada',
        greeting: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},`,
        intro: `El cliente rechazó el presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' },
          { label: 'Estado', value: 'Visita cerrada' }
        ]
      })
    };
  },

  'budget.rejected_client': (ctx) => {
    const subject = `Presupuesto rechazado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nRegistramos el rechazo del presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}. La visita quedó finalizada.\n\nSi necesitas otro servicio, puedes solicitarlo desde la app Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: 'Registramos el rechazo del presupuesto',
        eyebrow: 'Presupuesto rechazado',
        heading: 'Visita finalizada',
        greeting: `Hola ${name},`,
        intro: `Registramos el rechazo del presupuesto de ${formatCLP(ctx.amount)}. La visita quedó finalizada.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Presupuesto', value: formatCLP(ctx.amount) }
        ],
        cta: { href: appBaseUrl(), label: 'Solicitar otro servicio' },
        note: 'Si necesitas ayuda, responde este correo o escribe a soporte.'
      })
    };
  },

  'activity.change_proposed': (ctx) => {
    const subject = `Cambio de servicio propuesto — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nEl técnico indica que el trabajo es distinto.\nAntes: ${ctx.fromActivityName || '—'}\nAhora: ${ctx.activityName || '—'}\nNuevo valor: ${formatCLP(ctx.amount)}\n\nDebes aprobar o rechazar en la app:\n${trackUrl(ctx.request)}\n\nFandez`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Cambio propuesto a ${ctx.activityName || 'otro servicio'}`,
        eyebrow: 'Cambio de servicio',
        heading: 'El técnico propone un cambio',
        greeting: `Hola ${name},`,
        intro: 'Indica que el trabajo en terreno es distinto al solicitado. Debes aprobar o rechazar para continuar.',
        highlight: { label: 'Nuevo valor', value: formatCLP(ctx.amount), tone: 'warning' },
        details: [
          { label: 'Antes', value: ctx.fromActivityName || '—' },
          { label: 'Ahora', value: ctx.activityName || '—' },
          { label: 'Servicio', value: ctx.request.serviceName }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Aprobar o rechazar' }
      })
    };
  },

  'activity.change_resolved': (ctx) => {
    const subject = `Cambio de servicio ${ctx.approved ? 'aprobado' : 'rechazado'} — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente ${ctx.approved ? 'aprobó' : 'rechazó'} el cambio de servicio.\nAntes: ${ctx.fromActivityName || '—'}\nAhora: ${ctx.activityName || '—'}\n${ctx.approved && ctx.pendingPayment ? 'Queda pendiente el pago del ajuste.\n' : ctx.approved ? 'Puedes continuar con el trabajo actualizado.\n' : 'Mantén el servicio original acordado.\n'}Dirección: ${ctx.request.address}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: ctx.approved ? 'Cliente aprobó el cambio' : 'Cliente rechazó el cambio',
        eyebrow: ctx.approved ? 'Cambio aprobado' : 'Cambio rechazado',
        heading: ctx.approved ? 'Puedes continuar con el cambio' : 'Mantén el servicio original',
        greeting: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},`,
        intro: ctx.approved && ctx.pendingPayment
          ? 'Queda pendiente el pago del ajuste antes de seguir.'
          : ctx.approved
            ? 'El cliente aprobó el cambio. Continúa con el trabajo actualizado.'
            : 'El cliente rechazó el cambio. Mantén el servicio original acordado.',
        details: [
          { label: 'Antes', value: ctx.fromActivityName || '—' },
          { label: 'Ahora', value: ctx.activityName || '—' },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ]
      })
    };
  },

  'payment.additional_approved': (ctx) => {
    const subject = `Pago de ajuste confirmado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nConfirmamos tu pago de ajuste de ${formatCLP(ctx.amount)} por ${ctx.request.serviceName}.\nMotivo: ${ctx.description || 'Ajuste de servicio'}\n\nSeguimiento: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Ajuste de ${formatCLP(ctx.amount)} confirmado`,
        eyebrow: 'Pago de ajuste',
        heading: 'Confirmamos tu pago de ajuste',
        greeting: `Hola ${name},`,
        intro: 'El pago adicional quedó registrado. El equipo puede continuar el trabajo.',
        highlight: { label: 'Monto del ajuste', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Motivo', value: ctx.description || 'Ajuste de servicio' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento' }
      })
    };
  },

  'payment.additional_provider': (ctx) => {
    const subject = `Cliente pagó el ajuste — ${ctx.request.serviceName}`;
    const text = `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente pagó el ajuste de ${formatCLP(ctx.amount)} (${ctx.description || 'ajuste'}).\nPuedes continuar el trabajo de ${ctx.request.serviceName}.\nDirección: ${ctx.request.address}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Ajuste de ${formatCLP(ctx.amount)} pagado`,
        eyebrow: 'Ajuste pagado',
        heading: 'El cliente pagó el ajuste',
        greeting: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},`,
        intro: 'Puedes continuar el trabajo con el monto adicional confirmado.',
        highlight: { label: 'Ajuste recibido', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Motivo', value: ctx.description || 'Ajuste' },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: providerPanelUrl(), label: 'Abrir panel' }
      })
    };
  },

  'material.added': (ctx) => {
    const subject = `Material registrado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nSe registró un material en tu servicio de ${ctx.request.serviceName}:\n${ctx.description || 'Material'}: ${formatCLP(ctx.amount)}\n\nSeguimiento: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${ctx.description || 'Material'}: ${formatCLP(ctx.amount)}`,
        eyebrow: 'Materiales',
        heading: 'Se registró un material',
        greeting: `Hola ${name},`,
        intro: 'El técnico agregó un material a tu servicio. Puedes ver el detalle en el seguimiento.',
        highlight: { label: ctx.description || 'Material', value: formatCLP(ctx.amount), tone: 'accent' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver detalle' }
      })
    };
  },

  'service.cancelled_refund': (ctx) => {
    const subject = `Devolución solicitada — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const refundDate = ctx.refundDate || 'próximo día hábil';
    const text = `Hola ${name},\n\nConfirmamos tu solicitud de devolución por ${ctx.request.serviceName}.\nMonto: ${formatCLP(ctx.amount)}\nFecha comprometida (día hábil): ${refundDate}\n\nAdministración procesará el abono al mismo medio de pago. Te avisaremos cuando quede liquidada.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Devolución de ${formatCLP(ctx.amount)} comprometida para ${refundDate}`,
        eyebrow: 'Devolución',
        heading: 'Solicitud de devolución recibida',
        greeting: `Hola ${name},`,
        intro: `Confirmamos tu solicitud de devolución por el servicio de ${ctx.request.serviceName}. Administración procesará el abono al mismo medio de pago.`,
        highlight: { label: 'Monto a devolver', value: formatCLP(ctx.amount), tone: 'accent' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Fecha comprometida', value: refundDate },
          { label: 'Medio de pago', value: 'El mismo usado en la compra' },
          { label: 'Estado', value: 'En proceso por administración' }
        ],
        cta: [
          { href: appBaseUrl(), label: 'Ir a Fandez', variant: 'primary' },
          { href: company.whatsappLink('Hola, consulto por mi devolución de ' + (ctx.request.serviceName || 'servicio')), label: 'Consultar por WhatsApp', variant: 'secondary' }
        ],
        note: 'Te avisaremos por correo cuando la devolución quede liquidada. Si no ves el abono en la fecha comprometida, escríbenos con el número de tu solicitud.'
      })
    };
  },

  'service.keep_searching': (ctx) => {
    const subject = `Seguimos buscando socio — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nRecibimos tu elección: seguiremos buscando un socio para ${ctx.request.serviceName}.\nTe avisaremos apenas alguien tome la solicitud.\n\nSeguimiento: ${trackUrl(ctx.request)}`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Seguimos buscando socio para ${ctx.request.serviceName}`,
        eyebrow: 'Búsqueda activa',
        heading: 'Seguimos buscando un socio',
        greeting: `Hola ${name},`,
        intro: `Recibimos tu elección. Continuamos buscando un socio para ${ctx.request.serviceName} y te avisamos apenas alguien acepte.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Estado', value: 'Búsqueda ampliada' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver seguimiento' }
      })
    };
  },

  'service.completed': (ctx) => {
    const subject = `Servicio completado — ${ctx.request.serviceName}`;
    const name = clientName(ctx);
    const text = `Hola ${name},\n\nTu servicio de ${ctx.request.serviceName} fue completado.\n\nGracias por usar Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${ctx.request.serviceName} completado — gracias por confiar en Fandez`,
        eyebrow: 'Completado',
        heading: 'Tu servicio fue completado',
        greeting: `Hola ${name},`,
        intro: `El servicio de ${ctx.request.serviceName} quedó cerrado. Gracias por confiar en Fandez.`,
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Dirección', value: ctx.request.address || '—' },
          { label: 'Estado', value: 'Completado' }
        ],
        cta: { href: trackUrl(ctx.request), label: 'Ver resumen' },
        note: 'Si quieres dejar una reseña, puedes hacerlo desde la app. Nos ayuda a mejorar el servicio.'
      })
    };
  },

  'payout.scheduled': (ctx) => {
    const subject = `Pago programado para el ${ctx.payDateLabel} — ${formatCLP(ctx.amount)}`;
    const text = `Hola ${ctx.provider?.name || 'socio'},\n\nLa liquidación de ${ctx.request.serviceName} quedó programada.\n\nMonto a recibir: ${formatCLP(ctx.amount)}\nFecha de pago: ${ctx.payDateLabel}\nCorte aplicado: miércoles 12:00 (hora de Chile).\n\nLos trabajos cerrados después del corte pasan al viernes de la semana siguiente.\n\nRevisa el detalle y tu paquete de facturación en el panel Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Liquidación de ${formatCLP(ctx.amount)} para el ${ctx.payDateLabel}`,
        eyebrow: 'Liquidación',
        heading: 'Pago programado',
        greeting: `Hola ${ctx.provider?.name || 'socio'},`,
        intro: `La liquidación de ${ctx.request.serviceName} quedó agendada según el corte semanal.`,
        highlight: { label: 'Monto a recibir', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Fecha de pago', value: ctx.payDateLabel },
          { label: 'Corte', value: 'Miércoles 12:00 (Chile)' }
        ],
        cta: { href: providerPanelUrl(), label: 'Ver en el panel' },
        note: 'Los trabajos cerrados después del corte pasan al viernes de la semana siguiente.'
      })
    };
  },

  'payout.paid': (ctx) => {
    const subject = `Pago liquidado — ${formatCLP(ctx.amount)}`;
    const text = `Hola ${ctx.provider?.name || 'socio'},\n\nMarcamos como pagada la liquidación de ${ctx.request.serviceName}.\nMonto: ${formatCLP(ctx.amount)}\nFecha: ${ctx.paidAtLabel || 'hoy'}\n\nRevisa el detalle en tu panel Fandez.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Liquidación de ${formatCLP(ctx.amount)} marcada como pagada`,
        eyebrow: 'Pago liquidado',
        heading: 'Tu liquidación fue pagada',
        greeting: `Hola ${ctx.provider?.name || 'socio'},`,
        intro: `Marcamos como pagada la liquidación de ${ctx.request.serviceName}.`,
        highlight: { label: 'Monto pagado', value: formatCLP(ctx.amount), tone: 'success' },
        details: [
          { label: 'Servicio', value: ctx.request.serviceName },
          { label: 'Fecha', value: ctx.paidAtLabel || 'Hoy' }
        ],
        cta: { href: providerPanelUrl(), label: 'Ver detalle' }
      })
    };
  },

  'service.job_voucher': (ctx) => {
    const subject = `Voucher final del trabajo ${ctx.voucherCode} — Fandez`;
    const text = `El trabajo de ${ctx.request.serviceName} fue cerrado.\n\nTotal final: ${formatCLP(ctx.amount)}\nVoucher: ${ctx.voucherUrl}\n\nEste comprobante no reemplaza los documentos tributarios correspondientes.`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `Voucher final ${ctx.voucherCode} — ${formatCLP(ctx.amount)}`,
        eyebrow: 'Voucher final',
        heading: 'Comprobante del trabajo cerrado',
        intro: `El trabajo de ${ctx.request.serviceName} fue cerrado. Aquí tienes el voucher final.`,
        highlight: { label: 'Total final', value: formatCLP(ctx.amount), tone: 'accent' },
        details: [
          { label: 'Código', value: ctx.voucherCode || '—' },
          { label: 'Servicio', value: ctx.request.serviceName }
        ],
        cta: { href: ctx.voucherUrl, label: 'Ver voucher' },
        note: 'Este comprobante no reemplaza los documentos tributarios correspondientes.'
      })
    };
  },

  'dte.issued': (ctx) => {
    const link = `${company.appUrl}${ctx.pdfUrl}`;
    const kind = ctx.docKind || 'documento';
    const name = clientName(ctx);
    const subject = `Tu ${kind} electrónica N° ${ctx.folio} — Fandez`;
    const text = `Hola ${name},\n\nEmitimos tu ${kind} electrónica N° ${ctx.folio} por ${formatCLP(ctx.amount)}.\n\nDescárgala: ${link}\n\nSolicitud: ${ctx.request.id}\n\nFandez`;
    return {
      subject,
      text,
      html: transactional({
        title: subject,
        preheader: `${kind} N° ${ctx.folio} por ${formatCLP(ctx.amount)}`,
        eyebrow: 'Documento tributario',
        heading: `Tu ${kind} electrónica está lista`,
        greeting: `Hola ${name},`,
        intro: `Emitimos tu ${kind} electrónica N° ${ctx.folio}.`,
        highlight: { label: 'Monto', value: formatCLP(ctx.amount), tone: 'accent' },
        details: [
          { label: 'Folio', value: String(ctx.folio) },
          { label: 'Tipo', value: kind },
          { label: 'Solicitud', value: ctx.request?.id || '—' }
        ],
        cta: { href: link, label: 'Descargar documento' },
        note: 'Documento tributario electrónico (SII). Guárdalo para tu contabilidad.'
      })
    };
  }
};

function persistNotification(record) {
  notifications.unshift(record);
  if (notifications.length > 500) notifications.pop();
  repository.persist(() => repository.saveNotification(record), `notif ${record.id}`);
}

async function deliverEmail({ to, subject, text, html }) {
  try {
    const result = await mailer.sendMail({ to, subject, text, html });
    return {
      status: result.error ? 'failed' : (result.skipped ? 'skipped' : 'sent'),
      error: result.error || null,
      demo: Boolean(result.demo)
    };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function notify({ event, to, phone, subject, text, html, requestId, userId, meta = {} }) {
  if (!isEnabled()) return null;

  const record = {
    id: `ntf-${uuidv4().slice(0, 12)}`,
    event,
    channel: 'email',
    status: 'queued',
    recipient: to || null,
    subject,
    body: text,
    meta,
    requestId: requestId || null,
    userId: userId || null,
    error: null,
    createdAt: new Date().toISOString()
  };

  if (to) {
    const emailResult = await deliverEmail({ to, subject, text, html });
    record.status = emailResult.status;
    record.error = emailResult.error;
    if (emailResult.demo) record.meta = { ...meta, demoMail: true };
  } else {
    record.status = 'skipped';
    record.error = 'sin email';
  }

  persistNotification(record);

  if (phone) {
    const wa = whatsappUrl(phone, text);
    if (wa) {
      persistNotification({
        id: `ntf-${uuidv4().slice(0, 12)}`,
        event,
        channel: 'whatsapp',
        status: 'queued',
        recipient: phone,
        subject: null,
        body: text,
        meta: { ...meta, whatsappUrl: wa },
        requestId: requestId || null,
        userId: userId || null,
        error: null,
        createdAt: new Date().toISOString()
      });
    }
  }

  return record;
}

async function sendEvent(event, ctx) {
  const tpl = TEMPLATES[event];
  if (!tpl) return null;
  const { subject, text, html } = tpl(ctx);
  const client = ctx.client;
  return notify({
    event,
    to: ctx.to || client?.email,
    phone: client?.phone || ctx.phone,
    subject,
    text,
    html,
    requestId: ctx.request?.id,
    userId: client?.id,
    meta: ctx.meta || {}
  });
}

function getRecent(limit = 50) {
  return notifications.slice(0, limit);
}

function getStats() {
  const recent = notifications.slice(0, 200);
  return {
    total: notifications.length,
    sent: recent.filter((n) => n.status === 'sent').length,
    failed: recent.filter((n) => n.status === 'failed').length,
    emailConfigured: mailer.isConfigured()
  };
}

module.exports = {
  bindStore,
  notify,
  sendEvent,
  getRecent,
  getStats,
  whatsappUrl,
  isEnabled,
  TEMPLATES
};
