/**
 * Alertas abiertas / acciones pendientes para cliente, socio y técnico.
 * No reemplaza toasts: es la bandeja para volver a revisar lo que sigue pendiente.
 */

function urgencyRank(u) {
  if (u === 'high') return 0;
  if (u === 'medium') return 1;
  return 2;
}

function pushAlert(list, item) {
  if (!item?.title) return;
  list.push({
    id: item.id || `${item.kind || 'alert'}-${item.requestId || item.at || Math.random().toString(36).slice(2, 8)}`,
    kind: item.kind || 'info',
    urgency: item.urgency || 'medium',
    title: item.title,
    body: item.body || '',
    href: item.href || null,
    cta: item.cta || 'Revisar',
    requestId: item.requestId || null,
    at: item.at || new Date().toISOString()
  });
}

function clientTrackUrl(request) {
  if (!request?.serviceId || !request?.id) return '/cliente';
  return `/cliente/servicio/${encodeURIComponent(request.serviceId)}?tracking=${encodeURIComponent(request.id)}`;
}

function providerJobUrl(request) {
  if (!request?.id) return '/proveedor/mando';
  return `/proveedor/mando?pedido=${encodeURIComponent(request.id)}`;
}

function techJobUrl(request) {
  if (!request?.id) return '/tecnico';
  return `/tecnico/trabajo/${encodeURIComponent(request.id)}`;
}

function collectClientRequestAlerts(request, list) {
  if (!request || ['cancelled', 'completed'].includes(String(request.status || ''))) return;
  const sr = request.siteReport || {};
  const name = request.serviceName || 'Tu visita';
  const href = clientTrackUrl(request);
  const at = request.updatedAt || request.createdAt;

  if (request.techStatus === 'presupuesto_pendiente' && sr.budgetStatus === 'pending') {
    pushAlert(list, {
      kind: 'budget',
      urgency: 'high',
      title: `Presupuesto por aprobar · ${name}`,
      body: 'Aprueba o rechaza el presupuesto del técnico.',
      href,
      cta: 'Revisar',
      requestId: request.id,
      at
    });
  }
  if (sr.materialsPurchase?.status === 'pending') {
    pushAlert(list, {
      kind: 'materials',
      urgency: 'high',
      title: `Producto por aprobar · ${name}`,
      body: 'Aprueba, pide detalle o rechaza la compra.',
      href,
      cta: 'Revisar',
      requestId: request.id,
      at
    });
  }
  if (sr.activityChange?.status === 'pending') {
    pushAlert(list, {
      kind: 'change',
      urgency: 'high',
      title: `Cambio de precio · ${name}`,
      body: 'Confirma o rechaza el ajuste.',
      href,
      cta: 'Revisar',
      requestId: request.id,
      at
    });
  }
  if (sr.additionalPayment?.status === 'pending' || request.additionalPaymentPending) {
    pushAlert(list, {
      kind: 'payment',
      urgency: 'high',
      title: `Pago adicional · ${name}`,
      body: 'Hay un cobro pendiente para continuar.',
      href,
      cta: 'Pagar',
      requestId: request.id,
      at
    });
  }
  if (request.paymentStatus === 'pending_transfer') {
    pushAlert(list, {
      kind: 'transfer',
      urgency: 'high',
      title: `Transferencia pendiente · ${name}`,
      body: 'Sube el comprobante o completa el pago.',
      href: `/pagos/transferencia?ref=${encodeURIComponent(request.id)}`,
      cta: 'Ver pago',
      requestId: request.id,
      at
    });
  }
  if (request.techStatus === 'en_sitio' && request.arrivalCode && !request.arrivalCodeVerified && !request.arrivalCodeVerifiedAt) {
    pushAlert(list, {
      kind: 'code',
      urgency: 'medium',
      title: `Código de seguridad · ${name}`,
      body: 'Entrega el código al técnico en el domicilio.',
      href,
      cta: 'Ver código',
      requestId: request.id,
      at
    });
  }
  if (['assigned', 'in_progress', 'searching', 'paid'].includes(String(request.status || ''))
    && ['asignado', 'aceptado', 'en_camino', 'en_sitio', 'diagnostico', 'reparando'].includes(String(request.techStatus || ''))) {
    // No duplicar si ya hay acción crítica; solo un “seguir visita” si no hay otras.
    const hasAction = list.some((a) => a.requestId === request.id);
    if (!hasAction) {
      pushAlert(list, {
        kind: 'tracking',
        urgency: 'low',
        title: `Visita en curso · ${name}`,
        body: request.technicianName
          ? `${request.technicianName} · ${String(request.techStatus || '').replace(/_/g, ' ')}`
          : 'Sigue el estado de tu pedido.',
        href,
        cta: 'Abrir',
        requestId: request.id,
        at
      });
    }
  }
}

