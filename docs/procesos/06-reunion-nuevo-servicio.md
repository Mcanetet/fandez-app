# Procedimiento — Reunión con proveedor / socio para incorporar un servicio nuevo

**Audiencia:** Comercial · Producto · Admin  
**Objetivo:** Salir de la reunión con un **brief cerrado** que sirva de prompt para crear el servicio en Fandez: catálogo, fórmula de precio e **intake del cliente** (campos en la app que calculan el monto antes de pagar).

**Principio Fandez (no negociable en el brief):**
- Split del precio de servicio: **15% Fandez** · **~3% tarjeta** · **82% socio** (servicio + transporte dentro del 82%).
- Materiales: pass-through al socio (0% comisión), salvo pacto distinto.
- Ubicación: sale del **registro del cliente** (dirección / comuna). No pedirla de nuevo en el intake, salvo detalle de acceso.
- Precio al cliente = **total a pagar** (IVA incluido / precio final).

---

## 0. Antes de la reunión (15 min)

| # | Preparar |
|---|----------|
| 1 | Nombre comercial del rubro (ej. Limpieza hogar / oficina) |
| 2 | Si es B2C, B2B o ambos |
| 3 | Comunas objetivo (alineadas a oleadas Fandez) |
| 4 | Llevar esta guía + planilla de precios en blanco |
| 5 | Grabar o tomar notas; al final pedir validación escrita de tarifas |

**Duración sugerida:** 60–90 min.

---

## 1. Guion de la reunión (bloques)

### Bloque A — Quiénes son (10 min)

1. ¿Razón social, RUT, años en el rubro, cobertura actual?
2. ¿Atienden hogar, oficina, edificios, post-obra, o todo?
3. ¿Cuántos equipos / personas pueden poner online en punta?
4. ¿Tienen seguro RC? ¿Emisión de boleta/factura?
5. ¿Disponibilidad: días, ventanas, urgencias, feriados?

### Bloque B — Qué vendemos (catálogo) (15 min)

Para **cada** subservicio / pack (máx. 8–12 al inicio):

6. Nombre corto que entendería el cliente en la app  
7. Qué incluye (checklist) y qué **no** incluye  
8. ¿Es visita única, por horas, por m², por ambiente, o proyecto?  
9. Duración típica y tamaño de cuadrilla (1 persona / 2 / más)  
10. ¿Requiere visita diagnóstica previa o se cotiza 100% online con el formulario?

### Bloque C — Cómo se calcula el precio (el corazón) (25 min)

11. **Unidad de cobro:** fija · por m² · por ambiente · por hora · fórmula mixta  
12. **Tarifa base** (CLP, precio final cliente) y **mínimo por job**  
13. Factores que **suben** el precio (lista cerrada)  
14. Factores que **bajan** o no aplican  
15. Add-ons con precio propio (ej. ventanas, horno, mudanza light)  
16. Materiales / insumos: ¿van incluidos, se venden aparte, o el cliente aporta?  
17. Recurrencia: ¿descuento semanal / quincenal / mensual?  
18. ¿Hay tope o “llamar a cotizar” sobre cierto tamaño?

> Regla de producto: todo factor de precio debe ser un **campo del intake** o un dato ya conocido (comuna del perfil). Nada de “el operador calcula a ojo” en el happy path.

### Bloque D — Intake del cliente en la app (20 min)

Preguntar: *“Si el cliente solo puede tocar la pantalla, ¿qué debe responder para que el precio salga solo?”*

19. Lista de campos obligatorios (tipo, opciones, validación)  
20. Campos opcionales (notas, fotos)  
21. Qué se toma del **perfil** (dirección, comuna, tipo persona/empresa)  
22. Fotos: ¿obligatorias? ¿de qué (pieza, estado, acceso)?  
23. Acceso: ¿llaves, conserje, código, horario edificio?  
24. Condiciones especiales del rubro (ej. mascotas → pelos; alergias a químicos)

### Bloque E — Operación y riesgos (10 min)

