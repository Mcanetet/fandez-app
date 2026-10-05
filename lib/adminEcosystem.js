const { getContractSummary } = require('./contracts');
const { getProviderActivationSteps } = require('./onboarding');

const STATUS_LABELS = {
  operativa: 'Operativa',
  casi_lista: 'Casi lista',
  incompleta: 'Incompleta',
  pausada: 'Pausada'
};

function assessProvider(store, provider, serviceById) {
  const contractSummary = getContractSummary(provider.providerContract);
  const goOnline = store.canProviderGoOnline(provider);
  const statusRows = store.getProviderServicesStatus(provider.id);
  const enabled = statusRows.filter((s) => s.enabled);
  const withoutTech = enabled.filter((s) => !s.covered);

  const missing = [];
  if (!goOnline.ok && goOnline.missing?.length) {
    missing.push(...goOnline.missing.map((m) => `Falta ${m}`));
  }
  if (!Array.isArray(provider.specialties) || !provider.specialties.length) {
    missing.push('Sin especialidades configuradas');
  }
  for (const row of withoutTech) {
    missing.push(`Sin técnico activo: ${row.name || row.id}`);
  }
  if (!contractSummary.canOperate) {
    missing.push(`Contrato: ${contractSummary.label || contractSummary.status}`);
  }

  let payoutNote = null;
  try {
    const setup = store.getProviderPayoutSetupForUser?.(provider.id);
    if (setup && !setup.docsComplete) {
      payoutNote = 'Documentos de liquidación incompletos';
      if (setup.missing?.length) missing.push(`Liquidación: ${setup.missing.slice(0, 3).join(', ')}`);
    }
  } catch (_) {
    /* ignore */
  }

  const verificationCheck = goOnline;
  const activationSteps = getProviderActivationSteps(
    provider,
    verificationCheck,
    contractSummary,
    store
  );
  for (const step of activationSteps) {
    if (step.done || step.optional) continue;
    if (step.id === 'verify' && !step.done) missing.push('Perfil / verificación básica');
    if (step.id === 'specialties' && !step.done) missing.push('Especialidades');
    if (step.id === 'coverage' && !step.done) missing.push('Cobertura técnica por servicio');
    if (step.id === 'online' && !step.done) missing.push('Nunca se puso en línea');
  }

  const uniqueMissing = [...new Set(missing)];

  let operationalStatus = 'incompleta';
  if (provider.active === false) {
    operationalStatus = 'pausada';
  } else if (
    contractSummary.canOperate
    && enabled.length > 0
    && withoutTech.length === 0
    && goOnline.ok
  ) {
    operationalStatus = 'operativa';
  } else if (enabled.length > 0 || (Array.isArray(provider.specialties) && provider.specialties.length)) {
    operationalStatus = 'casi_lista';
  }

  const legalName = provider.providerContract?.legalEntity?.legalName
    || provider.providerContract?.legalEntity?.name
    || null;

  return {
    id: provider.id,
    name: provider.name || 'Sin nombre',
    legalName,
    email: provider.email || '',
    phone: provider.phone || '',
    active: provider.active !== false,
    online: Boolean(provider.online),
    operationalStatus,
    operationalLabel: STATUS_LABELS[operationalStatus] || operationalStatus,
    contractStatus: contractSummary.status,
    contractLabel: contractSummary.label,
    contractCanOperate: contractSummary.canOperate,
    servicesCount: enabled.length,
    coveredCount: enabled.filter((s) => s.covered).length,
    withoutTech: withoutTech.map((s) => ({ id: s.id, name: s.name || serviceById.get(s.id)?.name || s.id })),
    missing: uniqueMissing,
    payoutNote,
    memberSince: provider.memberSince || null
  };
}

