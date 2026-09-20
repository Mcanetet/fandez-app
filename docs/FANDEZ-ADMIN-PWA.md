# Fandez Admin (PWA privada)

App de operaciones **solo para el founder / admin**. No se publica en Google Play.

## Qué es

- Nombre en el celular: **Fandez Admin**
- Ícono: logo Fandez sobre **fondo negro**
- Bandeja de alertas de Sofía / Clara / seguridad / no-show
- Push del sistema + correo (`FOUNDER_EMAILS`)
- Resolver alertas desde el teléfono (“Marcar resuelto” o abrir panel)

## Cómo instalar (privado)

1. Entra al admin (ruta secreta `ADMIN_PATH`).
2. Abre: `{ADMIN_PATH}/instalar-admin`  
   Ejemplo: `https://www.fandez.cl/ops-xxxxx/instalar-admin`
3. Chrome → Instalar app / Añadir a inicio.
4. En la app: **Activar avisos**.

También: `{ADMIN_PATH}/app` (bandeja).

## Qué NO hacer

- No crear ficha en Play Store para esta app.
- No linkearla desde la landing pública.
- No compartir el `ADMIN_PATH` fuera del equipo.

## Código

| Pieza | Ruta |
|-------|------|
| UI móvil | `views/admin/ops-app.ejs` |
| Install | `views/admin/ops-install.ejs` |
| JS | `public/js/admin-ops-app.js` |
| Bandeja | `lib/agents/opsInbox.js` |
| Email + enqueue | `lib/agents/founderAlerts.js` |
| Íconos | `public/icons/fandez-admin-*.png` |

## Env

```
FOUNDER_EMAILS=mcanete@fen.uchile.cl
FOUNDER_DIGEST_ENABLED=true
FOUNDER_DIGEST_HOUR=21
```
