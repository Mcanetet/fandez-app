# Checklist · Set de pruebas SII (Facturas T33 + NC T61)

Guía operativa para certificación en **maullin** (ambiente de certificación).  
Los montos, glosas y RUT de receptor de cada caso los define el **archivo/PDF que te envía el SII**; no inventes valores.

Referencias oficiales:

- [Instrucciones set de pruebas](https://www.sii.cl/factura_electronica/factura_mercado/inst_set_pruebas.pdf)
- [Manual certificación](https://www.sii.cl/servicios_online/docs/manual_certificacion.pdf)
- Schema: `EnvioDTE_v10.xsd` + `DTE_v10.xsd`

---

## 0. Antes de emitir (obligatorio)

### Credenciales y ambiente

| Ítem | Valor esperado |
|------|----------------|
| `DTE_PROVIDER` | `sii_direct` |
| `SII_ENVIRONMENT` | `sandbox` |
| `SII_DTE_DRY_RUN` | **`false`** (si queda `true`, no llega al SII) |
| Certificado | `.p12` de **certificación**, vigente, autorizado en SII |
| CAF 33 / 61 | XML de prueba del SII (rango con folios suficientes) |
| `FANDEZ_SII_RESOLUTION_DATE` | Fecha de resolución de certificación |
| `FANDEZ_SII_RESOLUTION_NUMBER` | En certificación suele ser **`0`** |
| Emisor | RUT Fandez autorizado como facturador electrónico (postulación) |

### Archivos en servidor

```
data/secrets/sii/certificate.p12
data/secrets/sii/caf-33.xml
data/secrets/sii/caf-61.xml   # si vas a emitir NC
```

### Carátula del EnvioDTE (siempre)

| Campo | Valor |
|-------|--------|
| `RutEmisor` | RUT Fandez sin puntos (`78494038-1`) |
| `RutEnvia` | RUT del certificado que firma (puede ser RL) |
| `RutReceptor` | **`60803000-K`** (SII) |
| `FchResol` / `NroResol` | Los de tu postulación |
| `SubTotDTE` | Contar cuántos DTE de cada tipo van en el ZIP |

---

## 1. Datos del set (completa con tu correo del SII)

Copia del set que te asignaron:

| Campo | Tu valor |
|-------|----------|
| ID del set | `_______________` (ej. `1221626`) |
| Fecha del set / emisión | `____-__-__` |
| Tipos a certificar | ☐ 33  ☐ 61  ☐ 46  ☐ otros |
| Folio CAF 33 desde–hasta | `____` – `____` |
| Folio CAF 61 desde–hasta | `____` – `____` |

**Regla de oro:** en cada DTE del set, la **primera** referencia debe ser:

```xml
<Referencia>
  <NroLinRef>1</NroLinRef>
  <TpoDocRef>SET</TpoDocRef>
  <FolioRef>{folio_de_este_DTE}</FolioRef>
  <FchRef>{fecha_emision}</FchRef>
  <RazonRef>CASO {ID_SET}-{N}</RazonRef>
</Referencia>
```

Ejemplo: set `1221626`, caso 1 → `RazonRef` = `CASO 1221626-1`.

---

## 2. Plantilla de casos (Set básico típico)

Completa cada fila **con los datos literales del PDF del SII** (ítems, cantidades, precios, RUT receptor).

### Facturas 33

| Caso | RazonRef | Receptor (RUT) | Ítems (glosa / cant / precio neto) | Desc. línea | Neto | IVA | Total | Folio usado | Track ID | OK |
|------|----------|----------------|--------------------------------------|-------------|------|-----|-------|-------------|----------|----|
| 1 | `CASO ___-1` | | 1) ____ / __ / ____<br>2) ____ / __ / ____ | — | | | | | | ☐ |
| 2 | `CASO ___-2` | | (con `%Desc` o `DescuentoMonto`) | % / $ | | | | | | ☐ |
| 3 | `CASO ___-3` | | (si pide afecto+exento: `IndExe=1` en exento) | | | | | | | ☐ |
| 4 | `CASO ___-4` | | (si pide descuento global: `DscRcgGlobal`) | global | | | | | | ☐ |

### Notas de crédito 61

Llevan **2 referencias**: (1) SET  (2) factura 33 que corrigen/anulan.

| Caso | RazonRef SET | Factura ref (tipo/folio/fecha) | CodRef | RazonRef corrige | Folio NC | Track | OK |
|------|--------------|--------------------------------|--------|------------------|----------|-------|----|
| 5 | `CASO ___-5` | 33 / ___ / ____ | 2 = texto* | `Dice: … debe decir: …` | | | ☐ |
| 6 | `CASO ___-6` | 33 / ___ / ____ | 3 = montos | Devolución / corrección | | | ☐ |
| 7 | `CASO ___-7` | 33 / ___ / ____ | 1 = anula | Anula documento | | | ☐ |

\* `CodRef=2` **exige** en `RazonRef` las palabras **`Dice:`** y **`debe decir:`** (literal).

### CodRef (recordatorio)

| Código | Significado |
|--------|-------------|
| 1 | Anula documento de referencia |
| 2 | Corrige texto |
| 3 | Corrige montos |