25. Motivos típicos de cancelación / no-show / reclamo  
26. Qué pasa si el lugar está mucho más sucio / grande de lo declarado  
27. Reagendamiento y ventana de llegada  
28. Evidencia al cerrar (fotos before/after, checklist firmado digital)

### Bloque F — Cierre comercial Fandez (5 min)

29. Confirmar split 15 / ~3 / 82 y materiales  
30. Plazo para enviar lista de precios firmada (Excel/PDF)  
31. Piloto: comunas, cupos/semana, fecha go-live deseada

---

## 2. Plantilla de campos de intake (rellenar en la reunión)

Usar una fila por pregunta al cliente. Marcar si **mueve precio**.

| ID campo | Pregunta en la app | Tipo | Opciones / rango | ¿Mueve precio? | Efecto en tarifa | Obligatorio |
|----------|-------------------|------|------------------|----------------|------------------|-------------|
| `tipo_inmueble` | ¿Qué tipo de espacio? | select | Depto / Casa / Oficina / Local | sí/no | … | sí |
| `m2` | Metros cuadrados aprox. | number | min–max | sí | $/m² o tramos | sí |
| `dormitorios` | ¿Cuántos dormitorios / piezas? | number | 0–10 | sí | +X por pieza | sí |
| `banos` | ¿Cuántos baños? | number | 1–8 | sí | +Y por baño | sí |
| `mascotas` | ¿Hay mascotas? | boolean | Sí / No | sí | recargo pelos / alérgenos | sí |
| `frecuencia` | ¿Cada cuánto? | select | Única / Semanal / … | sí | % descuento | sí |
| `profundidad` | Nivel de limpieza | select | Mantención / Profunda / Post-obra | sí | multiplicador | sí |
| `add_on_*` | Add-ons | multi | Ventanas, horno, … | sí | suma fija | no |
| `acceso` | ¿Cómo se entra? | text/select | Conserje / Llave / Código | no | — | sí |
| `notas` | Indicaciones | text | libre | no | — | no |
| `fotos` | Fotos del espacio | media | 0–4 | no* | *si muy sucio → ajuste en terreno | recomendado |
| _(perfil)_ | Dirección / comuna | auto | registro cliente | sí (futuro uplift zona) | no pedir de nuevo | auto |

\*Ajuste en terreno = flujo existente de cambio de precio con OK del cliente.

---

## 3. Fórmula de precio (dejar por escrito)

Completar con el proveedor:

```
precio_servicio =
  max(
    MINIMO_JOB,
    BASE(tipo, profundidad)
    + (m2 × TARIFA_M2)            // si aplica
    + (dormitorios × TARIFA_PIEZA)
    + (banos × TARIFA_BANO)
    + recargo_mascotas
    + sum(add_ons)
  )
  × descuento_frecuencia
  × multiplicador_zona           // futuro; hoy = 1
```

Luego, en liquidación Fandez:

```
take_fandez     = 15% × precio_servicio   // IVA incluido
fee_tarjeta     ≈ 3%  × precio_servicio
pago_socio      = 82% × precio_servicio   // incluye transporte
materiales      = pass-through (0% Fandez)
```

---

## 4. Entregable: prompt para crear el servicio

Al terminar, pegar las respuestas en este bloque y usarlo con producto / agente de código:

```markdown
# BRIEF SERVICIO FANDEZ — [NOMBRE RUBRO]

## Meta
Crear servicio cliente en app Fandez con precio calculado 100% desde intake (sin cotización manual en happy path).

## Identidad
- id_servicio: [slug]
- nombre_ui: […]
- icono / categoría: […]
- B2C / B2B: […]
- comunas piloto: […]

## Modelo económico
- Split: 15% Fandez / ~3% tarjeta / 82% socio (transporte ⊂ 82%)
- Materiales: [incluidos | aparte | cliente aporta]
- Ubicación: desde registro cliente; uplift zona: [no / sí futuro]

## Actividades (SKU)
1. id / nombre / incluye / no incluye / duración / cuadrilla / precio base o fórmula
2. …

## Intake (campos)
| id | label | tipo | opciones | mueve_precio | regla |
|----|-------|------|----------|--------------|-------|

## Fórmula
[pegar fórmula numérica con tarifas CLP]

## Mínimos y topes
- min_job: $…
- max_autoquote: [m² / $ / “sobre X llamar”]

## Ops
- ventanas horarias: …
- evidencia cierre: …
- regla si realidad ≠ declarado: cambio de precio con OK cliente

## Riesgos / exclusiones
- …

## Proveedor ancla
- empresa, contacto, capacidad semanal, go-live deseado
```

