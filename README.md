# Fandez — Plataforma on-demand de servicios del hogar

Plataforma premium para Santiago, Chile. Node.js + Express + EJS + MySQL + Socket.io + Mercado Pago + Leaflet.

## Requisitos

- Node.js 20.x
- MySQL 8+
- Cuenta Mercado Pago (Chile) para pagos reales
- Hosting Node.js (Hostinger VPS o sección Node.js)

## Instalación local

```bash
npm install
cp .env.example .env
npm run db:setup
npm run build:css   # compila Tailwind (public/css/tailwind.css)
npm start
```

Abre http://localhost:3000

## Build y assets

- `npm run build:css` — compila Tailwind desde `src/tailwind-input.css` (sin CDN en producción)
- `npm run build` — prepara carpetas de datos + CSS para deploy Hostinger

## Cuentas demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | cliente@fandez.cl | cliente123 |
| Proveedor | marta@fandez.cl | proveedor123 |
| Admin | admin@fandez.cl | admin123 |

## Despliegue en Hostinger

1. Sube el proyecto a GitHub y clónalo en Hostinger, o sube por FTP.
2. En el panel Node.js de Hostinger:
   - **Entry file:** `index.js` o `app.js`
   - **Start command:** `npm start`
3. Crea `.env` en el servidor (ver `.env.example`).
4. Ejecuta `npm install && npm run build` en el terminal de Hostinger.
5. Activa SSL/HTTPS (obligatorio para cookies seguras y HSTS).

## Estructura

```
index.js            → Entrada
app.js              → Express + Socket.io
models/store.js     → Lógica de negocio
models/repository.js→ Persistencia MySQL
db/schema.sql       → Esquema
routes/             → auth, cliente, proveedor, admin, pagos, legal
views/              → EJS (cliente, socio, técnico, admin)
public/css/         → main.css + tailwind.css (compilado)
locales/            → i18n ES/EN (portal + panels)
```

## Experiencia cliente y socio (UX)

- **Cliente:** bottom nav, tracking con ETA sticky, cobertura pre-pago, post-pago → seguimiento automático, reseña y re-solicitar desde historial.
- **Socio:** bottom nav (Inicio · Muro · Mando · Equipo · Perfil), checklist de activación, bloqueo de “en línea” sin KYC+contrato, muro con alertas sonoras, rechazo con motivo, mapa en Mando y asignación por distancia.
- **Técnico:** wizard de visita en terreno (un paso a la vez).
- **Global:** i18n ES/EN, banner de reconexión Socket.io, Tailwind compilado, aliases CSS `fandez-*`.

## Tests

```bash
npm test              # Jest unit/integration
npm run test:e2e      # Playwright (login + flujos panel)
```

## Panel Admin

Operaciones, finanzas, socios, Florencia IA (marketing), backups. Ver rutas en `routes/admin.js`.

## Legal

- `/legal/privacidad` — Política de privacidad
- `/legal/terminos` — Términos y condiciones
- `/legal/cookies` — Política de cookies

## Licencia

Propietario — Fandez SpA
