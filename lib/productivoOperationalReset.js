/**
 * Limpieza operativa al go-live Productivo 2.0:
 * cero solicitudes, pagos pendientes e historial de servicios.
 * Conserva usuarios client/provider/tecnico/admin y catálogo/config.
 */
const db = require('./db');

const GO_LIVE_CONFIRM = 'PRODUCTIVO_CERO';

function isValidGoLiveConfirm(value) {
  return String(value || '').trim() === GO_LIVE_CONFIRM;
}

async function purgeOperationalTransactions() {
  if (!db.isConfigured()) {
    throw new Error('Base de datos no configurada');
  }

  const count = async (sql) => {
    const res = await db.query(sql);
    const row = res.rows?.[0];
    return Number(row?.c ?? row?.C ?? 0) || 0;
  };

  const before = {
    requests: await count('SELECT COUNT(*) AS c FROM service_requests'),
    logbook: await count('SELECT COUNT(*) AS c FROM home_logbook'),
    complaints: await count('SELECT COUNT(*) AS c FROM complaints'),
    notifications: await count('SELECT COUNT(*) AS c FROM notifications')
  };

  await db.query('DELETE FROM aland_conversations').catch(() => {});
  await db.query('DELETE FROM notifications').catch(() => {});
  await db.query('DELETE FROM complaints').catch(() => {});
  await db.query('DELETE FROM home_logbook').catch(() => {});
  await db.query('DELETE FROM service_requests');
  await db.query('DELETE FROM chats').catch(() => {});
  await db.query('DELETE FROM service_briefs').catch(() => {});

  await db.query(
    `UPDATE users SET services_count = 0, zilo_points = 0, credits_clp = 0, online = 0
     WHERE role IN ('client', 'provider')`
  );
  await db.query(
    `UPDATE users SET rating = NULL, reviews_count = 0, reviews = NULL WHERE role = 'provider'`
  );

  return {
    requestsRemoved: before.requests,
    logbookRemoved: before.logbook,
    complaintsRemoved: before.complaints,
    notificationsRemoved: before.notifications,
    usersOperationalReset: true,
    at: new Date().toISOString()
  };
}

async function runProductivoOperationalReset(store) {
  if (!store?.reloadFromDatabase) {
    throw new Error('Store no disponible para recargar datos');
  }
  const stats = await purgeOperationalTransactions();
  await store.reloadFromDatabase();
  return stats;
}

module.exports = {
  GO_LIVE_CONFIRM,
  isValidGoLiveConfirm,
  purgeOperationalTransactions,
  runProductivoOperationalReset
};
