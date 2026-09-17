# Guía de seguridad y alertas Fandez

Cómo funciona el protocolo cuando alguien hace algo indebido o hay riesgo personal durante una visita.

## Principio

1. **Prevención** (antes): KYC, antecedentes, GPS, código de llegada, chat sin teléfono, Modo Guardián.  
2. **Durante**: tracking vivo + botón **Me siento inseguro** (cliente y técnico).  
3. **Respuesta**: incidente en reclamos + alerta a admin/soporte + 133 si hay peligro inmediato.  
4. No pedimos “probar” el delito en la app: solo categoría, notas opcionales y evidencia ya existente (pedido, chat, GPS, fotos).

---

## Roles

| Quién | Qué puede hacer |
|-------|-----------------|
| **Cliente** | SOS / reportar en la visita · Cancelar con motivo seguridad (crea incidente) · Sofía detecta acoso/robo y deriva a admin |
| **Técnico** | SOS en terreno · Opción “me retiro del domicilio” · Llamar 133 |
| **Familiar (Guardián)** | Sigue mapa y estado **sin** ver el teléfono del técnico |
| **Admin / soporte** | Recibe `aland_security_alert` + email · Ve reclamo tipo `seguridad` · Puede bloquear/suspender |

---

## Flujos

### A) Cliente — “Me siento inseguro” (SOS)

1. En el seguimiento de la visita aparece el botón rojo **Me siento inseguro** (también “Reportar problema de seguridad” más abajo).  
2. Elige categoría (inseguro, acoso, robo, amenaza, fraude, otro).  
3. Opcional: nota corta.  
4. Puede tocar **Llamar 133**.  
5. Al enviar: se crea un **reclamo/incidente** (`type: seguridad`), se marca la visita, se notifica a soporte y al panel admin.  
6. El cliente recibe confirmación: “Alerta registrada…”.

**API:** `POST /cliente/solicitud/:id/seguridad`  
Body: `{ categoryId, channel: "sos"|"report", notes }`

### B) Cliente — Cancelar por seguridad

1. Cancelar visita → motivo **Preferencia de seguridad / comodidad**.  
2. Tip: se avisa que se registrará incidente.  
3. Además de la cancelación/reembolso habitual, se crea el mismo tipo de incidente (`channel: cancel_safety`).  
4. Email + alerta admin.

### C) Técnico — SOS en terreno

1. Ícono de alerta en el header de **Trabajo**.  
2. Misma elección de categoría + nota.  
3. Checkbox opcional: **Me retiro del domicilio por seguridad**.  
4. Mismo incidente + alerta ops.  
5. CTA **133**.

**API:** `POST /tecnico/trabajo/:requestId/seguridad`

### D) Sofía (chat)

Si el texto habla de acoso, amenaza, robo, “me siento inseguro”, etc.:

1. Respuesta **fija** (no improvisada por IA): prioriza 133 + botón de alerta en la visita.  
2. Escala a **admin**.  
3. Emite `aland_security_alert` tipo `personal_safety`.

Emergencias de **hogar** (gas, fuego, inundación) siguen el camino anterior (132/133/131) y son distintas de la seguridad interpersonal.

### E) Modo Guardián

- El familiar ve estado, mapa y ETA.  
- **Ya no** recibe el teléfono del técnico en `/seguimiento/:token/estado` (privacidad).

---

## Severidad (ops)

| Código | Ejemplos | Acción sugerida |
|--------|----------|-----------------|
| **S1** | Amenaza, agresión, acoso, robo | 133 si aplica · congelar cuentas · conservar chat/GPS/fotos |
| **S2** | Me siento inseguro, fraude | Incidente + revisión 24–72h · bloqueo preventivo si corresponde |
| **S3** | Daño material / calidad con tinte seguridad | Reclamo estándar + seguimiento |

Cola: panel **Reclamos** del admin (tipo `seguridad`, prioridad `critica`/`alta`/`media`).

---

## Qué no hace (aún) este protocolo

- No llama solo a Carabineros (el usuario marca 133).  
- No cancela automáticamente el pago en SOS del técnico (solo registra; la salida del domicilio queda marcada).  
- No sustituye un seguro legal: es capa de producto + ops.

---

## Archivos clave

- `lib/safety.js` — categorías, patrones Sofía, copy 133  
- `models/store.js` — `createSafetyIncident`  
- `routes/client.js` / `routes/tecnico.js` — endpoints  
- `views/client/service.ejs` · `views/tecnico/trabajo.ejs` — UI  
- `public/js/client.js` · `public/js/tecnico-trabajo.js` — modales  
- `lib/aland/agent.js` + `routing.js` — detección interpersonal  
- `routes/tracking.js` — Guardián sin teléfono  

---

## Checklist de prueba rápida

1. Cliente en visita activa → SOS → aparece reclamo en admin + email soporte.  
2. Cancelar con motivo seguridad → incidente `cancel_safety`.  
3. Técnico → SOS → misma alerta; con “retiro” queda flag en el pedido.  
4. Sofía: escribir “me siento inseguro con el técnico” → script 133 + admin.  
5. Guardián `/estado` → `provider` sin campo `phone`.
