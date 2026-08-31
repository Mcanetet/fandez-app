window.FandezNotify = {
  container: null,
  DURATION: {
    info: 3400,
    success: 3200,
    warning: 4200,
    error: 4800
  },
  ICONS: {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
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

  show(message, type = 'info') {
    this.init();
    const kind = ['success', 'info', 'warning', 'error'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.setAttribute('role', kind === 'error' || kind === 'warning' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = this.ICONS[kind];

    const body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = String(message || '');

    toast.appendChild(icon);
    toast.appendChild(body);
    this.container.appendChild(toast);

    const ms = this.DURATION[kind] || 3400;
    const removeAt = setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 320);
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
    order: 'success',
    payment: 'success',
    alert: 'warning',
    success: 'success',
    update: 'info',
    default: 'info'
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
    try {
      const n = new Notification(title || 'Fandez', {
        body: body || '',
        icon: '/icons/fandez-v6-192.png',
        badge: '/icons/fandez-v6-96.png',
        tag: tag || ('fandez-' + type),
        renotify: true,
        vibrate: this.VIBRATE[type] || this.VIBRATE.default,
        requireInteraction: !!requireInteraction
      });
      n.onclick = () => {
        try { window.focus(); } catch (_) {}
        if (typeof onClick === 'function') { try { onClick(); } catch (_) {} }
        else if (url) { try { window.location.href = url; } catch (_) {} }
        n.close();
      };
      return n;
    } catch (_) {
      return null;
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
    if (!force && this._lastKey[key] && nowMs - this._lastKey[key] < 1500) return;
    this._lastKey[key] = nowMs;

    if (opts.toast !== false && window.FandezNotify) {
      const toastType = typeof opts.toast === 'string' ? opts.toast : (this.TOAST_TYPE[type] || 'info');
      FandezNotify.show(body || title, toastType);
    }

    this.playSound(type);
    this.vibrate(type);

    const wantSystem = opts.system === true || (opts.system !== false && document.hidden);
    if (wantSystem) this.system(title, body, { type, tag, requireInteraction, onClick, url });
  }
};

FandezAlerts.init();

window.FundezNotify = window.FandezNotify;
window.FundezAlerts = window.FandezAlerts;