---

## 3. Checklist técnico por documento

Antes de meter el DTE al envío:

- [ ] Folio dentro del CAF y **no reutilizado**
- [ ] `TipoDTE` correcto (33 o 61)
- [ ] `FchEmis` = hoy (o la del set, si el SII lo pide)
- [ ] Emisor: RUT, RznSoc, Giro, Acteco, Dir, Comuna
- [ ] Receptor: RUT y razón social **del caso** (no siempre el SII)
- [ ] Detalle: `NmbItem`, `QtyItem`, `PrcItem`, `MontoItem` = cant × precio (− desc)
- [ ] Totales: `MntNeto` + `IVA` = `MntTotal` (tasa 19)
- [ ] Referencia SET como línea 1 (`TpoDocRef=SET`, `RazonRef=CASO …`)
- [ ] Si es NC: segunda referencia a la factura 33 + `CodRef`
- [ ] TED con `RSR` = razón social receptor, `IT1` = primer ítem, CAF completo
- [ ] `TmstFirma` formato `AAAA-MM-DDTHH:MI:SS`
- [ ] Firma XMLDSig del `Documento` + certificado X509
- [ ] Encoding del archivo: **ISO-8859-1**
- [ ] Primeras 2 líneas del Envio: declaración XML + `schemaLocation`

---

## 4. Envío al SII

1. Generar **todos** los DTE del set.
2. Empaquetar en **un solo** `EnvioDTE` (varios `<DTE>` dentro del mismo `SetDTE`), en el **orden de los casos**.
3. `SubTotDTE` debe cuadrar (ej. 4×33 + 3×61).
4. Firmar el **SetDTE** (Signature del envío).
5. ZIP → `UploadDTE` en maullin.
6. Anotar **Track ID**.
7. En SII → Factura electrónica → consultar envío / set de pruebas → pedir revisión cuando esté aceptado.

Si falla: **no reuses folios**. Emite de nuevo con folios siguientes del CAF. Si el set queda irrecuperable, pide **otro set** al SII (no solo más CAF).

---

## 5. Qué soporta Fandez hoy vs qué falta para el set

| Capacidad | Estado | Notas |
|-----------|--------|--------|
| Factura 33 con ítems, desc. línea, IVA | ✅ | Admin → Emitir facturas |
| NC 61 con ref a factura + CodRef | ✅ | Formulario NC |
| TED RSR/IT1, CAF, ISO-8859-1, firma Set | ✅ | Corregido en `fb83473` |
| Preset receptor SII `60.803.000-K` | ✅ | Solo carátula / receptor frecuente |
| Referencia `TpoDocRef=SET` + `CASO id-n` | ❌ | Hay que agregarla para certificación |
| Varios DTE en un solo EnvioDTE | ❌ | Hoy 1 DTE por emisión |
| Línea exenta `IndExe` | ❌ | Si el set pide caso mixto |
| Descuento global `DscRcgGlobal` | ❌ | Si el set lo pide |
| Nota de débito 56 | ❌ | Set básico completo suele pedirla |

**Implicancia:** puedes emitir y validar XML/estructura en maullin documento a documento, pero el **set oficial** casi siempre exige referencia SET + **un ZIP con todos los casos**. Eso es el siguiente desarrollo si quieres cerrar certificación sin armar el XML a mano.

---

## 6. Orden de trabajo recomendado (Fandez)

1. Subir cert + CAF a Hostinger / `data/secrets/sii`.
2. Poner `SII_DTE_DRY_RUN=false`, `SII_ENVIRONMENT=sandbox`.
3. Emitir **1 factura 33 de humo** (montos libres) → ver Track aceptado.
4. Completar la tabla de la sección 2 con el PDF del SII.
5. Cuando exista soporte SET + multi-DTE (o script de certificación), generar el envío único.
6. Subir, anotar Track, solicitar revisión en el portal SII.
7. Guardar XML/PDF de cada caso en backup (no solo en disco efímero).

---

## 7. Errores típicos que rechazan el set

| Error | Qué hacer |
|-------|-----------|
| Sin `CASO {id}-{n}` en RazonRef SET | Rehacer con ID exacto del correo |
| NC sin 2ª referencia a la 33 | Agregar FolioRef/FchRef/CodRef |
| CodRef=2 sin “Dice:” / “debe decir:” | Corregir RazonRef |
| Folio repetido | Nuevo folio del CAF |
| Dry-run / CAF demo | `DRY_RUN=false` + CAF real |
| `RutReceptor` carátula ≠ `60803000-K` | Corregir carátula |
| RSR del TED = nombre ítem | Debe ser razón social receptor |
| Un DTE por envío cuando el SII espera el set completo | Empaquetar todos juntos |

---

## 8. Contacto / links útiles

- Upload certificación: `https://maullin.sii.cl/cgi_dte/UPL/DTEUpload`
- Seed/Token: `maullin.sii.cl` → `CrSeed` / `GetTokenFromSeed`
- Consulta estado: portal SII facturación electrónica (certificación)
- Doc módulo Fandez: [`SII-DTE-DIRECTO.md`](./SII-DTE-DIRECTO.md)
