/**
 * Llamadas de voz in-app gratis (WebRTC).
 * Señalización: Socket.IO ya existente.
 * ICE: STUN Google + TURN público Open Relay (sin costo).
 */
(function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  function t(key, fallback) {
    try {
      if (window.FandezI18n && typeof FandezI18n.t === 'function') {
        const v = FandezI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) { /* ignore */ }
    return fallback;
  }

  function el(id) {
    return document.getElementById(id);
  }

  const state = {
    socket: null,
    pc: null,
    localStream: null,
    requestId: null,
    role: 'client',
    name: 'Usuario',
    muted: false,
    incoming: null,
    callId: null,
    isCaller: false
  };

  function ensureOverlay() {
    return el('fandezCallOverlay');
  }

  function setStatus(text) {
    const node = el('fandezCallStatus');
    if (node) node.textContent = text || '';
  }

  function setPeer(text) {
    const node = el('fandezCallPeer');
    if (node) node.textContent = text || 'Equipo Fandez';
  }

  function showOverlay(mode) {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.dataset.mode = mode;
    const incoming = el('fandezCallIncomingActions');
    const active = el('fandezCallActiveActions');
    if (incoming) incoming.classList.toggle('hidden', mode !== 'incoming');
    if (active) active.classList.toggle('hidden', mode === 'incoming');
  }

  function hideOverlay() {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.dataset.mode = '';
  }

  async function getMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t('call.mic_unsupported', 'Este dispositivo no permite micrófono en el navegador.'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  }

  function attachRemoteAudio(stream) {
    let audio = el('fandezCallRemoteAudio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'fandezCallRemoteAudio';
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function cleanupMedia() {
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
      state.localStream = null;
    }
    if (state.pc) {
      try { state.pc.close(); } catch (_) { /* ignore */ }
      state.pc = null;
    }
    const audio = el('fandezCallRemoteAudio');
    if (audio) audio.srcObject = null;
    state.muted = false;
    state.incoming = null;
    state.callId = null;
    state.isCaller = false;
    state.requestId = null;
    const muteBtn = el('fandezCallMute');
    if (muteBtn) muteBtn.textContent = t('call.mute', 'Silenciar');
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !state.socket || !state.requestId || !state.callId) return;
      state.socket.emit('call_signal', {
        requestId: state.requestId,
        callId: state.callId,
        candidate: ev.candidate
      });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0] || new MediaStream([ev.track]);
      attachRemoteAudio(stream);
      setStatus(t('call.connected', 'En llamada'));
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setStatus(t('call.connected', 'En llamada'));
      if (st === 'failed' || st === 'disconnected') {
        setStatus(t('call.reconnecting', 'Reconectando…'));
      }
      if (st === 'closed') hangup(true);
    };
    return pc;
  }

  async function startAsCaller(requestId, peerLabel) {
    if (!state.socket) throw new Error(t('call.no_socket', 'Sin conexión en vivo.'));
    if (state.pc || state.incoming) {
      throw new Error(t('call.busy', 'Ya hay una llamada en curso.'));
    }
    state.requestId = requestId;
    state.isCaller = true;
    state.callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.socket.emit('register_client', requestId);
    setPeer(peerLabel || t('call.team', 'Equipo Fandez'));
    setStatus(t('call.calling', 'Llamando…'));
    showOverlay('outgoing');

    state.localStream = await getMic();
    state.pc = createPeerConnection();
    state.localStream.getTracks().forEach((track) => state.pc.addTrack(track, state.localStream));

    const offer = await state.pc.createOffer({ offerToReceiveAudio: true });
    await state.pc.setLocalDescription(offer);

    state.socket.emit('call_invite', {
      requestId,
      callId: state.callId,
      fromRole: state.role,
      fromName: state.name,
      sdp: state.pc.localDescription
    });
  }

  async function acceptIncoming() {
    const invite = state.incoming;
    if (!invite || !state.socket) return;
    state.requestId = invite.requestId;
    state.callId = invite.callId;
    state.isCaller = false;
    setPeer(invite.fromName || t('call.team', 'Equipo Fandez'));
    setStatus(t('call.connecting', 'Conectando…'));
    showOverlay('active');

    state.localStream = await getMic();
    state.pc = createPeerConnection();
    state.localStream.getTracks().forEach((track) => state.pc.addTrack(track, state.localStream));

    await state.pc.setRemoteDescription(invite.sdp);
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);

    state.socket.emit('call_accept', {
      requestId: invite.requestId,
      callId: invite.callId,
      sdp: state.pc.localDescription,
      fromRole: state.role,
      fromName: state.name
    });
    state.incoming = null;
  }

  function rejectIncoming() {
    const invite = state.incoming;
    if (invite && state.socket) {
      state.socket.emit('call_reject', {
        requestId: invite.requestId,
        callId: invite.callId,
        fromName: state.name
      });
    }
    state.incoming = null;
    hideOverlay();
    cleanupMedia();
  }

  function hangup(silent) {
    if (state.socket && state.requestId && state.callId && !silent) {
      state.socket.emit('call_hangup', {
        requestId: state.requestId,
        callId: state.callId
      });
    }
    hideOverlay();
    cleanupMedia();
  }

  function toggleMute() {
    if (!state.localStream) return;
    state.muted = !state.muted;
    state.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !state.muted;
    });
    const muteBtn = el('fandezCallMute');
    if (muteBtn) {
      muteBtn.textContent = state.muted
        ? t('call.unmute', 'Activar mic')
        : t('call.mute', 'Silenciar');
    }
  }

  function bindUi() {
    el('fandezCallAccept')?.addEventListener('click', () => {
      acceptIncoming().catch((err) => {
        hangup(true);
        if (window.FandezNotify) FandezNotify.show(err.message || t('call.failed', 'No se pudo conectar la llamada.'), 'error');
      });
    });
    el('fandezCallReject')?.addEventListener('click', rejectIncoming);
    el('fandezCallHangup')?.addEventListener('click', () => hangup(false));
    el('fandezCallMute')?.addEventListener('click', toggleMute);
  }

  function bindSocket(socket) {
    state.socket = socket;
    socket.on('call_invite', (payload) => {
      if (!payload?.requestId || !payload?.sdp || !payload?.callId) return;
      if (state.pc || state.incoming) {
        socket.emit('call_reject', {
          requestId: payload.requestId,
          callId: payload.callId,
          reason: 'busy'
        });
        return;
      }
      state.incoming = payload;
      setPeer(payload.fromName || t('call.team', 'Equipo Fandez'));
      setStatus(t('call.incoming', 'Llamada entrante'));
      showOverlay('incoming');
      if (window.FandezAlerts) {
        FandezAlerts.notify({
          type: 'alert',
          title: t('call.incoming', 'Llamada entrante'),
          body: payload.fromName || t('call.team', 'Equipo Fandez'),
          tag: `fandez-call-${payload.callId}`,
          requireInteraction: true
        });
      }
    });

    socket.on('call_accept', async (payload) => {
      if (!state.isCaller || !state.pc || payload?.callId !== state.callId) return;
      try {
        await state.pc.setRemoteDescription(payload.sdp);
        setStatus(t('call.connected', 'En llamada'));
        showOverlay('active');
      } catch (err) {
        hangup(false);
        if (window.FandezNotify) FandezNotify.show(err.message || t('call.failed', 'No se pudo conectar la llamada.'), 'error');
      }
    });

    socket.on('call_reject', (payload) => {
      if (payload?.callId && payload.callId !== state.callId && !state.incoming) return;
      hangup(true);
      if (window.FandezNotify) {
        FandezNotify.show(t('call.rejected', 'No contestaron la llamada.'), 'warning');
      }
    });

    socket.on('call_hangup', (payload) => {
      if (payload?.callId && state.callId && payload.callId !== state.callId) return;
      hangup(true);
      if (window.FandezNotify) {
        FandezNotify.show(t('call.ended', 'Llamada finalizada.'), 'info');
      }
    });

    socket.on('call_signal', async (payload) => {
      if (!state.pc || payload?.callId !== state.callId || !payload?.candidate) return;
      try {
        await state.pc.addIceCandidate(payload.candidate);
      } catch (_) { /* ignore late candidates */ }
    });
  }

  window.FandezCall = {
    init({ socket, role, name } = {}) {
      if (!socket) return;
      state.role = role || 'client';
      state.name = name || 'Usuario';
      bindSocket(socket);
      bindUi();
    },
    async start(requestId, peerLabel) {
      try {
        await startAsCaller(requestId, peerLabel);
      } catch (err) {
        hangup(true);
        if (window.FandezNotify) {
          FandezNotify.show(err.message || t('call.failed', 'No se pudo iniciar la llamada.'), 'error');
        }
        throw err;
      }
    },
    hangup: () => hangup(false),
    isActive: () => Boolean(state.pc || state.incoming)
  };
})();
