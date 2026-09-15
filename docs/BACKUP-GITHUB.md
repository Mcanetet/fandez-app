# Fandez backups (privado)

Este repositorio guarda copias **cifradas** (AES-256-GCM + gzip) generadas por la app Fandez.

- No subas JSON en claro.
- Archivos: `backups/<tipo>/YYYY-MM-DD-<id>.enc` + `.manifest.json`
- Para descifrar (en tu máquina, con la clave de Hostinger):

```bash
BACKUP_GITHUB_ENCRYPT_KEY='...' node scripts/decrypt-github-backup.js ./archivo.enc ./snapshot.json
```

La automatización vive en el repo de la app: `.github/workflows/daily-backup.yml`.
