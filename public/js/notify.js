window.FandezNotify = {
  container: null,
  DURATION: {
    info: 3800,
    success: 3600,
    warning: 4500,
    error: 5200
  },
  KICKER: {
    success: 'Listo',
    info: 'Fandez',
    warning: 'Atención',
    error: 'Algo falló'
  },
  // Íconos propios (no check genérico de Material)
  ICONS: {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13.5 9.5 18 19 7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4c-2.8 2.4-7 3.2-7 7.4 0 3.3 2.6 6.1 7 8.6 4.4-2.5 7-5.3 7-8.6C19 7.2 14.8 6.4 12 4z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M11 3.6 2.2 18.2A1.6 1.6 0 0 0 3.6 20.5h16.8a1.6 1.6 0 0 0 1.4-2.3L12.9 3.6a1.1 1.1 0 0 0-1.9 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7l10 10"/><path d="M17 7 7 17"/></svg>'
  },

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(this.container);
    }
  },

  /**
   * show(message, type)
   * show({ title, body, type, kicker })
   */
  show(messageOrOpts, type = 'info') {
    this.init();
    let title = '';
    let body = '';
    let kind = type;
    let kicker = '';

    if (messageOrOpts && typeof messageOrOpts === 'object') {
      title = String(messageOrOpts.title || '').trim();
      body = String(messageOrOpts.body || messageOrOpts.message || '').trim();
      kind = messageOrOpts.type || type || 'info';
      kicker = String(messageOrOpts.kicker || '').trim();
    } else {
      body = String(messageOrOpts || '').trim();
    }

    kind = ['success', 'info', 'warning', 'error'].includes(kind) ? kind : 'info';
    if (!kicker) kicker = this.KICKER[kind] || 'Fandez';

    // Una sola línea: usarla como título tipográfico
    if (!title && body) {
      title = body;
      body = '';
    }

    // Evitar dos toasts idénticos apilados
    const fingerprint = `${kind}|${kicker}|${title}|${body}`;
    const existing = [...this.container.querySelectorAll('.toast')];
    if (existing.some((el) => el.dataset.fp === fingerprint)) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.dataset.fp = fingerprint;
    toast.setAttribute('role', kind === 'error' || kind === 'warning' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = this.ICONS[kind];

    const copy = document.createElement('div');
    copy.className = 'toast-copy';

    const kickerEl = document.createElement('p');
    kickerEl.className = 'toast-kicker';
    kickerEl.textContent = kicker;

    const titleEl = document.createElement('p');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;

    const bodyEl = document.createElement('p');
    bodyEl.className = 'toast-body';
    bodyEl.textContent = body;

    copy.appendChild(kickerEl);
    copy.appendChild(titleEl);
    copy.appendChild(bodyEl);

    toast.appendChild(icon);
    toast.appendChild(copy);
    this.container.appendChild(toast);

    // Máximo 2 visibles: saca la más vieja
    while (this.container.querySelectorAll('.toast:not(.toast-leaving)').length > 2) {
      const oldest = this.container.querySelector('.toast:not(.toast-leaving)');
      if (!oldest) break;
      oldest.classList.add('toast-leaving');
      setTimeout(() => oldest.remove(), 280);
    }

    const ms = this.DURATION[kind] || 3800;
    const removeAt = setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 280);
    }, ms);

    toast.addEventListener('click', () => {
      clearTimeout(removeAt);
      toast.remove();
    }, { once: true });
  }
};