---

## 5. Ejemplo listo — reunión Limpieza (usar hoy)

Checklist mínimo a cerrar con la empresa de limpieza:

### Preguntas sí o sí

1. ¿Packs: mantención, profunda, post-obra, mudanza, oficinas?  
2. ¿Cobran por m², por dormitorio+baño, o tarifa fija por tramo (ej. 40–60 m²)?  
3. Mínimo por visita (CLP) y duración mínima.  
4. Recargo por mascotas (pelos / orina / cantidad).  
5. ¿Incluyen productos e implementos o los lleva el cliente?  
6. Add-ons con precio: ventanas interiores, horno, refrigerador, balcón, planchado, lavado de ropa.  
7. Descuentos por frecuencia (semanal / quincenal / mensual).  
8. Post-obra: ¿multiplica ×1,5 / ×2? ¿excluye retiro de escombros?  
9. Oficinas: ¿por puesto, por m², o por baño+cocina?  
10. ¿Aceptan edificios con conserje / horarios restringidos?  
11. ¿Qué fotos pide el cliente al cotizar?  
12. Tabla de precios firmada (tramos m² × tipo de limpieza).

### Intake sugerido (borrador para validar en la mesa)

| Campo | Tipo | Mueve precio |
|-------|------|--------------|
| Tipo de espacio (depto/casa/oficina) | select | sí |
| m² aproximados | number | sí |
| Dormitorios / piezas | number | sí |
| Baños | number | sí |
| Nivel (mantención / profunda / post-obra) | select | sí |
| Mascotas (sí/no + cantidad) | boolean+number | sí |
| Frecuencia | select | sí |
| Add-ons | multi-select | sí |
| Acceso / conserje | select+text | no |
| Notas (alergias, químicos, focos) | text | no |
| Fotos (opcional 1–3) | media | no |
| Dirección | auto perfil | zona futura |

### Prompt rápido post-reunión (llenar números en vivo)

```text
Crea el servicio "Limpieza" en Fandez.
Precio online con intake: tipo_inmueble, m2, dormitorios, banos, nivel, mascotas, frecuencia, add_ons.
Dirección/comuna desde perfil del cliente.
Fórmula: [PEGAR TARIFAS DEL PROVEEDOR].
Split 15/3/82; materiales [incluidos/aparte].
Exclusiones: […].
Si el estado real supera lo declarado → flujo cambio de precio con OK del cliente.
```

---

## 6. Después de la reunión (checklist producto)

| # | Acción | Dueño |
|---|--------|-------|
| 1 | Brief + tarifas en Drive / `docs/` | Comercial |
| 2 | Crear rubro + actividades en catálogo | Producto |
| 3 | Implementar intake + preview de precio | Producto |
| 4 | Materiales del rubro (si aplica) | Producto |
| 5 | Chips diagnóstico / tips foto | Producto |
| 6 | Copy Sofía (qué incluye / no incluye) | Soporte |
| 7 | Onboarding socio ancla + prueba 3 pedidos | Ops |
| 8 | Soft launch 1–2 comunas | Comercial |

**No publicar** el servicio hasta tener: tarifas mínimas, fórmula testeada en preview, y al menos 1 socio online en la zona piloto.

---

## 7. Anti-patrones (evitar)

- Cotizar “a ojo” fuera de la app.  
- Pedir dirección otra vez si ya está en el perfil.  
- Meter transporte como línea que reste al 15% de Fandez.  
- Más de ~10 campos obligatorios (abandono de checkout).  
- Factores de precio que el cliente no puede responder sin técnico en sitio.  
- Lanzar 20 SKUs: empezar con 4–6 packs claros.
