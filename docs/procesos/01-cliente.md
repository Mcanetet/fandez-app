# Procedimientos — Cliente

Mirada: persona u empresa que **pide** el servicio.  
Rutas base: `/registro` · `/cliente` · `/pagos` · `/aland` · `/seguimiento/:token`

---

## CL-01 · Registro y verificación de correo

### Procedimiento (happy path)
1. Entrar a `/registro?role=client` (o CTA persona/empresa en landing).
2. Completar datos, dirección con cobertura, consentimientos.
3. Si eligió empresa: datos de facturación (`billing=empresa`).
4. Recibir código de 6 dígitos → `/verificar-email`.
5. Verificar → panel `/cliente`.

### Problemas y actuación (Sofía / Soporte)

| Problema | Qué hacer | Qué no hacer |
|----------|-----------|--------------|
| No llega el correo | Spam → Reenviar en `/verificar-email`. Si falla SMTP: tomar email + hora y escalar admin | Prometer “ya lo envié desde mi lado” sin evidencia |
| Código inválido/expirado | Pedir Reenviar y usar el código nuevo | Dar códigos inventados |
| “Ya tengo cuenta” | Orientar a `/login` o `/recuperar` | Crear segunda cuenta sin revisar |
| Fuera de cobertura | Explicar comunas activas; opción interés de zona si existe | Prometer visita “igual se puede” |
| Quiere factura desde el día 1 | Perfil → facturación empresa; emitir según flujo docs | Garantizar factura SII en el acto |

**Cierre agente:** “Verifica el correo y luego en Inicio eliges el servicio. Si el código no llega, toca Reenviar y revisa spam.”

---

## CL-02 · Login y recuperación de contraseña

### Happy path
`/login` → dashboard. Olvidé clave → `/recuperar` → link → `/recuperar/nueva`.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Credenciales incorrectas | Recuperar contraseña; no revelar si el email “existe” con detalle de seguridad |
| Bloqueo / rate limit | Esperar unos minutos; si persiste → admin revisa security_logs |
| No verificado | Mandar a `/verificar-email` |
| Entró a login de admin por error | “Usa el login de fandez.cl de la app; el panel interno es otra URL” |

---

## CL-03 · Pedir un servicio

### Happy path
1. `/cliente` → elegir servicio.
2. Urgencia (Inmediato / Hoy / Mañana / 2 días), dirección, notas, foto si aplica (ej. jardinería).
3. Confirmar → checkout `/pagos/...`.
4. Pagar (tarjeta / transferencia / créditos-promo si aplica).
5. Pago OK → solicitud en búsqueda / programada → tracking.

### Jardinería y paisajismo (Valle Parraguez) — hitos

Línea de tiempo en tracking del cliente:

1. **Evaluación pagada** — cobro inicial de evaluación técnica (~$40.000).  
2. **Equipo asignado** — socio/técnico toma el pedido.  
3. **En camino** — técnico rumbo a la evaluación.  
4. **Evaluación en terreno** — código de seguridad + levantamiento (plano o visita).  
5. **Ejecución / diseño** — según Diseño, Construcción y/o Mantención (desde 100 m²).  
6. **Entregables** — el técnico sube planimetría, proyectos especiales, evidencia de obra o informe.  
7. **Proyecto cerrado** — cliente ve entregables y califica.

Intake obligatorio del cliente: tipo(s) de servicio, comuna/sector, m², tipo de propiedad, plano digital o visita de levantamiento, alcance y aceptación de pagos.

### Problemas

| Problema | Actuación |
|----------|-----------|
| “¿Cuánto cuesta exacto?” | Dar rango/visita pública; el total final puede variar con materiales/presupuesto en sitio | 
| No puede pagar | Revisar pasarela; transfer pendiente = espera aprobación; no inventar “ya cobró” |
| Quiere cotizar fuera de la app | Explicar que el pedido y el pago van en la app (respaldo) |
| Módulo solicitar off / servicio disabled | “Ese servicio no está disponible ahora”; ofrecer otro o lista de espera vía soporte |
| Jardinería: “¿dónde están los planos?” | En cerrados, sección Entregables del resumen; si aún está en visita, el técnico los carga en el cierre |

**Etiqueta Sofía:** dudas de precio/cobertura = DO. Disputa de cobro = `[DERIVAR_PAGOS]`.

---

## CL-04 · Sin socio / timeout de búsqueda (~15 min)

### Happy path
Aviso en app → **Seguir buscando** o **Solicitar reembolso**.

### Problemas