// ---------------------------------------------------------------------------
// FandezAlerts: motor central de alertas del dispositivo (sonido + vibración +
// notificación del sistema). Se carga en toda la app vía footer.ejs.
// Estándar de mercado para apps web sobre WebSockets: Web Audio API (sonido),
// navigator.vibrate (háptica en Android/Chrome), y Notification API (aviso del
// sistema cuando la pestaña está en segundo plano).
// ---------------------------------------------------------------------------
window.FandezAlerts = {
  _ctx: null,
  _unlocked: false,
  _lastKey: {},
  _primed: false,
  PREFS_KEY: 'fandez_alert_prefs',

  // Secuencias de tonos (Web Audio) por tipo de evento
  SOUNDS: {
    message: [{ f: 660, t: 0, d: 0.15 }, { f: 880, t: 0.13, d: 0.16 }],
    order:   [{ f: 880, t: 0, d: 0.12 }, { f: 1175, t: 0.12, d: 0.12 }, { f: 880, t: 0.24, d: 0.12 }, { f: 1319, t: 0.36, d: 0.2 }],
    payment: [{ f: 784, t: 0, d: 0.14 }, { f: 988, t: 0.14, d: 0.14 }, { f: 1319, t: 0.28, d: 0.24 }],
    alert:   [{ f: 1175, t: 0, d: 0.13 }, { f: 1175, t: 0.2, d: 0.13 }, { f: 1175, t: 0.4, d: 0.2 }],
    success: [{ f: 659, t: 0, d: 0.12 }, { f: 988, t: 0.13, d: 0.2 }],
    update:  [{ f: 587, t: 0, d: 0.12 }, { f: 784, t: 0.12, d: 0.15 }],
    default: [{ f: 740, t: 0, d: 0.14 }, { f: 988, t: 0.12, d: 0.16 }]
  },

  // Patrones de vibración (ms) por tipo de evento
  VIBRATE: {
    message: [45],
    order:   [90, 60, 90, 60, 140],
    payment: [70, 45, 70, 45, 120],
    alert:   [140, 90, 140],
    success: [35, 35, 35],
    update:  [50],
    default: [60]
  },

  TOAST_TYPE: {
    message: 'info',
    order: 'info',
    payment: 'success',
    alert: 'warning',
    success: 'success',
    update: 'info',
    default: 'info'
  },

  TOAST_KICKER: {
    message: 'Mensaje',
    order: 'Tu visita',
    payment: 'Pago',
    alert: 'Atención',
    success: 'Listo',
    update: 'Actualización',
    default: 'Fandez'
  },

  init() {
    if (this._primed) return;
    this._primed = true;
    // Desbloquea el AudioContext y activa permisos con el primer gesto del usuario
    const unlock = () => {
      this._ensureCtx();
      this._unlocked = true;
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
      window.addEventListener(ev, unlock, { passive: true });
    });
  },

  prefs() {
    let p = { sound: true, vibrate: true, system: true };
    try {
      const raw = localStorage.getItem(this.PREFS_KEY);
      if (raw) p = Object.assign(p, JSON.parse(raw));
    } catch (_) {}
    return p;
  },

  setPref(key, value) {
    const p = this.prefs();
    p[key] = value;
    try { localStorage.setItem(this.PREFS_KEY, JSON.stringify(p)); } catch (_) {}
    return p;
  },

  ensurePermission() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Promise.resolve(Notification.permission);
    }
    try {
      return Notification.requestPermission().catch(() => 'default');
    } catch (_) {
      return Promise.resolve('default');
    }
  },

  _ensureCtx() {
    try {
      if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume();
    } catch (_) {}
    return this._ctx;
  },

  playSound(type = 'default') {
    if (!this.prefs().sound) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    try {
      const seq = this.SOUNDS[type] || this.SOUNDS.default;
      const now = ctx.currentTime;
      seq.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n.f;
        gain.gain.setValueAtTime(0, now + n.t);
        gain.gain.linearRampToValueAtTime(0.3, now + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + n.t + n.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.03);
      });
    } catch (_) {}
  },

  vibrate(type = 'default') {
    if (!this.prefs().vibrate) return;
    if (!('vibrate' in navigator)) return;
    try { navigator.vibrate(this.VIBRATE[type] || this.VIBRATE.default); } catch (_) {}
  },

  system(title, body, opts = {}) {
    if (!this.prefs().system) return null;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    const { type = 'default', tag, requireInteraction = false, onClick, url } = opts;
    const icon = '/icons/fandez-v11-notify.png?v=13';
    const badge = '/icons/fandez-v11-badge-96.png?v=13';
    const payload = {
      title: title || 'Fandez',
      body: body || '',
      icon: (typeof location !== 'undefined' ? location.origin : '') + icon,
      badge: (typeof location !== 'undefined' ? location.origin : '') + badge,
      tag: tag || ('fandez-' + type),
      renotify: true,
      vibrate: this.VIBRATE[type] || this.VIBRATE.default,
      requireInteraction: !!requireInteraction,
      url: url || window.location.pathname || '/'
    };

    // Preferir Service Worker: sale en la barra del SO con ícono Fandez (del sistema)
    const viaSw = () => {
      if (!('serviceWorker' in navigator)) return Promise.resolve(false);
      return navigator.serviceWorker.ready.then((reg) => {
        if (!reg || typeof reg.showNotification !== 'function') return false;
        // Forzar update de SW para no usar ícono cacheado viejo
        try { reg.update(); } catch (_) { /* ignore */ }
        return reg.showNotification(payload.title, {
          body: payload.body,
          icon: payload.icon || ((typeof location !== 'undefined' ? location.origin : '') + '/icons/fandez-v11-notify.png?v=13'),
          badge: payload.badge || ((typeof location !== 'undefined' ? location.origin : '') + '/icons/fandez-v11-badge-96.png?v=13'),
          tag: payload.tag,
          renotify: true,
          requireInteraction: payload.requireInteraction,
          vibrate: payload.vibrate,
          data: { url: payload.url, tag: payload.tag }
        }).then(() => true);
      }).catch(() => false);
    };

    viaSw().then((ok) => {
      if (ok) return;
      try {
        const n = new Notification(payload.title, {
          body: payload.body,
          icon: payload.icon,
          badge: payload.badge,
          tag: payload.tag,
          renotify: true,
          vibrate: payload.vibrate,
          requireInteraction: payload.requireInteraction
        });
        n.onclick = () => {
          try { window.focus(); } catch (_) {}
          if (typeof onClick === 'function') { try { onClick(); } catch (_) {} }
          else if (url) { try { window.location.href = url; } catch (_) {} }
          n.close();
        };
      } catch (_) { /* ignore */ }
    });
    return true;
  },

  async enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' };
    }
    const permission = await this.ensurePermission();
    if (permission !== 'granted') return { ok: false, reason: permission };

    try {
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch('/push/vapid-public-key', { credentials: 'same-origin' });
      const keyData = await keyRes.json();
      if (!keyData.success || !keyData.publicKey) return { ok: false, reason: 'no-vapid' };

      const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
      };

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        });
      }

      const save = await fetch('/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
      const saved = await save.json();
      return { ok: !!saved.success, reason: saved.error || null };
    } catch (err) {
      return { ok: false, reason: err.message || 'subscribe-failed' };
    }
  },

  // Punto de entrada principal.
  // opts: { title, body, type, toast, system, tag, dedupeKey, requireInteraction, onClick, url, force }
  notify(opts = {}) {
    const {
      title = 'Fandez',
      body = '',
      type = 'default',
      tag,
      dedupeKey,
      requireInteraction,
      onClick,
      url,
      force
    } = opts;

    const key = dedupeKey || (type + '|' + title + '|' + body);
    const nowMs = Date.now();
    if (!force && this._lastKey[key] && nowMs - this._lastKey[key] < 2200) return;
    this._lastKey[key] = nowMs;

    // Historial local para /alertas (cliente, socio, técnico)
    try {
      const inboxKey = 'fandez_alert_inbox';
      const entry = {
        title: title || 'Fandez',
        body: body || '',
        type,
        url: url || null,
        at: new Date().toISOString()
      };
      const prev = JSON.parse(localStorage.getItem(inboxKey) || '[]');
      const next = Array.isArray(prev) ? prev : [];
      const fp = `${entry.type}|${entry.title}|${entry.body}`;
      if (!next.length || `${next[0].type}|${next[0].title}|${next[0].body}` !== fp) {
        next.unshift(entry);
        localStorage.setItem(inboxKey, JSON.stringify(next.slice(0, 40)));
      }
    } catch (_) { /* ignore */ }

    // Un solo toast elegante: título + cuerpo (evita apilar “¡Proveedor!” + el mismo aviso)
    if (opts.toast !== false && window.FandezNotify) {
      const toastType = typeof opts.toast === 'string' ? opts.toast : (this.TOAST_TYPE[type] || 'info');
      const kicker = opts.kicker || this.TOAST_KICKER[type] || 'Fandez';
      const toastTitle = title && title !== 'Fandez' ? title : (body || title);
      const toastBody = title && title !== 'Fandez' && body && body !== title ? body : '';
      FandezNotify.show({
        title: toastTitle,
        body: toastBody,
        type: toastType,
        kicker
      });
    }

    this.playSound(type);
    this.vibrate(type);

    // Pedidos / alertas: siempre notificación del sistema (barra + ícono Fandez)
    const wantSystem = opts.system === true
      || type === 'order'
      || type === 'alert'
      || type === 'payment'
      || (opts.system !== false && document.hidden);
    if (wantSystem) this.system(title, body, { type, tag, requireInteraction, onClick, url });
  }
};

FandezAlerts.init();

// Activar push del sistema (barra del celular) para usuarios logueados
(function bootstrapPush() {
  function maybeEnable() {
    if (!window.FandezAlerts || typeof FandezAlerts.enablePush !== 'function') return;
    if (typeof Notification === 'undefined') return;
    const path = window.location.pathname || '';
    const isWorker = path.startsWith('/proveedor') || path.startsWith('/tecnico') || path.startsWith('/cliente');
    if (!isWorker) return;
    FandezAlerts.enablePush().catch(() => {});
  }
  const run = () => {
    maybeEnable();
    ['pointerdown', 'touchstart', 'click'].forEach((ev) => {
      window.addEventListener(ev, () => maybeEnable(), { once: true, passive: true });
    });
  };
  if (document.readyState === 'complete') setTimeout(run, 1200);
  else window.addEventListener('load', () => setTimeout(run, 1200));
})();

window.FundezNotify = window.FandezNotify;
window.FundezAlerts = window.FandezAlerts;
