# Facturación electrónica directa al SII (DTE 33)

Módulo: `lib/sii-dte/`

## Qué hace

Cuando un **socio registra su boleta/factura** al cliente (`POST /proveedor/factura/:id/registrar`), Fandez emite de forma **automática e idempotente** una **Factura Electrónica (tipo 33)** al socio por:

1. Comisión de intermediación (**15% IVA incluido** sobre mano de obra)
2. Costo de pasarela de pagos (tarjeta / Mercado Pago, IVA incluido)

No usa SaaS de pago mensual: firma, TED (CAF) y `UploadDTE` van directo al SII.

## Variables de entorno

```bash
DTE_PROVIDER=sii_direct
SII_ENVIRONMENT=sandbox          # o production
SII_DTE_DRY_RUN=true             # true = XML/PDF local sin llamar al SII
SII_SECRETS_DIR=./data/secrets/sii
SII_CERT_PATH=./data/secrets/sii/certificate.p12
SII_CERT_PASSWORD=********
SII_CAF_33_PATH=./data/secrets/sii/caf-33.xml
FANDEZ_RUT=78.494.038-1
FANDEZ_LEGAL_NAME=Gestión Integral y Servicios Fandez SpA
FANDEZ_GIRO=Intermediación de servicios del hogar
FANDEZ_SII_RESOLUTION_DATE=2024-01-01
FANDEZ_SII_RESOLUTION_NUMBER=0
```

## Secretos (fuera de git)

Coloca en `data/secrets/sii/` (gitignored):

- `certificate.p12` — certificado digital del SII
- `caf-33.xml` — CAF vigente tipo 33

## API

```http
POST /api/partner-invoices/process
Content-Type: application/json

{ "requestId": "..." }
```

Requiere sesión `provider` o `admin`. Idempotente por hash.

Representación impresa: `GET /documentos/tributarios/sii/:docId`

## Ambientes SII

| | Sandbox | Producción |
|--|---------|------------|
| Seed/Token/Upload | maullin.sii.cl | palena.sii.cl |

## Certificación

Antes de producción debes completar el **set de pruebas** del SII con el certificado de certificación y CAF de prueba. El dry-run permite integrar el flujo de negocio sin esperar la certificación.

## Arquitectura

```
lib/sii-dte/
  config.js                     # sandbox/prod + rutas secretos
  amounts.js                    # neto / IVA 19% / total
  generateCommissionInvoice.js  # use case
  folio/caf.js                  # CAF + asignación de folio
  crypto/certificate.js         # PFX
  crypto/ted.js                 # Timbre electrónico
  crypto/xmldsig.js             # Firma XMLDSig
  xml/dte33.js                  # Encabezado/Detalle/EnvioDTE
  sii/auth.js                   # getSeed → getToken
  sii/upload.js                 # ZIP + UploadDTE
  sii/status.js                 # QueryEstUp
  jobs/pollStatus.js            # cola Track ID
  pdf/render.js                 # RIMP + PDF417
  repository.js                 # tabla sii_dtes
```
