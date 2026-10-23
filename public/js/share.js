(function () {
  const page = document.getElementById('invitarPage');
  if (!page) return;

  const shareUrl = page.dataset.shareUrl;
  const credit = Number(page.dataset.credit || 5000);
  const creditLabel = credit.toLocaleString('es-CL');
  const shareText = `Te invito a Fandez. En tu primera visita tienes $${creditLabel} de descuento: ${shareUrl}`;

  document.getElementById('btnCopyLink')?.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl).then(() => FandezNotify.show('Enlace copiado', 'success'));
  });

  document.getElementById('btnShare')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Fandez', text: shareText, url: shareUrl });
      } catch (_) {}
    } else {
      navigator.clipboard.writeText(shareText).then(() => FandezNotify.show('Enlace copiado para compartir', 'success'));
    }
  });

  document.getElementById('btnApplyCode')?.addEventListener('click', async () => {
    const input = document.getElementById('inputReferralCode');
    const res = await fetch('/cliente/aplicar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.value })
    });
    const data = await res.json();
    if (data.success) {
      FandezNotify.show(data.message, 'success');
      input.value = '';
    } else FandezNotify.show(data.error, 'error');
  });
})();