function buildTechnicianStats(store, serviceById) {
  const users = store.USERS || [];
  const byId = {};
  for (const svc of store.SERVICES || []) {
    byId[svc.id] = {
      id: svc.id,
      name: svc.name || svc.id,
      enabled: svc.enabled !== false,
      activeTechnicians: 0,
      onlineTechnicians: 0
    };
  }

  let totalTechnicians = 0;
  let activeOperational = 0;
  let onlineOperational = 0;
  let pendingDocs = 0;

  for (const t of users) {
    if (t.role !== 'tecnico') continue;
    totalTechnicians += 1;
    const check = store.canTechnicianOperate(t);
    if (!check.ok) {
      pendingDocs += 1;
      continue;
    }
    if (t.active === false) continue;
    activeOperational += 1;
    if (t.online) onlineOperational += 1;
    const specs = Array.isArray(t.specialties) ? t.specialties : [];
    for (const sid of specs) {
      if (!byId[sid]) {
        byId[sid] = {
          id: sid,
          name: serviceById.get(sid)?.name || sid,
          enabled: true,
          activeTechnicians: 0,
          onlineTechnicians: 0
        };
      }
      byId[sid].activeTechnicians += 1;
      if (t.online) byId[sid].onlineTechnicians += 1;
    }
  }

  const bySpecialty = Object.values(byId)
    .filter((row) => row.activeTechnicians > 0 || row.enabled)
    .sort((a, b) => {
      if (b.activeTechnicians !== a.activeTechnicians) return b.activeTechnicians - a.activeTechnicians;
      return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
    });

  return {
    totals: {
      totalTechnicians,
      activeOperational,
      onlineOperational,
      pendingDocs
    },
    bySpecialty
  };
}

const ROLE_GROUPS = {
  client: 'clients',
  provider: 'providers',
  tecnico: 'technicians'
};

function parseLogDetail(detail) {
  if (!detail) return null;
  try {
    return JSON.parse(detail);
  } catch (_) {
    return null;
  }
}

