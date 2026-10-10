/**
 * Credenciales Mercado Pago (demo vs productivo).
 * Env: MP_PUBLIC_KEY, MP_ACCESS_TOKEN, MP_TEST_*, MP_SANDBOX, MP_FORCE_TEST/LIVE.
 */

function cleanCredential(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '');
}

function usesSandboxPayments() {
  if (process.env.MP_FORCE_TEST === 'true') return true;
  try {
    if (require('../operationalPhase').isDemoPhase()) return true;
  } catch (_) { /* noop */ }
  if (process.env.MP_FORCE_LIVE === 'true') return false;
  if (process.env.MP_SANDBOX === 'true') return true;
  try {
    return require('../appMode').isDemoMode();
  } catch (_) {
    return false;
  }
}

/**
 * En demo: solo par TEST coherente. Nunca mezcla TEST PK + token de producción.
 */
function resolveSandboxCredentialPair() {
  const testPk = cleanCredential(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST);
  const testTok = cleanCredential(
    process.env.MP_TEST_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST
  );
  const legacyPk = cleanCredential(process.env.MP_PUBLIC_KEY);
  const legacyTok = cleanCredential(process.env.MP_ACCESS_TOKEN);

  if (testPk && testTok) {
    if (legacyTok && testTok === legacyTok) {
      return {
        publicKey: testPk,
        accessToken: '',
        source: 'test_token_duplicates_prod',
        blockedReason:
          'MP_TEST_ACCESS_TOKEN es idéntico a MP_ACCESS_TOKEN (producción). Copia el Access Token del bloque «Credenciales de prueba».'
      };
    }
    return { publicKey: testPk, accessToken: testTok, source: 'mp_test' };
  }

  if (process.env.MP_SANDBOX_USE_MAIN_ENV === 'true' && !testPk && !testTok && legacyPk && legacyTok) {
    return { publicKey: legacyPk, accessToken: legacyTok, source: 'legacy' };
  }

  if (!testPk && !testTok && legacyPk && legacyTok) {
    return {
      publicKey: '',
      accessToken: '',
      source: 'prod_in_demo_blocked',
      blockedReason:
        'En modo demo no usamos credenciales de producción. Configura MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN.'
    };
  }

  return {
    publicKey: testPk || '',
    accessToken: testTok || '',
    source: testPk || testTok ? 'partial' : 'none'
  };
}

function getPublicKey() {
  if (usesSandboxPayments()) return resolveSandboxCredentialPair().publicKey;
  for (const value of [
    process.env.MP_PUBLIC_KEY,
    process.env.MERCADOPAGO_PUBLIC_KEY,
    process.env.MP_PUBLISHABLE_KEY
  ]) {
    const key = cleanCredential(value);
    if (key) return key;
  }
  return '';
}

function getAccessToken() {
  if (usesSandboxPayments()) return resolveSandboxCredentialPair().accessToken;
  return cleanCredential(process.env.MP_ACCESS_TOKEN);
}

function isConfigured() {
  return Boolean(
    getAccessToken()
    || cleanCredential(process.env.MP_ACCESS_TOKEN)
    || cleanCredential(process.env.MP_TEST_ACCESS_TOKEN)
  );
}

function isSandboxMissingTestPublicKey() {
  return usesSandboxPayments() && !getPublicKey();
}

function isSandboxMissingTestAccessToken() {
  return usesSandboxPayments() && !getAccessToken();
}

function inferMpKeyMode(value) {
  const v = cleanCredential(value);
  if (!v) return null;
  if (v.startsWith('TEST-')) return 'test';
  if (v.startsWith('APP_USR-')) return 'app_usr';
  if (v.startsWith('APP-')) return 'app';
  return 'other';
}

function isCredentialPairMismatch() {
  if (usesSandboxPayments()) {
    const pair = resolveSandboxCredentialPair();
    if (pair.source === 'prod_in_demo_blocked' || pair.source === 'test_token_duplicates_prod') return true;
    if (pair.source === 'mp_test' || pair.source === 'legacy') return false;
    const testPk = cleanCredential(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST);
    const testTok = cleanCredential(
      process.env.MP_TEST_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST
    );
    const legacyTok = cleanCredential(process.env.MP_ACCESS_TOKEN);
    if (testPk && !testTok && legacyTok && legacyTok !== testTok) return true;
    return pair.source === 'partial';
  }

  const pk = getPublicKey();
  const tok = getAccessToken();
  if (!pk || !tok) return false;
  const pkMode = inferMpKeyMode(pk);
  const tokMode = inferMpKeyMode(tok);
  if (pkMode === 'test' && tokMode && tokMode !== 'test') return true;
  if (tokMode === 'test' && pkMode && pkMode !== 'test') return true;
  return false;
}

function isEmbedCheckoutAvailable() {
  if (process.env.MP_CHECKOUT_REDIRECT === 'true') return false;
  if (process.env.MP_EMBED_BRICK === 'false') return false;
  if (isCredentialPairMismatch()) return false;
  if (isSandboxMissingTestPublicKey()) return false;
  if (isSandboxMissingTestAccessToken()) return false;
  return Boolean(getAccessToken() && getPublicKey());
}

function getCredentialAdminStatus() {
  const test = usesSandboxPayments();
  const sandboxPair = test ? resolveSandboxCredentialPair() : null;
  return {
    profile: test ? 'test' : 'live',
    useTestCredentials: test,
    publicKeyConfigured: Boolean(getPublicKey()),
    accessTokenConfigured: Boolean(getAccessToken()),
    missingTestPublicKey: test && isSandboxMissingTestPublicKey(),
    missingTestAccessToken: test && isSandboxMissingTestAccessToken(),
    publicKeyEnv: test ? 'MP_TEST_PUBLIC_KEY' : 'MP_PUBLIC_KEY',
    accessTokenEnv: test ? 'MP_TEST_ACCESS_TOKEN' : 'MP_ACCESS_TOKEN',
    sandboxCredentialSource: sandboxPair?.source || (test ? 'none' : 'live'),
    productionEnvPresent: Boolean(
      cleanCredential(process.env.MP_PUBLIC_KEY) && cleanCredential(process.env.MP_ACCESS_TOKEN)
    ),
    testEnvPresent: Boolean(
      cleanCredential(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST)
      && cleanCredential(process.env.MP_TEST_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST)
    )
  };
}

function getLegacySandboxPair() {
  const pair = resolveSandboxCredentialPair();
  if (pair.source === 'legacy') return { publicKey: pair.publicKey, accessToken: pair.accessToken };
  return null;
}

module.exports = {
  cleanCredential,
  usesSandboxPayments,
  resolveSandboxCredentialPair,
  getPublicKey,
  getAccessToken,
  isConfigured,
  isSandboxMissingTestPublicKey,
  isSandboxMissingTestAccessToken,
  isCredentialPairMismatch,
  isEmbedCheckoutAvailable,
  getCredentialAdminStatus,
  getLegacySandboxPair
};
