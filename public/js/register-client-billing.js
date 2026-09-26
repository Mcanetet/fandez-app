(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const clientBillingWrap = document.getElementById('clientBillingWrap');
  const clientNaturalFields = document.getElementById('clientNaturalFields');
  const clientBillingFields = document.getElementById('clientBillingFields');
  const clientCompanyRutSlot = document.getElementById('clientCompanyRutSlot');
  const clientEmpresaToggle = document.getElementById('clientEmpresaToggle');
  const billingTypeHidden = document.getElementById('clientBillingTypeHidden');
  const clientRut = document.getElementById('client_rut');
  const clientRutLabel = document.getElementById('clientRutLabel');
  const clientLegalName = document.getElementById('client_legal_name');
  const clientGiro = document.getElementById('client_giro');
  const rutHint = document.getElementById('clientRutHint');
  const nameLabel = document.getElementById('nameLabel');
  const nameInput = document.getElementById('name');
  const rutFieldWrap = clientRut ? clientRut.closest('div') : null;

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

    const value = clientRut.value.trim();
    if (!value) {
      const msg = isCompanyClient()
        ? t('register.error_client_rut', 'Ingresa el RUT de la empresa.')
        : t('register.error_client_rut', 'Ingresa tu RUT.');
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

  function placeRutField(company) {
    if (!rutFieldWrap) return;
    if (company && clientCompanyRutSlot) {
      clientCompanyRutSlot.appendChild(rutFieldWrap);
    } else if (clientNaturalFields) {
      clientNaturalFields.appendChild(rutFieldWrap);
    }
  }

  function syncClientBilling() {
    const isClient = isClientRole();
    const company = isCompanyClient();

    if (clientBillingWrap) clientBillingWrap.classList.toggle('hidden', !isClient);
    if (clientNaturalFields) clientNaturalFields.classList.toggle('hidden', !isClient || company);
    if (clientBillingFields) clientBillingFields.classList.toggle('hidden', !company);
    if (billingTypeHidden) billingTypeHidden.value = company ? 'empresa' : 'natural';

    placeRutField(company);

    if (clientRut) clientRut.required = isClient;
    if (clientLegalName) clientLegalName.required = company;
    if (clientGiro) clientGiro.required = company;

    if (clientRutLabel) {
      clientRutLabel.textContent = company
        ? (clientRutLabel.dataset.labelCompany || t('register.client_rut_company', 'RUT empresa'))
        : (clientRutLabel.dataset.labelNatural || t('register.client_rut_natural', 'Tu RUT'));
    }

    if (rutHint) {
      rutHint.textContent = company
        ? t('register.client_rut_hint_company', 'Obligatorio para factura a la empresa.')
        : t('register.client_rut_hint_natural', 'Tu RUT para boleta. Lo usamos al pagar.');
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

    if (!isClient) showRutError('');
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
      if (!isClientRole()) {
        showRutError('');
        return;
      }
      if (!clientRut.value.trim() && !isCompanyClient()) {
        // vacío: se valida al enviar
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
