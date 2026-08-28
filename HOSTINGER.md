# Desplegar Fandez en Hostinger

## Si sale "Unsupported framework or invalid project structure"

Ese error aparece en el asistente **quick-install-node-addon** (Codex). Fandez es **Express.js**, no una app React/Next. Usa uno de estos métodos:

---

## Método 1 — Subir ZIP (más fiable)

1. En tu Mac, en la carpeta del proyecto:
   ```bash
   node scripts/create-deploy-zip.js
   ```
2. Se crea **`zilo-hostinger.zip`** en la raíz del proyecto.
3. En hPanel → **Websites** → **Add Website** → **Node.js Web Apps**
4. Elige **Upload your website files** (subir archivos, NO GitHub)
5. Sube `zilo-hostinger.zip`
6. Configuración manual:
   - **Framework:** Express.js (o **Other**)
   - **Entry file:** `index.js` (o `app.js` si el panel lo pide)
   - **Build command:** `npm run build`
   - **Start command:** `npm start`
   - **Node.js:** 20.x
7. Añade variables de entorno (copia de `.env.example`)
8. **Deploy**

---

## Método 2 — GitHub (flujo correcto)

**No uses** el addon "quick-install-node-addon".

1. hPanel → **Websites** → **Add Website**
2. **Node.js Web Apps** (aplicación web Node.js)
3. **Import Git Repository**
4. Repo: `https://github.com/Mcanetet/zilo-app`
5. Rama: `main`
6. Si no detecta Express, pon manualmente:
   - Entry: `index.js`
   - Build: `npm run build`
   - Start: `npm start`

---

## Si sale error 503 en fandez.cl

Significa que **la app Node.js no arrancó**. Casi siempre es por variables de entorno o MySQL.

### Checklist rápido

1. hPanel → tu sitio → **Node.js** → **Environment Variables**
2. Añade estas variables (recomendado, una por una):

```
NODE_ENV=production
SESSION_SECRET=clave-larga-aleatoria-min-32-caracteres
APP_URL=https://tudominio.cl
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u482073296_fandez_bd
DB_USER=u482073296_fandez_user
DB_PASSWORD=tu-clave-mysql
```

3. Verifica configuración de la app:
   - **Entry file:** `index.js`
   - **Build:** `npm run build`
   - **Start:** `npm start`
   - **Node.js:** 20.x

4. Clic en **Redeploy**

5. Revisa **Runtime logs** (o archivo `stderr.log` en la carpeta de la app).  
   Busca: `No se pudo iniciar Fandez` o `DATABASE_URL`.

> **Importante:** `.env` de tu Mac **no se sube a GitHub**. Las variables deben estar en el panel de Hostinger.

---

## Variables de entorno obligatorias

```
NODE_ENV=production
PORT=3000
SESSION_SECRET=clave-larga-aleatoria-min-32-chars
APP_URL=https://tudominio.cl
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u482073296_fandez_bd
DB_USER=u482073296_fandez_user
DB_PASSWORD=tu-clave-mysql
SUPPORT_EMAIL=soporte@fandez.cl
DPO_EMAIL=privacidad@fandez.cl
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=soporte@fandez.cl
SMTP_PASS=clave-del-buzon-hostinger
SMTP_FROM=soporte@fandez.cl
# Preferir solo el email. Si usas "Fandez <soporte@...>", también funciona.
```

> **Para que no caiga en spam (muy importante):**
> 1. En Hostinger → Emails → dominio `fandez.cl` → activa **SPF, DKIM y DMARC** (Connect Domain / Increase deliverability).
> 2. SPF típico: `v=spf1 include:_spf.mail.hostinger.com ~all` (solo un SPF por dominio).
> 3. DMARC inicial: TXT en `_dmarc` → `v=DMARC1; p=none; rua=mailto:soporte@fandez.cl`
> 4. Espera 24–48 h de propagación DNS.
> 5. Verifica en https://mxtoolbox.com/spf.aspx y https://www.mail-tester.com (envía un correo de prueba).
> 6. Hotmail/Outlook: marca el correo como “No es spam” la primera vez ayuda a la reputación del dominio.

