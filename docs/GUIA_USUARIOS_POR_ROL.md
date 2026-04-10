# NWSPayFlow — Guía de uso por rol

La plataforma tiene tres roles. El menú lateral muestra solo las pantallas que tu usuario puede usar.

## Jerarquía

**Holder** → control global (aprobaciones, usuarios, reportes, políticas).  
**Cajero** → ejecuta pagos sobre solicitudes ya aprobadas y puede participar en aprobaciones si está asignado como aprobador.  
**Líder** → crea solicitudes de pago y ve solo su propia actividad.

---

## Líder

**Menú habitual:** Dashboard · Nueva solicitud · Historial · Reuniones · Mensajes · Configuración

| Qué hacer | Dónde |
|-----------|--------|
| Pedir un gasto | **Nueva solicitud**: moneda, monto, categoría, fecha requerida, descripción, **método de pago** (banco / Roblox / PayPal) y datos de cuenta, evidencias opcionales. Al enviar se crea la solicitud y, si adjuntas archivos, se suben como evidencia. |
| Ver el estado de tus solicitudes | **Historial** |
| Proponer reuniones con holders | **Reuniones** (crear; el holder confirma o cancela) |
| Mensajes internos | **Mensajes** (contactos disponibles: holders) |
| Perfil, contraseña, notificaciones | **Configuración** |

**Importante:** solo ves solicitudes **tuyas**, no las de otros líderes.

---

## Holder

**Menú habitual:** Dashboard · Aprobaciones · Pagos pendientes · Reuniones · Mensajes · Usuarios · Pagos ejecutados · Reportes · Configuración

| Qué hacer | Dónde |
|-----------|--------|
| Ver resumen y gráficos globales | **Dashboard** (métricas amplias solo para Holder) |
| Aprobar o rechazar solicitudes pendientes | **Aprobaciones** (rechazar exige comentario). Solo aplica si el sistema te asignó como aprobador para esa solicitud. |
| Marcar como pagada una solicitud ya aprobada | **Pagos pendientes**: sube comprobante o indica URL del comprobante. |
| Gestionar cuentas (líderes, cajeros, holders) | **Usuarios** |
| Ver todos los pagos completados | **Pagos ejecutados** |
| Informes y exportaciones | **Reportes**: vista previa, filtros, descarga Excel / HTML / PDF según pantalla |
| Reuniones que crean los líderes | **Reuniones** (confirmar, cancelar, completar) |
| Mensajes con cualquier usuario activo | **Mensajes** |
| Telegram (opcional) | **Configuración**: código de emparejamiento si tu cuenta puede generarlo; notificaciones |

**Telegram:** los holders con Telegram vinculado pueden usar el bot para flujos de aprobación y consulta según lo que tenga habilitado el administrador.

---

## Cajero

**Menú habitual:** Dashboard · Aprobaciones · Pagos pendientes · Historial · Mensajes · Configuración

| Qué hacer | Dónde |
|-----------|--------|
| Ver cola operativa (sin estadísticas globales de todo el sistema) | **Dashboard** |
| Aprobar o rechazar (si estás asignado como aprobador) | **Aprobaciones** |
| Ejecutar el pago físico/transferencia y registrar comprobante | **Pagos pendientes** sobre solicitudes en estado **Aprobado** |
| Consultar solicitudes con filtros | **Historial** (como cajero ves el listado según permisos del API; los líderes solo ven las propias) |
| Mensajes con holders | **Mensajes** |

**Notas:**

- El cajero **no** ve el menú de **Usuarios**, **Reportes** ni **Pagos ejecutados** como el Holder; el enfoque es la **ejecución de pagos** y la **aprobación** cuando corresponda.
- Las **estadísticas globales** del sistema están reservadas al rol **Holder** en el dashboard.

---

## Estados de una solicitud (todos los roles)

1. **Pendiente** — esperando aprobación.  
2. **Aprobado** — lista para que finanzas/cajero ejecute el pago.  
3. **Rechazado** — con comentario obligatorio del aprobador.  
4. **Pagado** — cerrada con comprobante (URL o archivo según flujo).

---

## Soporte

Problemas con archivos o enlaces rotos: en producción debe estar definida la URL pública de la API (`API_PUBLIC_URL`) y, detrás de un proxy, `TRUST_PROXY` según documentación de despliegue. Consulta con quien administra el servidor.
