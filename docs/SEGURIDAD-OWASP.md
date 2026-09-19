# Seguridad Fandez (OWASP)

Hostinger escanea **dependencias npm** (Patchstack) tras cada deploy y envía correo si hay CVE conocidas.
Eso corresponde a **OWASP A06 — Vulnerable and Outdated Components**.

## Chequeo rápido

```bash
# Solo dependencias de producción (las que Hostinger reporta)
npm audit --omit=dev

# Debe decir: found 0 vulnerabilities
```

Tras actualizar paquetes:

```bash
npm install
npm audit --omit=dev
git add package.json package-lock.json
# commit + push + Redeploy en Hostinger
```

## Controles ya aplicados (mapa OWASP Top 10)

| OWASP | Control en Fandez |
|-------|-------------------|
| A01 Broken Access Control | `requireRole`, rutas por rol, allowlist IP admin |
| A02 Cryptographic Failures | HTTPS/HSTS, `bcrypt` para contraseñas, cookies `Secure`+`HttpOnly` |
| A03 Injection | Consultas MySQL parametrizadas (`mysql2`) |
| A04 Insecure Design | Flujo de pagos/ajustes con estados y validación |
| A05 Security Misconfiguration | `helmet`, `app.disable('x-powered-by')`, CSP, rate limit |
| A06 Vulnerable Components | `npm audit --omit=dev` = 0; overrides de `uuid` |
| A07 Identification/Auth Failures | Rate limit login, MFA admin, sesiones con secret fuerte |
| A08 Software/Data Integrity | Deploy desde GitHub; backups cifrados |
| A09 Logging/Monitoring | `security_logs`, eventos de acceso |
| A10 SSRF | Sin fetch genérico a URLs de usuario |

## Panel Hostinger

1. hPanel → sitio → **Security → Vulnerabilities**
2. Tras el redeploy, la lista debería quedar vacía (o en verde)
3. Si Hostinger ofrece **Auto-fix** (PR en GitHub), revisa el PR antes de mergear

## Notas

- `npm audit` sin `--omit=dev` puede mostrar hallazgos en herramientas de desarrollo (`to-ico`, Playwright, etc.): **no van al servidor de producción**.
- No uses `npm audit fix --force` a ciegas: puede subir `mercadopago` a v3 (breaking).
