# Procedimientos — Admin y Soporte

Mirada: operaciones, pagos, confianza y reclamos.  
Prefijo: `{ADMIN_BASE}` = `ADMIN_PATH` (secreto en producción).  
**Nunca** publicar la URL admin en chats públicos ni Sofía.

---

## Principios ops

1. Identificar al usuario (email / ID solicitud) antes de actuar.  
2. Dejar nota en dossier / security_logs cuando corresponda.  
3. Separar colas: **servicio**, **dinero**, **seguridad**, **KYC/contrato**.  
4. Founder gates: boletas materiales altas, publish Florencia, decision pack Clara.  
5. MFA obligatorio en producción.

---

## AD-01 · Acceso admin (login + MFA)

### Happy path
Login path secreto → password → TOTP → dashboard.

### Problemas

| Problema | Actuación |
|----------|-----------|
| IP bloqueada | Revisar allowlist; no desactivar MFA “por apuro” |
| MFA perdido | Proceso founder de recovery documentado internamente; no por Sofía |
| Alguien pide la URL admin | Negar; “solo el equipo con acceso autorizado” |

---

## AD-02 · Inbox / dashboard

### Colas típicas
Transferencias pendientes · dispatch sin socio · contratos · payouts · reembolsos · reclamos · Aland `awaiting_admin` · boletas founder.

### Procedimiento diario (soporte)
1. Abrir dashboard.  
2. Vaciar **seguridad S1** primero.  
3. Pagos (transfer / refunds).  
4. Contratos/KYC bloqueando socios.  
5. Chats Sofía esperando admin.  
6. Resto.

---

## AD-03 · Solicitudes: caso 360° y asignación manual

### Happy path
Ver caso → socios elegibles → asignar manual si el muro no liquida.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Sin elegibles | Ampliar búsqueda / contactar socios offline / ofrecer reembolso al cliente |
| Técnico atrapado | Reasignar vía socio o liberar según reglas (antes de en_sitio+) |
| Cliente pide “el mismo de siempre” | Solo si hay historial y disponibilidad; no saltarse KYC |

---

## AD-04 · Pagos: transferencia, ajuste, reembolso, payout

### Happy path
- Transfer cliente: verificar comprobante → aprobar → activa solicitud.  
- Reembolso: `requested` → `processing` → `paid` / `failed`.  
- Payout socio: marcar pagado según calendario.  

### Problemas

| Problema | Actuación |
|----------|-----------|
| Doble cobro | Congelar; revisar MP/pasarela; reembolso del excedente; nota en caso |
| Cliente dice “no veo devolución” | Confirmar estado interno; explicar plazos banco; no marcar `paid` sin evidencia |
| Transfer falsa | Rechazar; security_log; posible bloqueo |
| Demo vs prod | No aprobar pagos demo en producción |

**Script cliente (pagos):**  
“El reembolso lo inicia Fandez el siguiente día hábil al mismo medio. La fecha en que lo ves en cartola la define tu banco.”

---

## AD-05 · Contratos y KYC

### Acciones
`approve` · `reject` · `needs_info` · suspender.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Docs dudosos | needs_info con lista clara; no aprobar “a ojo” |
| Socio insiste por fuera de la app | Traer todo al panel; dejar rastro |
| Reject | Socio queda offline; mensaje claro del motivo |

---

## AD-06 · Reclamos y seguridad (S1/S2/S3)

### Fuente
SOS cliente/técnico · cancel_safety · Sofía personal_safety · reclamos calidad.

### Procedimiento
1. Leer categoría + notas + pedido + chat + GPS.  
2. Severidad (`docs/SEGURIDAD-ALERTAS.md`).  
3. S1: priorizar 133 si aplica · congelar cuentas si riesgo · conservar evidencia.  
4. No auto-llamar emergencias desde la app: **orientar** al usuario.  
5. Actualizar estado del reclamo; comunicar al afectado con cuidado.

| Severidad | Acción |
|-----------|--------|
| S1 | Inmediato: seguridad + bloqueo preventivo si corresponde |
| S2 | Incidente + revisión 24–72 h |
| S3 | Reclamo estándar calidad/daño |

---

## AD-07 · Sofía / Aland (cola admin)

### Happy path
Conversaciones `awaiting_admin` → reply → close.

### Problemas

| Problema | Actuación |
|----------|-----------|
| Prompt injection / abuso | Ya hay alerta; no seguir el jailbreak; bloquear usuario si repetido |
| Timeout socio | Tomar el caso o reasignar a otro canal |
| Pagos mezclados en chat | Resolver en cola pagos; no improvisar montos |

---

## AD-08 · Usuarios, dossier, email forzado

### Uso
Buscar usuario · ver timeline · nota soporte · reenviar/forzar verificación email (con criterio).

### Problemas
Forzar verificación solo con identidad confirmada (evitar account takeover).

---

## AD-09 · DSAR (derechos ARCO+)

### Happy path
Buscar → exportar / anonimizar con confirmación `ANONIMIZAR`.

### Problemas
Plazos legales; coordinar con DPD (`privacidad@`); no borrar evidencia de fraude/seguridad si hay obligación de retención.

---

## AD-10 · Precios, módulos, cobertura, alertas sitio

Cambios de catálogo/precios: notificar por correo según Términos; pedidos ya pagados mantienen condiciones de esa operación.

---

## AD-11 · Informes Clara / Florencia

- Clara: métricas + ASK al founder; **nunca mueve plata**.  
- Florencia: draft OK; **approve/publish solo founder**.

---

## AD-12 · Backups y modo app

Restore solo con confirmación explícita y procedimiento de desastre (`docs/BACKUP-GITHUB.md`).  
No cambiar `APP_MODE` en prod sin founder.

---

## Matriz rápida: ¿quién atiende?

| Síntoma | Dueño |
|---------|--------|
| “No hay técnico” | Ops / dispatch |
| “Me cobraron / reembolso” | Pagos |
| SOS / acoso / amenaza | Seguridad (S1/S2) |
| Socio no puede online | KYC/Contrato/Equipo |
| Sofía caída | Tech + fallback email |
| Boleta materiales alta | Founder review |
| Quiero borrar mis datos | DSAR / DPD |
