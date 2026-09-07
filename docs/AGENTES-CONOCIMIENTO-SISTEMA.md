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

| Agente | Cómo usa el conocimiento |
|--------|---------------------------|
| **Sofía** | KB MySQL + `sofiaPrompts.js` v4 |
| **Florencia** | `productBrief` en plan y chat (`lib/florencia/index.js`) |
| **Clara** | Informes financieros; no chat (usa datos vivos de store) |

## Tras deploy

1. Redeploy Hostinger  
2. Admin → Sofía IA → **Sincronizar empresa y servicios**  
3. Probar chat Sofía: “¿cómo pido un servicio?” / “quiero ser socio”

## Editar

1. Actualiza `lib/agents/systemKnowledge.js`  
2. Si cambias tono de Sofía: `lib/aland/sofiaPrompts.js` y sube `PROMPT_VERSION`  
3. Sync KB desde admin
