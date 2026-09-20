# Procedimientos — Técnico (terreno)

Mirada: quien ejecuta la visita. Cuenta creada por el socio.  
Rutas: `/tecnico` · `/tecnico/trabajo/:id`

---

## TE-01 · Acceso y online

### Happy path
Login → `/tecnico` → expediente OK → En línea → muro del socio → Aceptar + ETA.

### Problemas

| Problema | Actuación |
|----------|-----------|
| No puede ir online | Expediente incompleto (foto, carnets, antecedentes, estudios según config) |
| No ve trabajos | Socio no asignó / no claim-wall / offline |
| Timeout de aceptación (~10 min) | Se pierde el trabajo; socio reasigna |

---

## TE-02 · Wizard de visita (núcleo)

### Orden típico
1. Confirmar servicio  
2. En camino (GPS)  
3. En sitio + **código de llegada** (6 dígitos, en persona)  
4. Diagnóstico  
5. Acción: reparar / materiales / presupuesto / cambio de actividad  
6. Completar  
7. Cliente califica  

### Checklist de calidad Fandez
Puntualidad o aviso · presentarse · pedir permiso · explicar plan · aprobación en app antes de sobrecostos · fotos inicio/cierre · dejar ordenado · pedir calificación.

---

## TE-03 · Código de llegada

### Problemas

| Problema | Actuación |
|----------|-----------|
| Cliente no da el código | No forzar entrada; chat/app; soporte si hay conflicto |
| Intentos fallidos repetidos | Parar; verificar con cliente; admin si bloqueo |
| Saltarse el código | **No está permitido** en procedimiento; riesgo de seguridad y de cuenta |

---

## TE-04 · Materiales

### Regla operativa
- Bajo umbral (~$10.000): incluidos en el servicio (según config).  
- Sobre umbral: aviso al cliente → OK → comprar → subir boleta/factura al pedido.  
- Boletas altas (~≥$15.000) pueden quedar `pending_founder` y **bloquean cierre** hasta revisión.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Cliente no aprueba materiales | No comprar; presupuestar o cerrar según flujo |
| Boleta rechazada / pendiente founder | Esperar; no inventar OK; avisar al socio |
| Compró sin OK | Escalar socio/admin; no prometer reembolso al cliente por chat |

---

## TE-05 · Presupuesto y cambio de servicio

### Happy path
Enviar presupuesto o cambio → cliente responde en app → si hay cargo, pago de ajuste → continuar.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Cliente rechaza presupuesto | Visita puede cerrarse según flujo; no insistir en efectivo |
| Cambio pendiente | No avanzar etapas; esperar decisión |
| Precio “aprox.” | Explicar que se valida con boleta/factura |

---

## TE-06 · SOS en terreno

### Happy path
Ícono alerta → categoría + nota → opcional “me retiro del domicilio” → 133 si aplica → incidente admin.

### Actuación
Seguridad personal primero. No continuar trabajo bajo amenaza. Detalle: `docs/SEGURIDAD-ALERTAS.md`.

---

## TE-07 · Volver a panel socio

Si es self-operator: botón volver a socio tras/durante operación según UI.

### Problemas
Sesión/rol confuso → logout/login o soporte; no mezclar chats de roles.

---

## Script cierre técnico

> “En terreno el orden es: en camino → código en la puerta → diagnóstico → lo que el cliente apruebe en la app → completar con fotos. Si hay materiales caros o peligro, no improvisés: app + 133 si hace falta.”
