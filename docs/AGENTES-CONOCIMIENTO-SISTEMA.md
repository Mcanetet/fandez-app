# Conocimiento del sistema Fandez — agentes

Fuente de código: `lib/agents/systemKnowledge.js`  
Se sincroniza a la KB de Sofía con **Admin → Sofía IA → Sincronizar empresa y servicios** (también al arrancar la app).

## Qué incluye el prompt/KB

| ID KB | Contenido |
|-------|-----------|
| `kb-sistema-mapa` | Roles, entradas, agentes |
| `kb-flujo-cliente` | Registro → pedir → pagar → tracking → nav |
| `kb-flujo-socio` | Activación, muro, mando, equipo, contrato |
| `kb-flujo-tecnico` | Wizard de visita |
| `kb-pagos-politicas` | Pagos, urgencia, cobertura, liquidaciones |
| `kb-faq-navegacion` | Dónde está cada cosa |
| `kb-derivacion` | Cuándo usar DERIVAR_PROVEEDOR / PAGOS |

Además (ya existentes): empresa, precios, catálogo por servicio, procedimiento de visita.

## Agentes

| Agente | Cómo usa el conocimiento | Autonomía |
|--------|---------------------------|-----------|
| **Sofía** | KB MySQL + `sofiaPrompts.js` v5 + datos en vivo (`sofiaTools`) | DO FAQ/estado; ASK pagos/urgencia → DERIVAR_* |
| **Florencia** | `productBrief` en plan y chat (`lib/florencia/index.js`) | DRAFT contenido; approve/publish solo founder |
| **Clara** | Informes + decision pack (`lib/agents/clara.js`) | DO métricas; ASK payouts/reembolsos/boletas; NEVER mover plata |

Gates: `lib/founderGates.js` · env `FOUNDER_EMAILS` / `FOUNDER_*`.

## Tras deploy

1. Redeploy Hostinger  
2. Configurar `FOUNDER_EMAILS` (+ Telegram/ntfy founder si aplica)  
3. Admin → Sofía IA → **Sincronizar empresa y servicios**  
4. Probar chat Sofía: “¿cómo pido un servicio?” / “quiero ser socio”  
5. Informes → Clara: ver decision pack y **Notificar founder**

## Editar

1. Actualiza `lib/agents/systemKnowledge.js`  
2. Si cambias tono de Sofía: `lib/aland/sofiaPrompts.js` y sube `PROMPT_VERSION`  
3. Sync KB desde admin
