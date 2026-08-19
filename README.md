# Fandez — Plataforma on-demand de servicios del hogar

Plataforma premium para Santiago, Chile. Node.js + Express + Socket.io + Mercado Pago + Leaflet.

## Requisitos

- Node.js 18+
- Cuenta Mercado Pago (Chile) para pagos reales
- Hosting Node.js (Hostinger VPS o sección Node.js)

## Instalación local

```bash
npm install
cp .env.example .env
npm start
```

Abre http://localhost:3000

## Cuentas demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | cliente@fandez.cl | cliente123 |
| Proveedor | marta@fandez.cl | proveedor123 |
| Admin | admin@fandez.cl | admin123 |

## Despliegue en Hostinger

1. Sube el proyecto a GitHub y clónalo en Hostinger, o sube por FTP.
2. En el panel Node.js de Hostinger:
   - **Entry file:** `app.js`
   - **Start command:** `npm start`
3. Crea `.env` en el servidor con:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (clave larga aleatoria)
   - `APP_URL=https://tudominio.cl`
   - `MP_ACCESS_TOKEN` (producción o sandbox)
   - `WHATSAPP_NUMBER`
   - `SUPPORT_EMAIL=soporte@fandez.cl`
   - `DPO_EMAIL=privacidad@fandez.cl`
   - `SMTP_HOST`, `SMTP_USER=soporte@fandez.cl`, `SMTP_PASS` (correo Hostinger)
4. Ejecuta `npm install` en el terminal de Hostinger.
5. Activa SSL/HTTPS (obligatorio para cookies seguras y HSTS).

## Estructura

```
app.js              → Entrada (PORT dinámico)
models/store.js     → Datos in-memory
routes/             → auth, cliente, proveedor, admin, pagos, legal
config/company.js   → WhatsApp, soporte@fandez.cl, DPD privacidad@fandez.cl
middleware/security.js → Headers HTTP, rate limiting
views/legal/        → Privacidad, términos, cookies
public/             → CSS, JS, iconos SVG
```

## Panel Admin

- Servicios ON/OFF en tiempo real
- Pagos Mercado Pago y comisiones
- Liquidación a proveedores (15% plataforma)
- Reclamos y disputas
- Chat soporte vía WhatsApp y correo **soporte@fandez.cl**
- Privacidad / DPD: **privacidad@fandez.cl**
- Consentimiento de datos (Ley 21.719)
- Auditoría de ciberseguridad
- Florencia IA: estrategia, agenda editorial, imágenes, email marketing y publicación con aprobación humana

### Conectar Florencia IA

Florencia usa `OPENAI_API_KEY` para texto e imágenes. Las redes se habilitan con
variables seguras del servidor (ver `.env.example`):

- Meta: página de Facebook, cuenta Instagram Business vinculada y token con permisos de publicación.
- LinkedIn: organización, OAuth y permiso `w_organization_social`.
- X: token OAuth de usuario con `tweet.write` (no sirve un token app-only).
- TikTok: requiere Content Posting API y auditoría antes de publicar contenido público.
- Email: SMTP configurado; solo se envía a clientes con consentimiento de marketing vigente.

Toda pieza queda en “Por aprobar”. Al aprobarla, el scheduler la publica en su
fecha; el administrador también puede publicarla inmediatamente.

## Legal

- `/legal/privacidad` — Política de privacidad
- `/legal/terminos` — Términos y condiciones
- `/legal/cookies` — Política de cookies
- Banner de consentimiento en todas las páginas

## Seguridad

- Headers: X-Frame-Options, CSP básico, HSTS en producción
- Cookies HttpOnly + SameSite
- Rate limiting por IP
- Logs de auditoría (login, pagos, cambios admin)
- Sin almacenamiento de datos de tarjeta (Mercado Pago)

## GitHub

```bash
git init
git add .
git commit -m "Fandez v1.0"
gh auth login
gh repo create zilo --public --source=. --push
```

## Licencia

Propietario — Fandez SpA