> **Importante SMTP en Hostinger Node.js:**
> - Las variables deben estar en la app **Node.js** (no solo en el hosting web).
> - Tras guardar SMTP, **Reinicia** la aplicación Node.
> - Usa `SMTP_FROM=soporte@fandez.cl` (mismo buzón que `SMTP_USER`).
> - Diagnóstico: `https://tudominio.cl/health` (debe decir `"smtp":{"configured":true}`)
> - Prueba de conexión: `https://tudominio.cl/health?smtp=1` (añade `"verified":true` si SMTP conecta)
> - Hotmail/Outlook a veces demoran o mandan a spam; pide al usuario revisar **Correo no deseado**.

(O usa `DATABASE_URL=mysql://u482073296_fandez_user:TU_CLAVE@127.0.0.1:3306/u482073296_fandez_bd`)

> **Correos:** soporte al cliente y notificaciones desde **soporte@fandez.cl**; privacidad y derechos ARCO+ al DPD en **privacidad@fandez.cl** (ambos en Hostinger).

---

## MySQL (obligatorio)

Fandez guarda usuarios, servicios y solicitudes en **MySQL**. Sin `DATABASE_URL` la app no arranca.

### 1. Base de datos en Hostinger

Ya tienes:
- **Base de datos:** `u482073296_fandez_bd`
- **Usuario:** `u482073296_fandez_user`

En variables de entorno del Node.js app, añade:

```
DATABASE_URL=mysql://u482073296_fandez_user:TU_CLAVE@127.0.0.1:3306/u482073296_fandez_bd
```

> En Hostinger usa `127.0.0.1` (no `localhost`) para forzar IPv4 y evitar el error de acceso `@'::1'`.

### 2. Inicializar tablas y usuarios demo

**Opción A — SSH (recomendada)**

Tras el primer deploy, en la terminal SSH de Hostinger:

```bash
npm run db:setup
```

**Opción B — phpMyAdmin (BD vacía, sin SSH)**

1. hPanel → **Databases** → `u482073296_fandez_bd` → **Enter phpMyAdmin**
2. Pestaña **Import** → archivo `db/fandez-schema-hostinger.sql` (solo tablas) o `db/fandez-demo.sql` (tablas + datos demo completos) → **Go**

Para regenerar `fandez-demo.sql` desde el código: `npm run db:generate-demo-sql`

Esto crea las tablas e inserta los usuarios demo:

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | `cliente@fandez.cl` | `cliente123` |
| Proveedor verificado | `pedro@fandez.cl` | `proveedor123` |
| Proveedor nuevo | `marta@fandez.cl` | `proveedor123` |
| Admin | `admin@fandez.cl` | `admin123` |

> En cada arranque la app sincroniza la cuenta admin por correo. Si no puedes entrar, define `ADMIN_PASSWORD` en Hostinger y reinicia, o ejecuta `npm run admin:reset`.

> **Backups:** el historial se guarda en **MySQL** (`app_backups`), no en archivos del deploy. Al subir una nueva versión desde GitHub el historial se conserva. Los documentos KYC (carpeta uploads) siguen en disco del servidor.

### Recuperar acceso admin

En **Variables de entorno** de Hostinger agrega:

```env
ADMIN_EMAIL=admin@fandez.cl
ADMIN_PASSWORD=tu_clave_segura
```

Reinicia la app. También puedes ejecutar en SSH:

```bash
npm run admin:reset
# o con clave personalizada:
npm run admin:reset -- MiClaveSegura2026
```

### 3. Desarrollo local

```bash
# Crea una BD local llamada "zilo", copia .env.example a .env y ajusta DATABASE_URL
npm run db:setup
npm start
```

---

## Comprobar que funciona

Abre: `https://tudominio.cl/health`  
Debe responder: `{"ok":true,"app":"zilo","database":"connected",...}`

---

## Requisitos del plan

- Plan **Business** o **Cloud** (Node.js no está en hosting PHP básico)
- **SSL/HTTPS** activado