| Problema | Actuación |
|----------|-----------|
| “Nadie viene” | Explicar el aviso de la app; opciones seguir / reembolso. Admin puede asignar manual si hay socios elegibles |
| Quiere reembolso YA en cartola | “Fandez inicia el reembolso el siguiente día hábil; el banco define cuándo se ve” |
| 24 h sin asignación | Puede auto-expirar; orientar a reembolso o nuevo pedido |

**Nunca:** prometer un socio concreto o ETA.

---

## CL-05 · Tracking de la visita

### Estados típicos
Buscando → Asignado → En camino → En sitio → Diagnóstico / materiales / presupuesto → Completado.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Técnico no acepta | El sistema reasigna; pedir paciencia breve; si se atasca → admin |
| Quiere cambiar de socio | Solo si el técnico aún no está en sitio+; botón/flujo en app o soporte |
| No ve el mapa | Actualizar app/PWA; permisos; si falla → admin revisa solicitud |
| Quiere el teléfono del técnico | No darlo por chat externo; comunicación en app. Guardián tampoco muestra teléfono |

---

## CL-06 · Código de llegada

### Happy path
Cliente ve/comparte código en persona al técnico en el domicilio. Técnico lo valida en app.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Técnico no pide código | Recordar que es obligatorio en sitio; reportar a soporte si se salta |
| Muchos intentos fallidos | No inventar el código; revisar en panel admin/solicitud |
| Cliente no encuentra el código | Guiar a la pantalla de la solicitud activa |

---

## CL-07 · Presupuesto, materiales y cambio de servicio

### Happy path
- Presupuesto en sitio → aprobar/rechazar en app (puede abrir pago de ajuste).
- Materiales ≥ umbral (~$10.000) → OK cliente → técnico compra → boleta.
- Cambio de actividad → aprobar/rechazar; puede afectar precio (aprox. + boleta/factura).

### Problemas

| Problema | Actuación |
|----------|-----------|
| “Me cobraron de más” | Pedir ID solicitud; `[DERIVAR_PAGOS]`; no autorizar descuentos por chat |
| Rechazó presupuesto y está enojado | Empatía breve; opciones: otro diagnóstico / cancelar según política / humano pagos |
| Materiales sin boleta | No cerrar discusión inventando montos; admin/founder revisan boletas altas |
| Quiere pagar en efectivo al técnico | Desalentar; el respaldo es pago en app |

---

## CL-08 · Cancelación y reembolso

### Happy path
Cancelar con motivo → fee según etapa (antes de aceptar / aceptado / en camino) → `refund` solicitado.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Disputa del cargo de cancelación | Explicar política de Términos; escalar pagos |
| Canceló por seguridad | Se crea incidente; priorizar bienestar; ver SEGURIDAD-ALERTAS |
| “¿Cuándo veo la plata?” | Mismo script de plazos bancarios (día hábil de inicio ≠ abono en cartola) |

---

## CL-09 · SOS / “Me siento inseguro”

### Happy path
Botón rojo en visita → categoría + nota → alerta admin + opción 133. **No cancela el pago solo.**

### Actuación agente (fija)
1. Priorizar seguridad personal: **133** si hay peligro.
2. Indicar el botón **Me siento inseguro** en la visita.
3. Escalar admin (`personal_safety`). No improvisar mediación policial.

Detalle: `docs/SEGURIDAD-ALERTAS.md`.

---

## CL-10 · Modo Guardián

### Happy path
Tras pago / en visita: link `/seguimiento/:token` para familiar (mapa/estado, sin teléfono del técnico).

### Problemas

| Problema | Actuación |
|----------|-----------|
| Link no abre | Verificar módulo activo y token; regenerar desde éxito/pago si aplica |
| Familiar pide el teléfono del técnico | Explicar privacidad Guardián |

---

## CL-11 · Sofía (chat)

### Happy path
Cliente abre chat → FAQ / estado con datos vivos → si hace falta, derivación.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Sofía no responde / error API | Reintentar; si cae OpenAI → soporte humano email |
| Cliente insulta | Una línea firme + volver al caso; si amenaza → seguridad |
| Quiere humano ya | Derivar; no “te conecto en 30 segundos” |

---

## CL-12 · Postventa: reseña, historial, Pasaporte, referidos

### Happy path
Completado → reseña. Historial / Pasaporte Hogar / Invitar según módulos.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Quiere cambiar reseña | Política: normalmente no se edita; escalar si hay error grave |
| Código referido inválido | Verificar vigencia; no inventar crédito |

---

## Script corto de cierre (cualquier caso cliente)

> “Revisé tu caso: [hecho]. El siguiente paso en la app es [acción]. Si es de pago/seguridad, ya lo derivé al equipo que corresponde. ¿Te quedó claro el siguiente paso?”
