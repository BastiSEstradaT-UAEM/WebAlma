'use strict';

// Control de transiciones. Nunca se permite aceptar/rechazar dos veces el mismo pedido.
const OPERACIONES=Object.freeze({
  aceptar:{desde:'pendiente',hacia:'aceptado',mensaje:id=>
    `✅ WebAlma · Pedido #${id} ACEPTADO\n\nLa papelería aceptó tu solicitud. Puedes acudir al mostrador según las indicaciones del personal.\n\nImportante: el pedido no se considera pagado ni preparado automáticamente.`},
  rechazar:{desde:'pendiente',hacia:'rechazado',mensaje:id=>
    `❌ WebAlma · Pedido #${id} RECHAZADO\n\nLa papelería no pudo aceptar tu solicitud. Puedes enviar un nuevo pedido o consultar directamente en el mostrador. No se realizó ningún cobro.`},
  entregar:{desde:'aceptado',hacia:'entregado',mensaje:id=>
    `📦 WebAlma · Pedido #${id} ENTREGADO\n\nLa papelería ha marcado tu solicitud como entregada. ¡Gracias por utilizar WebAlma!`}
});

async function procesarEstadoPedido({id,accion,cambiarEstado,enviarMensaje}){
  const op=OPERACIONES[accion];
  if(!Number.isSafeInteger(id)||id<1||!op) return {ok:false,motivo:'datos_invalidos'};
  const pedido=await cambiarEstado(id,op.desde,op.hacia);
  if(!pedido) return {ok:false,motivo:'pedido_no_encontrado'};
  if(!pedido.telegramId) return {ok:true,estado:op.hacia,notificacion:'sin_destinatario'};
  try {
    if(typeof enviarMensaje!=='function')throw new Error('Bot no disponible');
    await enviarMensaje(pedido.telegramId,op.mensaje(id));
    return {ok:true,estado:op.hacia,notificacion:'enviada'};
  } catch(error) {
    // El estado queda guardado en PostgreSQL; no afirmamos que se notificó.
    console.warn('WebAlma: no se pudo notificar una decisión a Telegram.',error.code||error.name);
    return {ok:true,estado:op.hacia,notificacion:'fallida'};
  }
}
module.exports={OPERACIONES,procesarEstadoPedido};
