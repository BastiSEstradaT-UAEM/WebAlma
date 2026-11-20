'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const modulePath=path.resolve(__dirname,'..');
process.env.TELEGRAM_BOT_TOKEN='123456:TEST_ONLY';
const storage=new Map();let registrado;
const dbMock={
  telegramStore:{get:async k=>storage.get(k),set:async(k,v)=>{storage.set(k,v)},delete:async k=>{storage.delete(k)}},
  getInventory:async()=>[{id:1,producto:'Cuaderno Scribe',categoria:'Cuadernos',precio:25,stock:10}],
  getConfig:async()=>({precioBN:1,precioColor:5})
};
const dbId=require.resolve(path.join(modulePath,'db.js'));
require.cache[dbId]={id:dbId,filename:dbId,loaded:true,exports:dbMock};
const pdfId=require.resolve(path.join(modulePath,'pdf_cotizador.js'));
const realPDF=require(pdfId);
require.cache[pdfId].exports={...realPDF,
  descargarPDFTelegram:async()=>Buffer.from('%PDF-1.7...mock'),
  analizarPDF:async()=>({paginas:12,formato:'Carta'})
};
const {createBot}=require('../bot');
const bot=createBot(async pedido=>{registrado=pedido;return {id:'17'}});
bot.botInfo={id:123456,is_bot:true,first_name:'WebAlma',username:'testWebAlmaBot'};
const requests=[];const {Telegram}=require(path.join(path.dirname(require.resolve('telegraf')),'telegram.js'));Telegram.prototype.callApi=async function(method,payload){requests.push({method,payload});return method==='sendMessage'?{message_id:66,chat:{id:42,type:'private'},text:payload.text}:true};
let n=1;const from={id:42,is_bot:false,first_name:'Basti'};const chat={id:42,type:'private'};
async function msg(text){await bot.handleUpdate({update_id:n++,message:{message_id:n,date:1,from,chat,text}});}
async function cb(data){await bot.handleUpdate({update_id:n++,callback_query:{id:String(n),from,message:{message_id:66,date:1,chat},chat_instance:'xyz',data}});}
async function doc(){await bot.handleUpdate({update_id:n++,message:{message_id:n,date:1,from,chat,document:{file_id:'ABCD_1234',file_name:'Tarea.pdf',mime_type:'application/pdf',file_size:500}}});}
(async()=>{
  await msg('/start');await cb('pdf_inicio');await doc();
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('12')));
  await cb('pdf_tipo:color');await cb('pdf_copias:2');await cb('pdf_caras:doble');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('$120')));
  await cb('pdf_agregar');await cb('carrito');await cb('checkout');await cb('comprar');
  assert.ok(registrado,'Pedido creado');
  assert.equal(registrado.articulos[0].cantidad,24);
  assert.equal(registrado.articulos[0].subtotal,120);
  assert.equal(registrado.articulos[0].archivo.paginas,12);
  assert.equal(registrado.articulos[0].archivo.dobleCara,true);
  assert.equal(registrado.articulos[0].archivo.fileId,'ABCD_1234');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('17')));
  await cb('carrito');assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('vacío')));
  console.log('Flujo Telegram simulado: PDF, cotización, carrito, registro, vaciado OK (analizador PDF simulado).');
})().catch(e=>{console.error(e);process.exitCode=1;});
