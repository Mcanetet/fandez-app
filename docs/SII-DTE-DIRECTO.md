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
SII_CAF_46_PATH=./data/secrets/sii/caf-46.xml
SII_CAF_61_PATH=./data/secrets/sii/caf-61.xml
FANDEZ_RUT=78.494.038-1
FANDEZ_LEGAL_NAME=Gestión Integral y Servicios Fandez SpA
FANDEZ_GIRO=Intermediación de servicios del hogar
DTE_EMAIL=dte@fandez.cl
FANDEZ_SII_RESOLUTION_DATE=2024-01-01
FANDEZ_SII_RESOLUTION_NUMBER=0
```

Correo oficial DTE (recepción de facturas y emisión): `dte@fandez.cl` (`DTE_EMAIL`).

## Secretos (fuera de git)

Coloca en `data/secrets/sii/` (gitignored):

- `certificate.p12` — certificado digital del SII
- `caf-33.xml` — CAF vigente tipo 33
- `caf-46.xml` — CAF vigente tipo 46 (factura de compra)
- `caf-61.xml` — CAF vigente tipo 61 (notas de crédito)

## API

```http
POST /api/partner-invoices/process
Content-Type: application/json

{ "requestId": "..." }
```

Requiere sesión `provider` o `admin`. Idempotente por hash.

### Factura / nota de crédito manual (Admin)

En el panel **Documentos** → formulario “Emitir documento tributario manual”, o:

```http
POST /admin/dte/manual
Content-Type: application/json

{
  "dteType": 33,
  "providerId": "opcional-socio",
  "rut": "76.XXXXXX-X",
  "name": "Receptor SpA",
  "giro": "Servicios técnicos",
  "totalClp": 45000,
  "description": "Servicios Fandez",
  "notes": "opcional",
  "requestId": "opcional"
}
```

Factura de compra (46) — compra a particular (p. ej. chatarra). Emisor = Fandez; receptor = vendedor:

```http
POST /admin/dte/manual
Content-Type: application/json

{
  "dteType": 46,
  "rut": "12.345.678-9",
  "name": "Juan Pérez",
  "giro": "Particular",
  "totalClp": 150000,
  "description": "Compra de chatarra / materiales"
}
```

También se registra automáticamente en **Admin → Finanzas → Compras**. Envío real requiere `SII_CAF_46_PATH`.

Nota de crédito (61) — requiere folio del documento referenciado:

```http
POST /admin/dte/manual
Content-Type: application/json

{
  "dteType": 61,
  "rut": "76.XXXXXX-X",
  "name": "Receptor SpA",
  "totalClp": 45000,
  "description": "Anulación comisión",
  "refFolio": 123,
  "refDate": "2026-03-01",
  "refCode": 1,
  "refReason": "Anula documento de referencia"
}
```

`refCode`: `1` anula · `2` corrige texto · `3` corrige montos.

Permiso: `documentos.manage`. Mismo pipeline (dry-run o SII real).

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
  xml/dte33.js                  # Factura 33 + EnvioDTE
  xml/dte46.js                  # Factura de compra 46
  xml/dte61.js                  # Nota de crédito 61 + Referencia
  generateManualInvoice.js      # Emisión manual admin (33/46/61)
  sii/auth.js                   # getSeed → getToken
  sii/upload.js                 # ZIP + UploadDTE
  sii/status.js                 # QueryEstUp
  jobs/pollStatus.js            # cola Track ID
  pdf/render.js                 # RIMP + PDF417
  repository.js                 # tabla sii_dtes
```
