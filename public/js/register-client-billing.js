(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const clientBillingWrap = document.getElementById('clientBillingWrap');
  const clientBillingFields = document.getElementById('clientBillingFields');
  const clientEmpresaToggle = document.getElementById('clientEmpresaToggle');
  const billingTypeHidden = document.getElementById('clientBillingTypeHidden');
  const clientRut = document.getElementById('client_rut');
  const clientLegalName = document.getElementById('client_legal_name');
  const clientGiro = document.getElementById('client_giro');
  const rutHint = document.getElementById('clientRutHint');
  const nameLabel = document.getElementById('nameLabel');
  const nameInput = document.getElementById('name');

  function t(key, fallback) {
    if (typeof FandezI18n !== 'undefined') {
      const value = FandezI18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback || key;
  }

  function isClientRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role && role.value === 'client';
  }

  function isCompanyClient() {
    return Boolean(clientEmpresaToggle && clientEmpresaToggle.checked && isClientRole());
  }

  function showRutError(message) {
    if (!clientRut) return;
    clientRut.setCustomValidity(message || '');
    clientRut.classList.toggle('border-zilo-danger', Boolean(message));
    clientRut.classList.toggle('focus:border-zilo-danger', Boolean(message));
  }

  function validateClientRut(showMessage) {
    if (!clientRut || !isClientRole()) {
      showRutError('');
      return true;
    }

    const company = isCompanyClient();
    const value = clientRut.value.trim();

    if (!company) {
      showRutError('');
      return true;
    }

    if (!value) {
      const msg = t('register.error_client_rut', 'Ingresa el RUT de la empresa.');
      showRutError(msg);
      if (showMessage) {
        clientRut.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clientRut.reportValidity();
      }
      return false;
    }

    if (typeof FandezRut === 'undefined' || !FandezRut.validate(value)) {
      const msg = t('register.error_client_rut_invalid', 'El RUT ingresado no es válido.');
      showRutError(msg);
      if (showMessage) {
        clientRut.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clientRut.reportValidity();
      }
      return false;
    }

    showRutError('');
    clientRut.value = FandezRut.format(value);
    return true;
  }

  function syncClientBilling() {
    const isClient = isClientRole();
    const company = isCompanyClient();

    if (clientBillingWrap) clientBillingWrap.classList.toggle('hidden', !isClient);
    if (clientBillingFields) clientBillingFields.classList.toggle('hidden', !company);
    if (billingTypeHidden) billingTypeHidden.value = company ? 'empresa' : 'natural';

    if (clientRut) clientRut.required = company;
    if (clientLegalName) clientLegalName.required = company;
    if (clientGiro) clientGiro.required = company;

    if (rutHint) {
      rutHint.textContent = company
        ? t('register.client_rut_hint_company', 'Obligatorio para factura.')
        : t('register.client_rut_hint_optional', 'Opcional ahora; lo pedimos al pagar.');
    }

    if (nameLabel) {
      if (isClient) {
        nameLabel.textContent = nameLabel.dataset.labelClient
          || nameLabel.dataset.labelCompany
          || t('register.contact_name', 'Tu nombre');
      } else {
        nameLabel.textContent = nameLabel.dataset.labelNatural || t('register.name', 'Nombre completo');
      }
    }
    if (nameInput) {
      if (isClient) {
        nameInput.placeholder = nameInput.dataset.placeholderClient
          || nameInput.dataset.placeholderCompany
          || t('register.contact_name_placeholder', 'Ej: María López');
      } else {
        nameInput.placeholder = nameInput.dataset.placeholderNatural || t('register.name_placeholder', 'Tu nombre');
      }
    }

    if (!company) showRutError('');
  }

  if (clientEmpresaToggle) {
    clientEmpresaToggle.addEventListener('change', syncClientBilling);
  }

  document.querySelectorAll('input[name="role"]').forEach((input) => {
    input.addEventListener('change', syncClientBilling);
  });

  if (clientRut) {
    clientRut.addEventListener('input', () => showRutError(''));
    clientRut.addEventListener('blur', () => {
      if (!isCompanyClient() || !clientRut.value.trim()) {
        showRutError('');
        return;
      }
      validateClientRut(true);
    });
  }

  form.addEventListener('submit', (e) => {
    if (!isClientRole()) return;
    if (!validateClientRut(true)) e.preventDefault();
  });

  form.addEventListener('invalid', (event) => {
    if (event.target !== clientRut) return;
    event.preventDefault();
    validateClientRut(true);
  }, true);

  syncClientBilling();
})();
