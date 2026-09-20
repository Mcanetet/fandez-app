# Procedimientos Fandez — Índice

Documentación operativa para **soporte humano**, **Sofía** y **admin**.  
Fuente de verdad de producto: código en `routes/`, `models/store.js`, `lib/agents/systemKnowledge.js`.

| Documento | Audiencia | Contenido |
|-----------|-----------|-----------|
| [01-cliente.md](01-cliente.md) | Cliente · Sofía · Soporte | Registro → pago → visita → postventa |
| [02-socio.md](02-socio.md) | Socio · Soporte | Activación, muro, equipo, liquidación |
| [03-tecnico.md](03-tecnico.md) | Técnico · Socio · Soporte | Wizard de visita en terreno |
| [04-admin-soporte.md](04-admin-soporte.md) | Admin · Soporte | Colas, pagos, reclamos, MFA, DSAR |
| [05-agentes.md](05-agentes.md) | Sofía · Clara · Florencia | Cómo actuar, derivar y qué nunca hacer |
| [06-reunion-nuevo-servicio.md](06-reunion-nuevo-servicio.md) | Comercial · Producto | Reunión con proveedor: intake + fórmula + prompt para crear el servicio |

**Relacionados:** [SEGURIDAD-ALERTAS.md](../SEGURIDAD-ALERTAS.md) · [AGENTES-CONOCIMIENTO-SISTEMA.md](../AGENTES-CONOCIMIENTO-SISTEMA.md) · [FANDEZ-ADMIN-PWA.md](../FANDEZ-ADMIN-PWA.md)

## Principios de soporte (obligatorios)

1. **Empatía breve + un siguiente paso** — no discursos.
2. **No inventar** ETA, montos finales, “ya está reembolsado en tu banco” ni diagnósticos peligrosos.
3. **Seguridad primero** — gas/fuego/persona en riesgo → 132/133/131 antes que Fandez.
4. **Evidencia en la app** — pedido, chat, GPS, fotos; no pedir “pruebas” por WhatsApp externo.
5. **Una dueña del caso** — servicio → socio; dinero → pagos/admin; seguridad → admin + protocolo S1/S2/S3.
6. **Cerrar el loop** — decir qué pasó, qué hiciste, qué esperar (sin plazos inventados).

## Timeouts de referencia

| Evento | Tiempo típico (config) |
|--------|-------------------------|
| Sin socio asignado | ~15 min → aviso cliente |
| Técnico no acepta | ~10 min → reasignar |
| Socio no reasigna | ~10 min → vuelve a búsqueda |
| Solicitud abierta máx. | ~24 h |
| Socio responde chat Sofía | ~5 min o escala admin |

## Canales

| Canal | Uso |
|-------|-----|
| Sofía (app) | FAQ, estado, derivación |
| Email `soporte@` / DPD | Formal, DSAR, reclamaciones |
| Panel admin | Ops, pagos, contratos, reclamos |
| 132 / 133 / 131 | Emergencia real (no reemplaza la app) |
