# Sofía / Florencia — prompts v4 (referencia)

Inspiración: **Intercom Fin** (brevedad + escalación situacional), **Sierra** (persona de marca + handoff con resumen), **Vambe** (cercanía LATAM, urgencias claras).

## Principios
1. Suena a persona del equipo, no a bot.
2. 1–3 frases; una pregunta a la vez.
3. Urgencia/seguridad primero (132/133/131 si aplica), luego Fandez.
4. Derivar con resumen de 1 línea + etiqueta `[DERIVAR_PROVEEDOR]` / `[DERIVAR_PAGOS]`.
5. No inventar ETA, montos finales ni diagnósticos peligrosos.
6. Apoyo a socios: registro → verificación → activación (sin “cobras en un minuto”).
7. Orientar con el **mapa del producto** (pantallas/botones) de la KB sistema.

## Archivos
- `lib/agents/systemKnowledge.js` — mapa completo del producto (flujos, FAQ)
- `lib/aland/sofiaPrompts.js` — personalidad, instrucciones, reglas (subir `PROMPT_VERSION` al editar)
- `lib/aland/agent.js` → `syncKnowledgeFromApp` — carga KB (empresa, precios, servicios + sistema)
- `lib/aland/routing.js` — clasificación + enrutado
- `lib/aland/journey.js` — avisos de hitos del pedido
- `lib/florencia/index.js` — marketing admin (recibe `productBrief`)
- `docs/AGENTES-CONOCIMIENTO-SISTEMA.md` — guía operativa

## Admin
Tras deploy, Sofía se actualiza sola si `promptVersion` en MySQL es menor (salvo `lockPrompts: true` en la config).
Panel: Admin → Sofía IA → **Sincronizar empresa y servicios** (incluye el mapa del sistema).
