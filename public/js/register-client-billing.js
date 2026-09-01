(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const clientBillingFields = document.getElementById('clientBillingFields');
  const clientCompanyFields = document.getElementById('clientCompanyFields');
  const clientRut = document.getElementById('client_rut');
  const clientLegalName = document.getElementById('client_legal_name');
  const clientGiro = document.getElementById('client_giro');
  const rutHint = document.getElementById('clientRutHint');
  const nameLabel = document.getElementById('nameLabel');
  const nameInput = document.getElementById('name');
  const billingTypeInputs = document.querySelectorAll('input[name="client_billing_type"]');

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
    const selected = document.querySelector('input[name="client_billing_type"]:checked');
    return selected && selected.value === 'empresa';
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

    const value = clientRut.value.trim();
    const company = isCompanyClient();

    if (!value) {
      if (company) {
        const msg = t('register.error_client_rut', 'Ingresa el RUT de la empresa.');
        showRutError(msg);
        if (showMessage) {
          clientRut.scrollIntoView({ behavior: 'smooth', block: 'center' });
          clientRut.reportValidity();
        }
        return false;
      }
      showRutError('');
      return true;
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
    const company = isClient && isCompanyClient();
    if (clientBillingFields) clientBillingFields.classList.toggle('hidden', !isClient);

    if (clientRut) clientRut.required = company;
    if (clientLegalName) clientLegalName.required = company;
    if (clientGiro) clientGiro.required = company;

    if (clientCompanyFields) {
      clientCompanyFields.classList.toggle('hidden', !company);
    }

    if (rutHint) {
      rutHint.textContent = company
        ? t('register.client_rut_hint_company', 'Obligatorio para emitir factura a tu empresa.')
        : t('register.client_rut_hint_optional', 'Opcional ahora. Si lo dejas vacío, lo pediremos al pagar tu primera visita.');
    }

    if (nameLabel) {
      nameLabel.textContent = company
        ? (nameLabel.dataset.labelCompany || t('register.contact_name', 'Nombre del contacto'))
        : (nameLabel.dataset.labelNatural || t('register.name', 'Nombre completo'));
    }
    if (nameInput) {
      nameInput.placeholder = company
        ? (nameInput.dataset.placeholderCompany || t('register.contact_name_placeholder', 'Quién gestiona la cuenta'))
        : (nameInput.dataset.placeholderNatural || t('register.name_placeholder', 'Tu nombre'));
    }

    if (!isClient || !company) showRutError('');
  }

  billingTypeInputs.forEach((input) => {
    input.addEventListener('change', syncClientBilling);
  });

  document.querySelectorAll('input[name="role"]').forEach((input) => {
    input.addEventListener('change', syncClientBilling);
  });

  if (clientRut) {
    clientRut.addEventListener('input', () => showRutError(''));
    clientRut.addEventListener('blur', () => {
      if (!clientRut.value.trim()) {
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