function collectProviderRequestAlerts(request, list) {
  if (!request || ['cancelled', 'completed'].includes(String(request.status || ''))) return;
  const sr = request.siteReport || {};
  const name = request.serviceName || 'Pedido';
  const href = providerJobUrl(request);
  const at = request.updatedAt || request.createdAt;

  if (request.techStatus === 'asignado' && !request.technicianId) {
    pushAlert(list, {
      kind: 'assign_tech',
      urgency: 'high',
      title: `Asigna técnico · ${name}`,
      body: `${request.clientName || 'Cliente'} espera un técnico.`,
      href,
      cta: 'Asignar',
      requestId: request.id,
      at
    });
  }
  if (sr.materialsPurchase?.status === 'clarification_pending') {
    pushAlert(list, {
      kind: 'materials_clarify',
      urgency: 'high',
      title: `Cliente pide detalle · ${name}`,
      body: 'Responde la aclaración del producto o material.',
      href,
      cta: 'Responder',
      requestId: request.id,
      at
    });
  }
  if (request.safetyAlert && !request.safetyAlert.resolvedAt) {
    pushAlert(list, {
      kind: 'safety',
      urgency: 'high',
      title: `Alerta de seguridad · ${name}`,
      body: 'Hay un incidente abierto en este pedido.',
      href,
      cta: 'Ver pedido',
      requestId: request.id,
      at: request.safetyAlert.at || at
    });
  }
  if (['assigned', 'in_progress'].includes(String(request.status || ''))) {
    const hasAction = list.some((a) => a.requestId === request.id);
    if (!hasAction) {
      pushAlert(list, {
        kind: 'job',
        urgency: 'low',
        title: `Pedido activo · ${name}`,
        body: `${request.clientName || 'Cliente'} · ${String(request.techStatus || request.status || '').replace(/_/g, ' ')}`,
        href,
        cta: 'Abrir',
        requestId: request.id,
        at
      });
    }
  }
}

function collectTechRequestAlerts(request, list) {
  if (!request || ['cancelled', 'completed'].includes(String(request.status || ''))) return;
  const sr = request.siteReport || {};
  const name = request.serviceName || 'Trabajo';
  const href = techJobUrl(request);
  const at = request.updatedAt || request.createdAt;

  if (request.techStatus === 'asignado') {
    pushAlert(list, {
      kind: 'accept',
      urgency: 'high',
      title: `Acepta el trabajo · ${name}`,
      body: `${request.address || request.clientName || 'Cliente'}`,
      href,
      cta: 'Abrir',
      requestId: request.id,
      at
    });
  }
  if (sr.materialsPurchase?.status === 'clarification_pending') {
    pushAlert(list, {
      kind: 'materials_clarify',
      urgency: 'high',
      title: `Cliente pide detalle · ${name}`,
      body: 'Completa la aclaración del producto.',
      href,
      cta: 'Responder',
      requestId: request.id,
      at
    });
  }
  if (sr.materialsPurchase?.status === 'pending') {
    pushAlert(list, {
      kind: 'materials_wait',
      urgency: 'medium',
      title: `Esperando OK del cliente · ${name}`,
      body: 'La compra de producto está pendiente de aprobación.',
      href,
      cta: 'Ver',
      requestId: request.id,
      at
    });
  }
  if (request.techStatus === 'presupuesto_pendiente') {
    pushAlert(list, {
      kind: 'budget_wait',
      urgency: 'medium',
      title: `Presupuesto enviado · ${name}`,
      body: 'Esperando respuesta del cliente.',
      href,
      cta: 'Ver',
      requestId: request.id,
      at
    });
  }
  if (['aceptado', 'en_camino', 'en_sitio', 'diagnostico', 'reparando', 'comprando'].includes(String(request.techStatus || ''))) {
    const hasAction = list.some((a) => a.requestId === request.id && a.urgency === 'high');
    if (!hasAction) {
      pushAlert(list, {
        kind: 'job',
        urgency: request.techStatus === 'en_sitio' ? 'medium' : 'low',
        title: `Trabajo en curso · ${name}`,
        body: String(request.techStatus || '').replace(/_/g, ' '),
        href,
        cta: 'Continuar',
        requestId: request.id,
        at
      });
    }
  }
}

