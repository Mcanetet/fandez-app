const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const sofiaPrompts = require('./sofiaPrompts');

const DEFAULT_CONFIG = {
  agentName: 'Sofía',
  enabled: true,
  openaiModel: 'gpt-4o-mini',
  providerTimeoutMinutes: 5,
  promptVersion: sofiaPrompts.PROMPT_VERSION,
  personality: sofiaPrompts.PERSONALITY,
  systemInstructions: sofiaPrompts.SYSTEM_INSTRUCTIONS,
  greetingMessage: sofiaPrompts.GREETING,
  supportGreeting: sofiaPrompts.SUPPORT_GREETING,
  allowedTopics: sofiaPrompts.ALLOWED_TOPICS,
  blockedTopics: sofiaPrompts.BLOCKED_TOPICS,
  escalateKeywords: sofiaPrompts.ESCALATE_KEYWORDS,
  customRules: sofiaPrompts.CUSTOM_RULES
};

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG, allowedTopics: [...DEFAULT_CONFIG.allowedTopics], blockedTopics: [...DEFAULT_CONFIG.blockedTopics], escalateKeywords: [...DEFAULT_CONFIG.escalateKeywords], customRules: [...DEFAULT_CONFIG.customRules] };
  const data = parseJson(row.config, {});
  const merged = {
    ...DEFAULT_CONFIG,
    ...data,
    allowedTopics: Array.isArray(data.allowedTopics) ? data.allowedTopics : [...DEFAULT_CONFIG.allowedTopics],
    blockedTopics: Array.isArray(data.blockedTopics) ? data.blockedTopics : [...DEFAULT_CONFIG.blockedTopics],
    escalateKeywords: Array.isArray(data.escalateKeywords) ? data.escalateKeywords : [...DEFAULT_CONFIG.escalateKeywords],
    customRules: Array.isArray(data.customRules) ? data.customRules : [...DEFAULT_CONFIG.customRules]
  };

  const storedVersion = Number(data.promptVersion || 0);
  const shouldUpgradePrompts = storedVersion < sofiaPrompts.PROMPT_VERSION && !data.lockPrompts;
  if (shouldUpgradePrompts) {
    merged.personality = DEFAULT_CONFIG.personality;
    merged.systemInstructions = DEFAULT_CONFIG.systemInstructions;
    merged.greetingMessage = DEFAULT_CONFIG.greetingMessage;
    merged.supportGreeting = DEFAULT_CONFIG.supportGreeting;
    merged.allowedTopics = [...DEFAULT_CONFIG.allowedTopics];
    merged.blockedTopics = [...DEFAULT_CONFIG.blockedTopics];
    merged.escalateKeywords = [...DEFAULT_CONFIG.escalateKeywords];
    merged.customRules = [...DEFAULT_CONFIG.customRules];
    merged.promptVersion = sofiaPrompts.PROMPT_VERSION;
  }

  // Migraciones de naming legacy (Aland → Sofía)
  const legacyPersonality = 'Eres Aland IA, agente senior de soporte de Fandez.';
  const legacyPersonalityOld = 'Eres Aland IA, asistente de Fandez. Hablas en español chileno, cercano, respetuoso y profesional.';
  if (String(merged.personality || '').startsWith(legacyPersonalityOld) || String(merged.personality || '').startsWith(legacyPersonality)) {
    merged.personality = DEFAULT_CONFIG.personality;
  }
  if (merged.agentName === 'Aland IA' || merged.agentName === 'Aland') {
    merged.agentName = DEFAULT_CONFIG.agentName;
  }
  if (String(merged.greetingMessage || '').includes('Aland') || String(merged.greetingMessage || '').includes('Estoy aquí para ayudarte con {service}')) {
    merged.greetingMessage = DEFAULT_CONFIG.greetingMessage;
  }
  if (String(merged.supportGreeting || '').includes('Aland')) {
    merged.supportGreeting = DEFAULT_CONFIG.supportGreeting;
  }
  if (!merged.supportGreeting) merged.supportGreeting = DEFAULT_CONFIG.supportGreeting;
  if (!merged.promptVersion) merged.promptVersion = sofiaPrompts.PROMPT_VERSION;
  return merged;
}

function rowToKnowledge(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    serviceId: row.service_id,
    title: row.title,
    content: row.content,
    active: Boolean(row.active),
    sortOrder: row.sort_order || 0,
    updatedAt: row.updated_at
  };
}

