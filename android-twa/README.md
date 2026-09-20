# Fandez · Trusted Web Activity (Google Play)

Empaqueta `https://www.fandez.cl` como app Android con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

| Campo | Valor |
|-------|--------|
| packageId | `cl.fandez.app` |
| versionName | `1.3.4` (alineado a `package.json`) |
| versionCode | `10304` |
| startUrl | `/app?source=twa` |
| host | `www.fandez.cl` |

## Requisitos locales

- JDK 17+
- Android SDK / command-line tools
- Node 20+
- `@bubblewrap/cli` (npx)

## 1. Crear keystore (una sola vez)

```bash
cd android-twa
keytool -genkeypair -v -keystore android.keystore -alias fandez \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guarda la contraseña fuera del repo. **No subas** `android.keystore` a Git.

## 2. Obtener SHA-256 y publicarlo en la web

```bash
keytool -list -v -keystore android.keystore -alias fandez
# Copia el SHA-256 (formato AA:BB:...)
```

En Hostinger `.env`:

```env
ANDROID_PACKAGE_ID=cl.fandez.app
ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:CC:...
# Si usas App Signing de Play, añade también el SHA-256 de Play Console → App integrity
PLAY_STORE_URL=https://play.google.com/store/apps/details?id=cl.fandez.app
```

Tras deploy, verifica:

`https://www.fandez.cl/.well-known/assetlinks.json`

También añade el fingerprint en `twa-manifest.json` → `fingerprints` o:

```bash
npx @bubblewrap/cli fingerprint add "AA:BB:..."
```

## 3. Generar proyecto Android y AAB

```bash
cd android-twa
npx @bubblewrap/cli init --manifest=https://www.fandez.cl/site.webmanifest
# Si ya existe twa-manifest.json, puedes usar:
npx @bubblewrap/cli update
npx @bubblewrap/cli build
```

El AAB queda listo para subir a Play Console (producción o testing interno).

## 4. Dominio apex `fandez.cl`

`additionalTrustedOrigins` incluye `https://fandez.cl`. El mismo `assetlinks.json` se sirve en ambos hosts (vía la app Node).

## 5. Checklist post-build

Ver `docs/PLAY-GOOGLE.md` (Data safety, assets, smoke TWA).
