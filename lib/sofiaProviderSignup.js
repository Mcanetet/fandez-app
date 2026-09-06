/**
 * Avisos Sofía / email al registrar un socio (y solicitudes de “otros servicios”).
 */
const db = require('./db');
const aland = require('./aland');
const adminNotify = require('./aland/adminNotify');
const notifications = require('./notifications');
const company = require('../config/company');

function dash(value) {
  const s = String(value || '').trim();
  return s || 'Pendiente (se completa en contrato)';
}

function formatSpecialties(store, specialtyIds) {
  const ids = Array.isArray(specialtyIds) ? specialtyIds : [];
  if (!ids.length) return 'Ninguna del catálogo (solo solicitud “Otros”)';
  return ids
    .map((id) => {
      const svc = typeof store.getServiceById === 'function' ? store.getServiceById(id) : null;
      return svc?.name || id;
    })
    .join(', ');
}

function buildSignupBody({ user, store, otherService }) {
  const contract = user.providerContract || {};
  const entity = contract.legalEntity || {};
  const rep = contract.legalRepresentative || {};
  const lines = [
    'Nueva inscripción de socio en Fandez.',
    '',
    `Nombre / contacto: ${user.name || '—'}`,
    `Correo: ${user.email || '—'}`,
    `Teléfono: ${user.phone || '—'}`,
    `RUT empresa: ${dash(entity.rut)}`,
    `Razón social: ${dash(entity.legalName)}`,
    `Representante: ${dash(rep.fullName || user.name)}`,
    `RUT representante: ${dash(rep.rut)}`,
    `Dirección: ${user.address || '—'}`,
    `Especialidades catálogo: ${formatSpecialties(store, user.specialties)}`,
    `ID socio: ${user.id}`
  ];

  if (otherService?.name) {
    lines.push(
      '',
      'Solicitud de NUEVO servicio (Otros):',
      `· Nombre: ${otherService.name}`,
      `· Descripción: ${otherService.description || '—'}`
    );
  }

  lines.push('', 'Revisa en Admin → Mensajes / Contratos según corresponda.');
  if (company.appUrl) {
    lines.push(`Panel: ${String(company.appUrl).replace(/\/+$/, '')}`);
  }
  return lines.join('\n');
}

async function emailOtherServiceReview({ user, otherService }) {
  if (!otherService?.name || !user?.email) return null;
  try {
    return await notifications.sendEvent('provider.other_service_review', {
      to: user.email,
      client: user,
      otherService,
      meta: { providerId: user.id }
    });
  } catch (err) {
    console.error('[sofia-signup] email otros servicios:', err.message);
    return null;
  }
}

async function postSofiaAdminChat({ user, store, otherService, io }) {
  const body = buildSignupBody({ user, store, otherService });
  const title = otherService?.name
    ? `Sofía · Nuevo socio + servicio solicitado: ${otherService.name}`
    : `Sofía · Nueva inscripción de socio: ${user.name || user.email}`;

  let conversation = null;
  let message = null;

  if (db.isConfigured && db.isConfigured()) {
    try {
      conversation = await aland.createConversation({
        serviceId: 'provider-signup',
        serviceName: otherService?.name
          ? `Inscripción socio · Otros: ${otherService.name}`
          : 'Nueva inscripción de socio',
        clientId: user.id,
        clientName: user.name || user.email,
        clientEmail: user.email
      });

      message = await aland.addMessage({
        conversationId: conversation.id,
        senderType: 'aland',
        senderName: 'Sofía',
        body,
        meta: {
          type: 'provider_signup',
          providerId: user.id,
          otherService: otherService || null
        }
      });

      await aland.escalateToAdmin(conversation, io, 'provider_signup');
    } catch (err) {
      console.error('[sofia-signup] chat admin:', err.message);
    }
  }

  try {
    await adminNotify.notifyAdminFree({
      title,
      body,
      conversationId: conversation?.id || null,
      clientName: user.name
    });
  } catch (err) {
    console.error('[sofia-signup] notifyAdminFree:', err.message);
  }

  return { conversation, message };
}

/**
 * Tras registro exitoso de socio: Sofía avisa al admin + email si pidió “Otros servicios”.
 */
async function notifyProviderSignup({ user, store, otherService, io }) {
  if (!user || user.role !== 'provider') return null;

  const tasks = [postSofiaAdminChat({ user, store, otherService, io })];
  if (otherService?.name) {
    tasks.push(emailOtherServiceReview({ user, otherService }));
  }
  const [chat] = await Promise.all(tasks);
  return chat;
}

module.exports = {
  notifyProviderSignup,
  buildSignupBody,
  emailOtherServiceReview
};
