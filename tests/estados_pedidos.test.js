'use strict';
const assert=require('node:assert/strict');
const {OPERACIONES,procesarEstadoPedido}=require('../pedidos_estado');
(async()=>{
  for(const accion of ['aceptar','rechazar','entregar']){
    let cambio,envio;
    const r=await procesarEstadoPedido({id:42,accion,
      cambiarEstado:async(id,desde,hacia)=>{cambio={id,desde,hacia};return {id:'42',telegramId:'12345678'};},
      enviarMensaje:async(id,mensaje)=>{envio={id,mensaje};}});
    assert.equal(r.ok,true);
    assert.equal(r.estado,OPERACIONES[accion].hacia);
    assert.equal(r.notificacion,'enviada');
    assert.equal(cambio.desde,OPERACIONES[accion].desde);
    assert.equal(cambio.hacia,OPERACIONES[accion].hacia);
    assert.equal(envio.id,'12345678');
    assert.match(envio.mensaje,/42/);
  }
  // La identidad visual cambia solo el encabezado; no modifica estados ni notificaciones.
  assert.equal(OPERACIONES.aceptar.mensaje(42).split('\n')[0], '🦆💚💛 · Pedido #42 ACEPTADO');
  assert.equal(OPERACIONES.entregar.mensaje(42).split('\n')[0], '🦆💚💛 · Pedido #42 ENTREGADO');
  assert.equal(OPERACIONES.rechazar.mensaje(42).split('\n')[0], '❌ WebAlma · Pedido #42 RECHAZADO');
  assert.match(OPERACIONES.aceptar.mensaje(42), /no se considera pagado ni preparado/);
  assert.match(OPERACIONES.entregar.mensaje(42), /¡Gracias por utilizar WebAlma!/);
  let avisos=0;
  const duplicado=await procesarEstadoPedido({id:42,accion:'aceptar',
    cambiarEstado:async()=>null,enviarMensaje:async()=>{avisos++;}});
  assert.equal(duplicado.ok,false);assert.equal(avisos,0);
  const sinDestinatario=await procesarEstadoPedido({id:42,accion:'rechazar',
    cambiarEstado:async()=>({id:42,telegramId:null}),enviarMensaje:async()=>{avisos++;}});
  assert.equal(sinDestinatario.notificacion,'sin_destinatario');assert.equal(avisos,0);
  const falla=await procesarEstadoPedido({id:42,accion:'aceptar',
    cambiarEstado:async()=>({id:42,telegramId:'12345678'}),enviarMensaje:async()=>{throw Object.assign(new Error('Bloqueado'),{code:403});}});
  assert.equal(falla.ok,true);assert.equal(falla.notificacion,'fallida');
  let cambios=0;
  const invalido=await procesarEstadoPedido({id:0,accion:'rechazar',cambiarEstado:async()=>{cambios++;}});
  assert.equal(invalido.ok,false);assert.equal(cambios,0);
  console.log('Estados de pedidos: aceptar, rechazar, entregar, duplicados y avisos OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