function collectComplaints(store, user, list) {
  const complaints = store.COMPLAINTS || [];
  complaints
    .filter((c) => c && c.status !== 'resuelto')
    .filter((c) => {
      if (c.reporterId === user.id) return true;
      if (user.role === 'client' && c.clientId === user.id) return true;
      if (user.role === 'provider' && c.providerId === user.id) return true;
      if (user.role === 'tecnico' && (c.technicianId === user.id || c.reporterId === user.id)) return true;
      return false;
    })
    .slice(0, 12)
    .forEach((c) => {
      let href = null;
      if (user.role === 'client' && c.requestId) {
        const req = store.getAllRequests().find((r) => r.id === c.requestId);
        href = req ? clientTrackUrl(req) : '/cliente';
      } else if (user.role === 'provider') {
        href = c.requestId ? providerJobUrl({ id: c.requestId }) : '/proveedor';
      } else if (user.role === 'tecnico') {
        href = c.requestId ? techJobUrl({ id: c.requestId }) : '/tecnico';
      }
      pushAlert(list, {
        id: `complaint-${c.id}`,
        kind: c.type === 'seguridad' ? 'safety' : 'complaint',
        urgency: c.type === 'seguridad' ? 'high' : 'medium',
        title: c.subject || (c.type === 'seguridad' ? 'Alerta de seguridad abierta' : 'Reclamo abierto'),
        body: String(c.description || c.categoryLabel || '').slice(0, 160),
        href,
        cta: 'Ver',
        requestId: c.requestId || null,
        at: c.createdAt || c.updatedAt
      });
    });
}

function collectSiteAlerts(siteAlertsList, list) {
  (siteAlertsList || []).forEach((a) => {
    pushAlert(list, {
      id: `site-${a.id}`,
      kind: 'site',
      urgency: a.tone === 'warning' ? 'medium' : 'low',
      title: a.title || 'Aviso Fandez',
      body: a.message || '',
      href: null,
      cta: 'Entendido',
      at: a.updatedAt || a.createdAt
    });
  });
}

/**
 * @param {object} store
 * @param {object} user
 * @param {{ siteAlerts?: array }} opts
 */
function listOpenAlertsForUser(store, user, opts = {}) {
  if (!store || !user?.id || !user?.role) {
    return { alerts: [], count: 0, actionCount: 0 };
  }

  const list = [];
  let requests = [];
  if (user.role === 'client') {
    requests = typeof store.getRequestsByClient === 'function' ? store.getRequestsByClient(user.id) : [];
    requests.forEach((r) => collectClientRequestAlerts(r, list));
  } else if (user.role === 'provider') {
    requests = typeof store.getRequestsByProvider === 'function' ? store.getRequestsByProvider(user.id) : [];
    requests.forEach((r) => collectProviderRequestAlerts(r, list));
  } else if (user.role === 'tecnico') {
    requests = typeof store.getRequestsByTechnician === 'function' ? store.getRequestsByTechnician(user.id) : [];
    requests.forEach((r) => collectTechRequestAlerts(r, list));
  }

  collectComplaints(store, user, list);
  collectSiteAlerts(opts.siteAlerts, list);

  // Dedup por id
  const seen = new Set();
  const alerts = list
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency)
      || new Date(b.at || 0) - new Date(a.at || 0));

  const actionCount = alerts.filter((a) => a.urgency === 'high' || a.urgency === 'medium').length;
  return {
    alerts,
    count: alerts.length,
    actionCount
  };
}

module.exports = {
  listOpenAlertsForUser,
  clientTrackUrl,
  providerJobUrl,
  techJobUrl
};
