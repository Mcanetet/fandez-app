# Google Play · Fandez (TWA)

Guía operativa alineada a `android-twa/` y a la web híbrida (landing + app shell).

## URLs legales (Play Console)

| Campo Console | URL |
|---------------|-----|
| Privacy policy | `https://www.fandez.cl/legal/privacidad` |
| Terms (si piden) | `https://www.fandez.cl/legal/terminos` |
| Asset Links | `https://www.fandez.cl/.well-known/assetlinks.json` |
| Web manifest | `https://www.fandez.cl/site.webmanifest` |

## Data safety (declaración sugerida)

Marca según el producto real (ajustar si cambias permisos):

| Dato | Recogido | Compartido | Propósito |
|------|----------|------------|-----------|
| Nombre, email, teléfono | Sí | Con socios asignados / procesadores | Cuenta, prestación del servicio |
| Dirección de servicio | Sí | Con socio/técnico asignado | Visita a domicilio |
| Ubicación precisa (en visita) | Sí (opt-in) | Socio/técnico / familiar Guardián | Tracking / seguridad |
| Fotos / documentos KYC | Sí (socios) | Procesamiento interno | Verificación |
| Info de pago | Sí (vía Mercado Pago) | Pasarela | Transacciones |
| ID de dispositivo / logs | Sí | Hosting / seguridad | Fraude, estabilidad |
| Mensajes in-app | Sí | Contraparte del chat | Soporte / servicio |

- **Cifrado en tránsito:** sí (HTTPS).
- **Eliminación de cuenta:** `/legal/mis-datos` + correo DPD.
- **Menores:** no dirigida a &lt;18.

## Assets de ficha

| Asset | Ruta / spec |
|-------|-------------|
| Ícono 512 | `public/icons/fandez-v11-512.png` |
| Feature graphic 1024×500 | `public/play/feature-graphic-1024x500.png` (generar con script abajo) |
| Screenshots | 5 portrait: pedir · mapa · pago · Guardián/código · Sofía |

```bash
node scripts/generate-play-feature-graphic.js
```

## Metadatos ASO (pegar en Console)

- **Título:** `Fandez: servicios a domicilio`
- **Short:** `Gasfitería, electricidad y más en Santiago. Paga en app y sigue al técnico.`
- **Categoría:** Lifestyle / House & Home

## Smoke TWA (antes de producción)

Probar en dispositivo Android con el AAB de internal testing:

1. Abre a pantalla completa (sin barra Chrome) → Asset Links OK.
2. Login cliente / socio / técnico.
3. Pedido + Mercado Pago (sandbox o prod controlado).
4. Tracking GPS “en camino”.
5. Cámara KYC socio (permiso).
6. Web Push / notificación de estado.
7. Deep link: `https://www.fandez.cl/login` abre dentro de la TWA.
8. Admin no se promociona; ruta ops solo conocida.

## Env Hostinger

```env
ANDROID_PACKAGE_ID=cl.fandez.app
ANDROID_SHA256_CERT_FINGERPRINTS=...
PLAY_STORE_URL=https://play.google.com/store/apps/details?id=cl.fandez.app
PLAY_STORE_LISTING_LIVE=true
```

Ver también `android-twa/README.md`.
