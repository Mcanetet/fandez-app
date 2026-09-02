# Soft launch en Hostinger — paso a paso

Guía para pasar de **demo** a **producción** en `www.fandez.cl` sin marketing masivo (5–15 socios curados en Santiago).

## 1. Desplegar el código actual

1. En GitHub, confirma que `main` incluye los commits de go-live (`lib/goLiveCheck.js`, `/health?go=1`, diagnóstico operativo).
2. En Hostinger → **Deployments** (o el flujo que uses), redeploy desde `main`.
3. Espera a que el contenedor reinicie y `/health` responda `ok: true`.

## 2. Variables de entorno en Hostinger

En el panel de la app (Environment variables), ajusta:

| Variable | Valor recomendado | Notas |
|----------|-------------------|--------|
| `APP_MODE` | `production` | **Crítico.** Con `demo`, los pagos no son cobros reales. |
| `NODE_ENV` | `production` | Ya debería estar así. |
| `MP_SANDBOX` | `false` o eliminar | No usar sandbox en prod. |
| `MP_WEBHOOK_SECRET` | Clave del panel MP | Webhooks → tu URL → copiar secret. |
| `MP_PAYER_EMAIL` | Email del comercio MP | Evita rechazos al crear preferencias. |
| `APP_URL` | `https://www.fandez.cl` | URLs de retorno de pago. |

Mantén las existentes: `DB_*`, `MP_ACCESS_TOKEN`, `SMTP_*`, `SESSION_SECRET`, etc.

**Webhook Mercado Pago**

- URL: `https://www.fandez.cl/pagos/webhook` (o la ruta configurada en tu app).
- Eventos: pagos / preferencias según tu integración.
- Tras guardar, copia el secret a `MP_WEBHOOK_SECRET` y **reinicia** la app.

## 3. Verificar desde tu máquina

```bash
# Salud básica
curl -s https://www.fandez.cl/health | jq .

# Chequeo go-live (requiere deploy con /health?go=1)
curl -s 'https://www.fandez.cl/health?go=1' | jq '.goLive'

# Script local contra prod
APP_URL=https://www.fandez.cl npm run go-live:check
```

Objetivo: `softLaunchReady: true` y `mode: "production"`.

Si ves advertencias:

| Código | Acción |
|--------|--------|
| `app_mode_demo` | Cambiar `APP_MODE=production` y reiniciar. |
| `mp_webhook_secret` | Configurar `MP_WEBHOOK_SECRET`. |
| `mp_payer_email` | Configurar `MP_PAYER_EMAIL`. |
| `mp_sandbox` | `MP_SANDBOX=false`. |
| `smtp_missing` | Completar SMTP para OTP y emails. |
| `operational_issues` | Admin → **Diagnóstico operativo** (`/diagnostico/operacion`). |

## 4. Smoke test móvil (opcional)

```bash
BASE_URL=https://www.fandez.cl npm run test:e2e:mobile
```

Requiere Playwright con WebKit instalado.

## 5. Socios — onboarding

Tras el deploy, cada socio nuevo ve en el panel:

1. Verificación (carnet, rostro, ubicación).
2. Contrato firmado.
3. Especialidades en **Equipo**.
4. **Cobertura técnica** (técnico aprobado o «yo hago el servicio» por categoría).
5. Interruptor **En línea**.
6. Banner **Tu primer pedido** + paso en la checklist hasta aceptar el primer trabajo en el **Muro**.

Tour guiado incluye el muro (`data-tour="work-wall"`).

Cuenta demo socio: `pedro@fandez.cl` / `proveedor123`.

## 6. Checklist día del soft launch

- [ ] `/health?go=1` → `softLaunchReady: true`, `mode: production`
- [ ] Pago de prueba real (monto bajo) → cliente ve tracking, socio ve muro
- [ ] Webhook MP registrado en logs / admin
- [ ] 3–5 socios con cobertura y en línea en horario pico
- [ ] SMTP: OTP y comprobante llegan
- [ ] Admin revisa **Ops** en inbox si hay pedidos pagados sin muro

## 7. Qué no hacer aún

- Campañas masivas o cupones agresivos.
- Ampliar fuera de Santiago sin revisar cobertura y tiempos.
- Dejar `APP_MODE=demo` «por si acaso» en el servidor de prod.

## Soporte

Problemas operativos: `soporte@fandez.cl` · Admin diagnóstico: `/diagnostico/operacion`.
