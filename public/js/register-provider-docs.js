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

  form.addEventListener('submit', (event) => {
    if (!isProviderRole()) return;

    const specialties = form.querySelectorAll('input[name="specialties"]:checked');
    if (!specialties.length) {
      event.preventDefault();
      if (typeof FandezNotify !== 'undefined') {
        FandezNotify.show(t('register.error_specialties'), 'warning');
      } else {
        alert(t('register.error_specialties'));
      }
      const first = form.querySelector('input[name="specialties"]');
      first?.focus();
    }
  });
})();
