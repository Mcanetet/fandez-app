# Procedimientos — Socio (proveedor)

Mirada: empresa o profesional que **recibe y opera** pedidos.  
Rutas: `/registro?role=provider` · `/proveedor` · `/aland` (mensajes)

---

## SO-01 · Registro socio

### Happy path
1. `/registro?role=provider` → datos, RUT, especialidades (o “Otros servicios”).
2. Verificar correo → `/proveedor`.
3. Completar checklist de activación (no es “cobrar en un minuto”).

### Problemas

| Problema | Actuación |
|----------|-----------|
| RUT ya usado | Explicar regla de una cuenta por RUT (según modo); soporte revisa duplicados |
| “Otros servicios” | Queda en revisión interna; no prometer activación inmediata |
| No verifica email | Igual que cliente: spam + reenviar |

**Mensaje honesto:** cuenta rápida; activación real suele **24–72 h** (docs + contrato + equipo).

---

## SO-02 · KYC / verificación de identidad

### Happy path
Perfil → Verificación: consentimiento ubicación → carnet frente/reverso → selfie → estado `verified`.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Selfie rechazada | Reintentar con buena luz / rostro completo; si IA falla → revisión humana admin |
| Docs borrosos | Pedir fotos nítidas; admin `needs_info` |
| “¿Por qué piden carnet?” | Confianza del cliente y seguridad de la plataforma |
| No puede ir online | Revisar gate: KYC + contrato + teléfono/equipo |

---

## SO-03 · Contrato

### Happy path
Draft → documentos → firma → `pending_review` → admin aprueba → operativo.

### Problemas

| Problema | Actuación |
|----------|-----------|
| `needs_info` / rechazado | Leer motivo en panel; corregir docs; reenviar |
| “¿Cuánto es la comisión?” | Remitir a contrato/panel; **no citar % al cliente final** |
| Contrato expirado | Renovar vía flujo de contrato; offline hasta entonces |

---

## SO-04 · Equipo y “yo hago el servicio”

### Happy path
`/proveedor/equipo`: activar servicios → crear/vincular técnicos → expediente completo → especialidades.  
Self-op: puede entrar a modo terreno.

### Problemas

| Problema | Actuación |
|----------|-----------|
| No puede aceptar trabajos | Falta técnico elegible o expediente incompleto |
| Técnico no aparece en muro | Claim-wall / online / especialidad del servicio |
| Desvincular self-op | No aplica; explicar |

---

## SO-05 · En línea + muro (aceptar / rechazar)

### Happy path
Toggle online (si gate OK) → ver muro → Aceptar (elige técnico) o descartar con motivo.

### Problemas

| Problema | Actuación |
|----------|-----------|
| 400 al ir online + `missing[]` | Completar exactamente lo que lista la app |
| 409 “ya tomado” | Otro socio se adelantó; seguir en muro |
| Muro vacío | Zona/horario sin demanda o filtro especialidad; no es bug siempre |
| Rechazos en serie | Monitorear calidad; soporte puede hablar de reputación |

---

## SO-06 · Mando: asignar, desertar, seguimiento

### Happy path
Asignar/reasignar técnico → técnico acepta (~10 min) → visita.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Técnico no acepta | Reasignar otro; si no, desertar (solo antes de en_sitio+) → vuelve a búsqueda |
| Cliente molesto por demora | Chat en app; transparencia; no inventar ETA |
| Quiere desertar en sitio | No permitido por flujo; contactar soporte/admin |

---

## SO-07 · Mensajes Sofía (handoff)

### Happy path
Sofía deriva → aparece en `/proveedor/mensajes` → responder **&lt; ~5 min** → cliente retoma.

### Problemas

| Problema | Actuación |
|----------|-----------|
| No respondió a tiempo | Escala a admin; no culpar al cliente |
| Es tema de pagos | No negociar reembolsos; admin/pagos |
| Cliente agresivo | Respuesta profesional; si amenaza → SOS/admin |

---

## SO-08 · Chat con cliente del pedido

### Happy path
Chat dentro del trabajo; sin compartir teléfonos personales por fuera.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Cliente pide teléfono fuera de la app | Preferir app (respaldo y seguridad) |
| Acoso / amenaza | Protocolo seguridad; retirar si aplica |

---

## SO-09 · Finanzas y facturas post-cierre

### Happy path
Ver por pagar / pagado en panel. Liquidación semanal (orientación: corte mié / pago vie, salta feriados).  
Registrar factura de materiales si el plan lo pide post-`completed`.

### Problemas

| Problema | Actuación |
|----------|-----------|
| “¿Cuándo me pagan?” | Calendario del panel/contrato; admin marca payout |
| Disputa de monto | Admin finanzas; no recalcular comisión en chat Sofía al cliente |
| Falta factura materiales | Completar registro; boletas altas pueden requerir founder |

---

## SO-10 · Modo cliente / offline

### Happy path
Socio puede pasar a modo cliente (fuerza offline). Volver a socio cuando termine.

### Problemas
Explicar que no puede estar online como socio y navegando como cliente a la vez.

---

## Script cierre socio

> “Para operar necesitás: verificación + contrato aprobado + equipo listo, después En línea. El muro muestra pedidos ya pagados en tu zona. Si un paso del checklist falla, decime cuál te marca la app y lo vemos.”
