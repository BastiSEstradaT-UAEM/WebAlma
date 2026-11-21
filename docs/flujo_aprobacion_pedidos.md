# WebAlma · Aceptación y rechazo de pedidos

## Objetivo
Las solicitudes enviadas desde Telegram se registran con estado `pendiente`. La administradora o auxiliar autenticada puede **Aceptar** o **Rechazar** desde el panel. Al aceptar, se habilita **Marcar entregado**; al rechazar, la solicitud deja de figurar entre los pedidos activos, pero su registro permanece en PostgreSQL.

## Migración previa y respaldos
1. Respaldar PostgreSQL desde DBeaver y comprobar que el respaldo se puede recuperar.
2. La versión actual ejecuta automáticamente la migración idempotente de `migracion_estados.js` antes de abrir el servidor; `sql/03_flujo_aprobacion_pedidos.sql` permanece disponible para ejecución manual en DBeaver. El cambio no elimina registros ni productos y conserva `cancelado`.
3. Consultar `SELECT estado, count(*) FROM public.pedidos GROUP BY estado;` y confirmar que no hubo cambios inesperados.

**No ejecutar la migración manual después de que la versión nueva ya la haya aplicado automáticamente sin comprobar antes la restricción.** Si falla la migración, el servidor no abrirá el puerto y se conservará el esquema anterior mediante `ROLLBACK`.

## Rutas del backend
- `POST /pedidos/:id/aceptar`: `pendiente → aceptado`.
- `POST /pedidos/:id/rechazar`: `pendiente → rechazado`.
- `POST /completar_pedido/:id`: `aceptado → entregado`.

Requieren sesión autenticada y token CSRF. El cambio se efectúa con un `UPDATE ... WHERE estado=...` atómico, para impedir decisiones duplicadas o contradictorias.

## Avisos de Telegram
Se envía una notificación al identificador Telegram registrado con el pedido. El bot confirma aceptación, rechazo o entrega; **no registra pagos ni prepara productos automáticamente**. Si el cliente no tiene identificador de Telegram o la API impide el envío, el estado permanece guardado y el panel muestra una advertencia. No hay reintentos automáticos en esta versión.

## Verificación de la interfaz
1. Crear un pedido de prueba en un chat privado de Telegram. Debe aparecer **Por aceptar** y mostrar los botones **Aceptar pedido** y **Rechazar pedido**.
2. Aceptar. La tarjeta debe quedar **Aceptado**, habilitar **Marcar entregado** y Telegram debe recibir la confirmación.
3. Marcar entregado. El pedido desaparece de la lista activa; no descuenta inventario.
4. Crear otro pedido y rechazarlo. Confirmar la acción en el navegador. Verificar mensaje de rechazo en Telegram.
5. Intentar repetir el estado con una solicitud anterior: el backend no debe permitir una segunda decisión.
6. Confirmar que el cotizador PDF, la descarga de archivos, inventario y reportes continúan funcionando.

## Publicación
Trabajar mediante rama y solicitud de cambios. Ejecutar `npm ci` y `npm run check`. Fusionar a `main` tras las pruebas; al desplegarse, la aplicación actualizará PostgreSQL antes de aceptar conexiones. Verificar la restricción y probar el flujo de punta a punta. En Render, desplegar el último commit de `main` y comprobar `Live`, `/health` y el webhook.

## Reversión
Antes de volver al backend anterior, revisar los pedidos que ya estén en estado `aceptado` o `rechazado`. **No restaurar la restricción anterior sin reconciliar esos estados**, o la migración de reversión fallará.
