(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  function t(key) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key) : key;
  }

  function isProviderRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role && role.value === 'provider';
  }

  const otros = document.getElementById('specialtyOtros');
  const otherFields = document.getElementById('otherServiceFields');
  const otherName = document.getElementById('other_service_name');
  const otherDesc = document.getElementById('other_service_description');

  function syncOtros() {
    if (!otherFields) return;
    const on = Boolean(otros && otros.checked);
    otherFields.classList.toggle('hidden', !on);
    if (otherName) otherName.required = on;
    if (on && otherName) otherName.focus();
  }

  function syncDescFromName() {
    if (!otherDesc || !otherName) return;
    otherDesc.value = (otherName.value || '').trim();
  }

  if (otros) {
    otros.addEventListener('change', syncOtros);
    syncOtros();
  }
  if (otherName) {
    otherName.addEventListener('input', syncDescFromName);
    syncDescFromName();
  }

  form.addEventListener('submit', (event) => {
    if (!isProviderRole()) return;

    syncDescFromName();

    const catalogChecked = form.querySelectorAll('input.specialty-check:checked:not(#specialtyOtros)');
    const wantsOtros = Boolean(otros && otros.checked);
    const nameVal = (otherName && otherName.value || '').trim();

    if (!catalogChecked.length && !wantsOtros) {
      event.preventDefault();
      const msg = t('register.error_specialties');
      if (typeof FandezNotify !== 'undefined') FandezNotify.show(msg, 'warning');
      else alert(msg);
      form.querySelector('input.specialty-check')?.focus();
      return;
    }

    if (wantsOtros && nameVal.length < 3) {
      event.preventDefault();
      const msg = t('register.error_other_service_name');
      if (typeof FandezNotify !== 'undefined') FandezNotify.show(msg, 'warning');
      else alert(msg);
      otherName?.focus();
    }
  });
})();
