/**
 * Clara — CFO copiloto (decision pack semanal).
 * No ejecuta transferencias: prepara ASK al founder.
 */

'use strict';

const { notifyFounderAsk, getAutonomyThresholds } = require('../founderGates');

const CLARA_PERSONA = `Eres Clara, CFO operativa de Fandez (Chile).
Prudente, concreta, cifras en CLP. Nunca ejecutas transferencias ni apruebas pagos sola.
Tu trabajo: preparar un decision pack semanal para el founder.
Bandas: DO (informar métricas) · ASK (ítems que requieren sí/no) · NEVER (mover plata sin OK).`;

function formatCLP(n) {
  return `$${Math.max(0, parseInt(n, 10) || 0).toLocaleString('es-CL')}`;
}

/**
 * Extiende el informe semanal con decisions[] y narrative ASK.
 */
function attachDecisionPack(financeReport, store, { appUrl = 'https://www.fandez.cl' } = {}) {
  const decisions = [];
  const thresholds = getAutonomyThresholds(
    typeof store.getPricingConfig === 'function' ? store.getPricingConfig() : null
  );

  (financeReport.payroll || []).forEach((p) => {
    if ((p.pending || 0) < thresholds.payoutAskMinClp) return;
    decisions.push({
      id: `payout-${p.providerId || p.name}`,
      band: 'ASK',
      agent: 'Clara',
      title: `Payout socio · ${p.name || p.providerId}`,
      amount: p.pending || 0,
      recommendation: 'Revisar liquidación y marcar pagado en admin si ya transferiste.',
      impact: 'Socio espera cobro; demora afecta confianza.',
      needFromYou: 'Marcar pagado · Diferir · Revisar monto',
      link: `${appUrl.replace(/\/$/, '')}/admin#pagos`,
      meta: { providerId: p.providerId, jobs: p.jobs }
    });
  });

  (financeReport.paymentIssues || []).forEach((issue) => {
    const isRefund = issue.type === 'refund';
    decisions.push({
      id: `${issue.type}-${issue.id}`,
      band: 'ASK',
      agent: 'Clara',
      title: issue.label,
      amount: null,
      recommendation: isRefund
        ? 'Procesar o rechazar devolución en admin → Devoluciones.'
        : 'Confirmar transferencia del cliente o contactar.',
      impact: issue.detail,
      needFromYou: isRefund ? 'Pagar reembolso · Rechazar · Diferir' : 'Confirmar pago · Anular · Diferir',
      link: `${appUrl.replace(/\/$/, '')}/admin#${isRefund ? 'pagos' : 'pagos'}`,
      meta: { requestId: issue.id, type: issue.type }
    });
  });

  // Boletas pendientes founder en pedidos activos
  try {
    const requests = store.getAllRequests?.() || [];
    requests.forEach((r) => {
      const mats = r.siteReport?.materials || [];
      mats.filter((m) => m.reviewStatus === 'pending_founder' || m.reviewStatus === 'pending_manual').forEach((m) => {
        decisions.push({
          id: `mat-${r.id}-${m.id}`,
          band: 'ASK',
          agent: 'Clara',
          title: `Boleta materiales · ${r.serviceName || r.id}`,
          amount: m.amount || 0,
          recommendation: m.reviewReason || 'Revisar boleta y aprobar/rechazar.',
          impact: 'Sin OK no se cierra la visita ni se cobra el ítem.',
          needFromYou: 'Aprobar boleta · Rechazar · Pedir nueva foto',
          link: `${appUrl.replace(/\/$/, '')}/admin#solicitudes`,
          meta: { requestId: r.id, materialId: m.id, status: m.reviewStatus }
        });
      });
    });
  } catch (_) { /* ignore */ }

  const askLines = decisions.slice(0, 8).map((d, i) =>
    `${i + 1}. [${d.band}] ${d.title}${d.amount != null ? ` · ${formatCLP(d.amount)}` : ''}\n   → ${d.needFromYou}`
  );

  const decisionNarrative = [
    '',
    '——— Decision pack (ASK founder) ———',
    decisions.length
      ? askLines.join('\n')
      : 'Sin decisiones ASK esta semana. Solo seguimiento rutinario.',
    '',
    CLARA_PERSONA.split('\n')[0]
  ].join('\n');

  return {
    ...financeReport,
    decisions,
    decisionCount: decisions.length,
    narrative: `${financeReport.narrative || ''}\n${decisionNarrative}`,
    claraPersona: CLARA_PERSONA
  };
}

async function notifyFounderDecisionPack(financeReport) {
  const top = (financeReport.decisions || []).slice(0, 5);
  if (!top.length) {
    return { skipped: true, reason: 'no_decisions' };
  }
  return notifyFounderAsk({
    agent: 'Clara',
    whatHappened: `${financeReport.decisionCount || top.length} decisión(es) de dinero esta semana`,
    recommendation: top.map((d) => `${d.title}${d.amount != null ? ` (${formatCLP(d.amount)})` : ''}`).join(' · '),
    impact: 'Sin tu OK no se pagan socios ni se cierran reembolsos/boletas críticas.',
    needFromYou: 'Abrir Informes → Clara y resolver cada ASK',
    link: top[0]?.link || ''
  });
}

module.exports = {
  CLARA_PERSONA,
  attachDecisionPack,
  notifyFounderDecisionPack,
  formatCLP
};
