# Backup diario automático (sin humano)

Flujo recomendado: **GitHub Actions pide el `.enc` a producción y lo guarda solo** en la rama `backups` del repo `fandez-app`. No hace falta que nadie descargue ni suba nada a mano.

## Qué necesitas (una sola vez)

### 1. Hostinger — solo 2 variables

```bash
BACKUP_SYNC_TOKEN=<secreto-largo-aleatorio>
BACKUP_GITHUB_ENCRYPT_KEY=<otra-frase-larga-que-solo-tu-sepas>
```

No hace falta `BACKUP_GITHUB_TOKEN` ni PAT en el servidor.

Reinicia la app tras guardarlas.

### 2. Secrets en GitHub (`fandez-app` → Settings → Secrets and variables → Actions)

| Secret | Ejemplo |
|--------|---------|
| `FANDEZ_BACKUP_EXPORT_URL` | `https://www.fandez.cl/ops-XXXX/backups/export-encrypted` |
| `FANDEZ_BACKUP_SYNC_TOKEN` | el mismo valor que `BACKUP_SYNC_TOKEN` |

(`ADMIN_PATH` es el path secreto del panel admin, p. ej. `/ops-dde167af2c3bc7dd`.)

### 3. Probar

Actions → **Daily backup offsite** → Run workflow.

Si OK, verás commits en la rama [`backups`](https://github.com/Mcanetet/fandez-app/tree/backups) con archivos:

`backups/daily/YYYY-MM-DD-<id>.enc` + `.manifest.json`

Cron: todos los días a las **03:00 Chile** (06:00 UTC). Retención: 14 días.

## Descifrar (solo en tu máquina)

```bash
BACKUP_GITHUB_ENCRYPT_KEY='...' node scripts/decrypt-github-backup.js ./archivo.enc ./snapshot.json
```

## Repo opcional `fandez-backups`

Existe el repo privado [Mcanetet/fandez-backups](https://github.com/Mcanetet/fandez-backups) como destino alternativo. El flujo por defecto usa la rama `backups` de este mismo repo (sin PAT cruzado).

## Modo opcional (push desde Hostinger)

Si prefieres que el servidor suba directo a GitHub:

```bash
BACKUP_GITHUB_ENABLED=true
BACKUP_GITHUB_TOKEN=ghp_xxx   # Contents:R/W al repo de backups
BACKUP_GITHUB_REPO=Mcanetet/fandez-backups
BACKUP_GITHUB_ENCRYPT_KEY=...
BACKUP_SYNC_TOKEN=...
```

No es necesario si usas el workflow de Actions de arriba.