function rowToConversation(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    clientId: row.client_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    providerId: row.provider_id,
    providerName: row.provider_name,
    status: row.status,
    tokensPrompt: Number(row.tokens_prompt) || 0,
    tokensCompletion: Number(row.tokens_completion) || 0,
    tokensTotal: Number(row.tokens_total) || 0,
    injectionCount: Number(row.injection_count) || 0,
    lastInjectionAt: row.last_injection_at ? new Date(row.last_injection_at).toISOString() : null,
    escalatedAt: row.escalated_at ? new Date(row.escalated_at).toISOString() : null,
    providerNotifiedAt: row.provider_notified_at ? new Date(row.provider_notified_at).toISOString() : null,
    adminEscalatedAt: row.admin_escalated_at ? new Date(row.admin_escalated_at).toISOString() : null,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    meta: parseJson(row.meta, {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function getConfig() {
  if (!db.isConfigured()) return { ...DEFAULT_CONFIG };
  const res = await db.query('SELECT config FROM aland_config WHERE id = ? LIMIT 1', ['default']).catch(() => ({ rows: [] }));
  if (!res.rows.length) return { ...DEFAULT_CONFIG };
  return rowToConfig(res.rows[0]);
}

async function saveConfig(config) {
  if (!db.isConfigured()) throw new Error('MySQL no configurado');
  const merged = { ...DEFAULT_CONFIG, ...config };
  await db.query(
    `INSERT INTO aland_config (id, config) VALUES ('default', ?)
     ON DUPLICATE KEY UPDATE config = VALUES(config)`,
    [JSON.stringify(merged)]
  );
  return merged;
}

async function ensureConfig() {
  if (!db.isConfigured()) return;
  const existing = await db.query('SELECT config FROM aland_config WHERE id = ?', ['default']).catch(() => ({ rows: [] }));
  if (!existing.rows.length) {
    await saveConfig(DEFAULT_CONFIG);
    return;
  }
  const raw = parseJson(existing.rows[0].config, {});
  const current = rowToConfig(existing.rows[0]);
  const needsUpgrade =
    Number(raw.promptVersion || 0) < sofiaPrompts.PROMPT_VERSION
    || current.agentName === 'Aland IA'
    || current.agentName === 'Aland'
    || String(current.personality || '').includes('Aland IA')
    || String(current.greetingMessage || '').includes('Aland')
    || String(current.supportGreeting || '').includes('Aland');
  if (needsUpgrade && !raw.lockPrompts) {
    await saveConfig({
      ...current,
      personality: DEFAULT_CONFIG.personality,
      systemInstructions: DEFAULT_CONFIG.systemInstructions,
      greetingMessage: DEFAULT_CONFIG.greetingMessage,
      supportGreeting: DEFAULT_CONFIG.supportGreeting,
      allowedTopics: [...DEFAULT_CONFIG.allowedTopics],
      blockedTopics: [...DEFAULT_CONFIG.blockedTopics],
      escalateKeywords: [...DEFAULT_CONFIG.escalateKeywords],
      customRules: [...DEFAULT_CONFIG.customRules],
      promptVersion: sofiaPrompts.PROMPT_VERSION
    });
  }
}

async function listKnowledge({ activeOnly = false } = {}) {
  if (!db.isConfigured()) return [];
  let sql = 'SELECT * FROM aland_knowledge';
  if (activeOnly) sql += ' WHERE active = 1';
  sql += ' ORDER BY sort_order ASC, title ASC';
  const res = await db.query(sql).catch(() => ({ rows: [] }));
  return res.rows.map(rowToKnowledge);
}

async function saveKnowledge(entry) {
  if (!db.isConfigured()) throw new Error('MySQL no configurado');
  const id = entry.id || uuidv4();
  let title = String(entry.title || '').trim() || 'Sin título';
  let content = String(entry.content || '').trim();
  if (!content) throw new Error('El contenido es obligatorio');

  // Si pegan un link público de Fandez, leer la página (nunca admin) y guardar el texto
  try {
    const publicWeb = require('./publicWeb');
    const urls = publicWeb.extractUrls(`${title}\n${content}`);
    if (urls.length) {
      const page = await publicWeb.fetchPublicPage(urls[0], { maxChars: 5000 });
      if (page.ok && page.text) {
        content = `${content}\n\n--- Contenido público leído de ${page.url} ---\n${page.text}`;
      } else if (page.error) {
        content = `${content}\n\n(Nota: no se pudo leer la URL pública: ${page.error})`;
      }
    } else if (/admin|\/ops-/i.test(content)) {
      throw new Error('No se permite agregar rutas de administración. Solo páginas públicas (ej. https://www.fandez.cl).');
    }
  } catch (err) {
    if (err.message && err.message.includes('administración')) throw err;
  }

  await db.query(
    `INSERT INTO aland_knowledge (id, source_type, service_id, title, content, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source_type = VALUES(source_type),
       service_id = VALUES(service_id),
       title = VALUES(title),
       content = VALUES(content),
       active = VALUES(active),
       sort_order = VALUES(sort_order)`,
    [
      id,
      entry.sourceType || 'custom',
      entry.serviceId || null,
      title,
      content,
      entry.active !== false ? 1 : 0,
      entry.sortOrder || 0
    ]
  );
  return id;
}

async function deleteKnowledge(id) {
  if (!db.isConfigured()) return false;
  await db.query('DELETE FROM aland_knowledge WHERE id = ?', [id]);
  return true;
}

async function createConversation({ serviceId, serviceName, clientId, clientName, clientEmail }) {
  if (!db.isConfigured()) throw new Error('MySQL no configurado');
  const id = uuidv4();
  const now = new Date();
  await db.query(
    `INSERT INTO aland_conversations (id, service_id, service_name, client_id, client_name, client_email, status, last_message_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ai_active', ?, ?)`,
    [id, serviceId, serviceName, clientId || null, clientName, clientEmail || null, now, now]
  );
  return getConversationById(id);
}

async function getConversationById(id) {
  if (!db.isConfigured()) return null;
  const res = await db.query('SELECT * FROM aland_conversations WHERE id = ? LIMIT 1', [id]);
  if (!res.rows.length) return null;
  return rowToConversation(res.rows[0]);
}

async function listConversations({ status, providerId, clientId, limit = 100 } = {}) {
  if (!db.isConfigured()) return [];
  const clauses = [];
  const params = [];
  if (status) {
    if (Array.isArray(status)) {
      clauses.push(`status IN (${status.map(() => '?').join(',')})`);
      params.push(...status);
    } else {
      clauses.push('status = ?');
      params.push(status);
    }
  }
  if (providerId) {
    clauses.push('provider_id = ?');
    params.push(providerId);
  }
  if (clientId) {
    clauses.push('client_id = ?');
    params.push(clientId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT * FROM aland_conversations ${where} ORDER BY last_message_at DESC LIMIT ?`,
    [...params, Math.min(limit, 500)]
  );
  return res.rows.map(rowToConversation);
}

async function updateConversation(id, updates) {
  if (!db.isConfigured()) return null;
  const fields = [];
  const params = [];
  const map = {
    providerId: 'provider_id',
    providerName: 'provider_name',
    status: 'status',
    escalatedAt: 'escalated_at',
    providerNotifiedAt: 'provider_notified_at',
    adminEscalatedAt: 'admin_escalated_at',
    lastMessageAt: 'last_message_at',
    tokensPrompt: 'tokens_prompt',
    tokensCompletion: 'tokens_completion',
    tokensTotal: 'tokens_total',
    injectionCount: 'injection_count',
    lastInjectionAt: 'last_injection_at'
  };
  for (const [key, col] of Object.entries(map)) {
    if (updates[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(updates[key]);
    }
  }
  if (!fields.length) return getConversationById(id);
  params.push(id);
  await db.query(`UPDATE aland_conversations SET ${fields.join(', ')} WHERE id = ?`, params);
  return getConversationById(id);
}

async function addMessage({ conversationId, senderType, senderId, senderName, body, meta = {} }) {
  if (!db.isConfigured()) throw new Error('MySQL no configurado');
  const id = uuidv4();
  const now = new Date();
  await db.query(
    `INSERT INTO aland_messages (id, conversation_id, sender_type, sender_id, sender_name, body, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, senderType, senderId || null, senderName || null, body, JSON.stringify(meta), now]
  );
  await db.query('UPDATE aland_conversations SET last_message_at = ? WHERE id = ?', [now, conversationId]);
  return rowToMessage({
    id,
    conversation_id: conversationId,
    sender_type: senderType,
    sender_id: senderId,
    sender_name: senderName,
    body,
    meta: JSON.stringify(meta),
    created_at: now
  });
}

async function listMessages(conversationId, limit = 200) {
  if (!db.isConfigured()) return [];
  const res = await db.query(
    'SELECT * FROM aland_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?',
    [conversationId, Math.min(limit, 500)]
  );
  return res.rows.map(rowToMessage);
}

async function countProviderRepliesSince(conversationId, sinceDate) {
  if (!db.isConfigured()) return 0;
  const res = await db.query(
    `SELECT COUNT(*) AS c FROM aland_messages
     WHERE conversation_id = ? AND sender_type = 'provider' AND created_at > ?`,
    [conversationId, sinceDate]
  );
  return res.rows[0]?.c || 0;
}

async function findStaleProviderConversations(timeoutMinutes) {
  if (!db.isConfigured()) return [];
  const res = await db.query(
    `SELECT * FROM aland_conversations
     WHERE status = 'awaiting_provider'
       AND provider_notified_at IS NOT NULL
       AND provider_notified_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [timeoutMinutes]
  );
  return res.rows.map(rowToConversation);
}

async function addTokenUsage(conversationId, usage = {}) {
  if (!db.isConfigured() || !conversationId) return null;
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || (prompt + completion);
  if (!total && !prompt && !completion) return getConversationById(conversationId);
  await db.query(
    `UPDATE aland_conversations
     SET tokens_prompt = COALESCE(tokens_prompt, 0) + ?,
         tokens_completion = COALESCE(tokens_completion, 0) + ?,
         tokens_total = COALESCE(tokens_total, 0) + ?
     WHERE id = ?`,
    [prompt, completion, total, conversationId]
  ).catch(() => {});
  return getConversationById(conversationId);
}

async function markInjection(conversationId) {
  if (!db.isConfigured() || !conversationId) return null;
  const now = new Date();
  await db.query(
    `UPDATE aland_conversations
     SET injection_count = COALESCE(injection_count, 0) + 1,
         last_injection_at = ?
     WHERE id = ?`,
    [now, conversationId]
  ).catch(() => {});
  return getConversationById(conversationId);
}

async function getMonitorStats() {
  if (!db.isConfigured()) {
    return {
      conversations: 0,
      active: 0,
      tokensTotal: 0,
      tokensToday: 0,
      tokensPrompt: 0,
      tokensCompletion: 0,
      injections: 0,
      injectionsToday: 0
    };
  }
  const [totals, todayInj, todayTok] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) AS conversations,
         SUM(CASE WHEN status <> 'closed' THEN 1 ELSE 0 END) AS active,
         COALESCE(SUM(tokens_prompt), 0) AS tokens_prompt,
         COALESCE(SUM(tokens_completion), 0) AS tokens_completion,
         COALESCE(SUM(tokens_total), 0) AS tokens_total,
         COALESCE(SUM(injection_count), 0) AS injections
       FROM aland_conversations`
    ).catch(() => ({ rows: [{}] })),
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN DATE(last_injection_at) = CURDATE() THEN injection_count ELSE 0 END), 0) AS injections_today
       FROM aland_conversations`
    ).catch(() => ({ rows: [{}] })),
    db.query(
      `SELECT COALESCE(SUM(
         CAST(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.usage.total_tokens')) AS UNSIGNED)
       ), 0) AS tokens_today
       FROM aland_messages
       WHERE sender_type = 'aland'
         AND DATE(created_at) = CURDATE()
         AND JSON_EXTRACT(meta, '$.usage.total_tokens') IS NOT NULL`
    ).catch(() => ({ rows: [{ tokens_today: 0 }] }))
  ]);
  const t = totals.rows[0] || {};
  const inj = todayInj.rows[0] || {};
  const tok = todayTok.rows[0] || {};
  return {
    conversations: Number(t.conversations) || 0,
    active: Number(t.active) || 0,
    tokensPrompt: Number(t.tokens_prompt) || 0,
    tokensCompletion: Number(t.tokens_completion) || 0,
    tokensTotal: Number(t.tokens_total) || 0,
    tokensToday: Number(tok.tokens_today) || 0,
    injections: Number(t.injections) || 0,
    injectionsToday: Number(inj.injections_today) || 0
  };
}

async function listInjectionAlerts({ limit = 50 } = {}) {
  if (!db.isConfigured()) return [];
  const res = await db.query(
    `SELECT m.*, c.client_name, c.client_email, c.service_name, c.status AS conv_status
     FROM aland_messages m
     INNER JOIN aland_conversations c ON c.id = m.conversation_id
     WHERE JSON_EXTRACT(m.meta, '$.securityAlert') = true
        OR JSON_EXTRACT(m.meta, '$.risk') = 'injection'
        OR JSON_UNQUOTE(JSON_EXTRACT(m.meta, '$.type')) = 'prompt_injection'
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [Math.min(limit, 200)]
  ).catch(() => ({ rows: [] }));

  return res.rows.map((row) => ({
    ...rowToMessage(row),
    clientName: row.client_name,
    clientEmail: row.client_email,
    serviceName: row.service_name,
    conversationStatus: row.conv_status
  }));
}

module.exports = {
  DEFAULT_CONFIG,
  getConfig,
  saveConfig,
  ensureConfig,
  listKnowledge,
  saveKnowledge,
  deleteKnowledge,
  createConversation,
  getConversationById,
  listConversations,
  updateConversation,
  addMessage,
  listMessages,
  countProviderRepliesSince,
  findStaleProviderConversations,
  addTokenUsage,
  markInjection,
  getMonitorStats,
  listInjectionAlerts
};