function userJoinTimestamp(user) {
  if (user?.createdAt) {
    const t = Date.parse(user.createdAt);
    if (Number.isFinite(t)) return t;
  }
  if (user?.memberSince) {
    const t = Date.parse(`${user.memberSince}T12:00:00.000Z`);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function formatMovementUser(user, atIso, extra = {}) {
  return {
    id: user.id,
    name: user.name || 'Sin nombre',
    email: user.email || '',
    role: user.role,
    at: atIso,
    active: user.active !== false,
    ...extra
  };
}

function indexRegistrationLogs(store, sinceTs) {
  const byEmail = new Map();
  for (const log of store.securityLogs || []) {
    if (log.event !== 'registro_ok' && log.event !== 'technician_invite_activated') continue;
    const at = Date.parse(log.createdAt || '');
    if (!Number.isFinite(at) || at < sinceTs) continue;
    const email = String(log.detail || '').trim().toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev || at > prev.at) byEmail.set(email, { at, event: log.event });
  }
  return byEmail;
}

function indexDepartureLogs(store, sinceTs) {
  const byUserId = new Map();
  for (const log of store.securityLogs || []) {
    if (log.event !== 'dsar_anonymize' && log.event !== 'cuenta_desactivada') continue;
    const at = Date.parse(log.createdAt || '');
    if (!Number.isFinite(at) || at < sinceTs) continue;
    const payload = parseLogDetail(log.detail);
    const userId = payload?.userId;
    if (!userId) continue;
    const reason = log.event === 'dsar_anonymize'
      ? 'Anonimizado (DSAR)'
      : 'Cuenta desactivada';
    const prev = byUserId.get(userId);
    if (!prev || at > prev.at) {
      byUserId.set(userId, {
        at,
        reason,
        email: payload.email || null,
        name: payload.name || null
      });
    }
  }
  return byUserId;
}

function getAdminUserMovements(store, { days = 30, limit = 40 } = {}) {
  const periodDays = Math.min(365, Math.max(1, Number(days) || 30));
  const sinceTs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const lim = Math.min(100, Math.max(5, Number(limit) || 40));
  const regLogs = indexRegistrationLogs(store, sinceTs);
  const depLogs = indexDepartureLogs(store, sinceTs);

  const entrants = { clients: [], providers: [], technicians: [] };
  const leavers = { clients: [], providers: [], technicians: [] };
  const summary = {
    clients: { in: 0, out: 0 },
    providers: { in: 0, out: 0 },
    technicians: { in: 0, out: 0 }
  };

  for (const user of store.USERS || []) {
    const bucket = ROLE_GROUPS[user.role];
    if (!bucket) continue;
    if (String(user.email || '').includes('@anonymized.local') && user.role !== 'admin') {
      // handled in leavers
    }

    let joinAt = userJoinTimestamp(user);
    const reg = regLogs.get(String(user.email || '').trim().toLowerCase());
    if (reg && reg.at > joinAt) joinAt = reg.at;
    if (joinAt >= sinceTs && !String(user.email || '').includes('@anonymized.local')) {
      entrants[bucket].push(formatMovementUser(user, new Date(joinAt).toISOString(), {
        source: reg?.event === 'technician_invite_activated' ? 'invitación técnico' : 'registro'
      }));
    }

    let leaveAt = null;
    let reason = null;
    const dep = depLogs.get(user.id);
    if (dep) {
      leaveAt = dep.at;
      reason = dep.reason;
    } else if (user.anonymizedAt) {
      leaveAt = Date.parse(user.anonymizedAt);
      reason = 'Anonimizado (DSAR)';
    } else if (user.deactivatedAt) {
      leaveAt = Date.parse(user.deactivatedAt);
      reason = 'Cuenta desactivada';
    } else if (user.active === false) {
      const upd = user.updatedAt ? Date.parse(user.updatedAt) : 0;
      if (upd >= sinceTs && upd > joinAt) {
        leaveAt = upd;
        reason = 'Cuenta inactiva';
      }
    } else if (String(user.email || '').includes('@anonymized.local')) {
      leaveAt = user.updatedAt ? Date.parse(user.updatedAt) : joinAt;
      reason = 'Anonimizado';
    }

    if (leaveAt && Number.isFinite(leaveAt) && leaveAt >= sinceTs) {
      leavers[bucket].push(formatMovementUser(user, new Date(leaveAt).toISOString(), {
        reason: reason || 'Salida',
        previousEmail: dep?.email || (String(user.email || '').includes('@anonymized.local') ? null : user.email)
      }));
    }
  }

  for (const key of ['clients', 'providers', 'technicians']) {
    entrants[key].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    leavers[key].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    summary[key].in = entrants[key].length;
    summary[key].out = leavers[key].length;
    entrants[key] = entrants[key].slice(0, lim);
    leavers[key] = leavers[key].slice(0, lim);
  }

  return {
    periodDays,
    since: new Date(sinceTs).toISOString(),
    summary,
    entrants,
    leavers
  };
}

function getAdminEcosystemOverview(store, options = {}) {
  const serviceById = new Map((store.SERVICES || []).map((s) => [s.id, s]));
  const providers = (store.USERS || []).filter((u) => u.role === 'provider');
  const companies = providers
    .map((p) => assessProvider(store, p, serviceById))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }));

  const summary = {
    totalProviders: companies.length,
    operativa: 0,
    casi_lista: 0,
    incompleta: 0,
    pausada: 0
  };
  for (const c of companies) {
    if (summary[c.operationalStatus] != null) summary[c.operationalStatus] += 1;
  }

  const technicians = buildTechnicianStats(store, serviceById);
  const movements = getAdminUserMovements(store, {
    days: options.days,
    limit: options.movementsLimit
  });

  return {
    summary,
    companies,
    technicians,
    movements,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  getAdminEcosystemOverview,
  getAdminUserMovements,
  STATUS_LABELS
};
