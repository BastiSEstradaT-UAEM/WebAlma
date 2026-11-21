'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const modulePath=path.resolve(__dirname,'..');
process.env.TELEGRAM_BOT_TOKEN='123456:TEST_ONLY';
const storage=new Map();let registrado;let pdfAnalizados=0;
let ahora=new Date('2026-11-20T18:00:00.000Z'); // 12:00, CDMX
let liveConfig={precioBN:1,precioColor:5,horario:'07:00 a 19:00',aviso:'Abrimos el sábado a las 8',preciosValidados:true};
const dbMock={
  telegramStore:{get:async k=>storage.get(k),set:async(k,v)=>{storage.set(k,v)},delete:async k=>{storage.delete(k)}},
  getInventory:async()=>[{id:1,producto:'Cuaderno Scribe',categoria:'Cuadernos',precio:25,stock:10}],
  getConfig:async()=>({...liveConfig})
};
const dbId=require.resolve(path.join(modulePath,'db.js'));
require.cache[dbId]={id:dbId,filename:dbId,loaded:true,exports:dbMock};
const pdfId=require.resolve(path.join(modulePath,'pdf_cotizador.js'));
const realPDF=require(pdfId);
require.cache[pdfId].exports={...realPDF,
  descargarPDFTelegram:async()=>Buffer.from('%PDF-1.7...mock'),
  analizarPDF:async()=>{pdfAnalizados++;return {paginas:12,formato:'Carta'};}
};
const {createBot}=require('../bot');
const bot=createBot(async pedido=>{registrado=pedido;return {id:'17'}},{ahora:()=>ahora});
bot.botInfo={id:123456,is_bot:true,first_name:'WebAlma',username:'testWebAlmaBot'};
const requests=[];const {Telegram}=require(path.join(path.dirname(require.resolve('telegraf')),'telegram.js'));Telegram.prototype.callApi=async function(method,payload){requests.push({method,payload});return method==='sendMessage'?{message_id:66,chat:{id:42,type:'private'},text:payload.text}:true};
let n=1;const from={id:42,is_bot:false,first_name:'Basti'};const chat={id:42,type:'private'};
async function msg(text){const entities=text.startsWith('/')?[{type:'bot_command',offset:0,length:text.trim().split(' ')[0].length}]:undefined;await bot.handleUpdate({update_id:n++,message:{message_id:n,date:1,from,chat,text,entities}});}
async function cb(data){await bot.handleUpdate({update_id:n++,callback_query:{id:String(n),from,message:{message_id:66,date:1,chat},chat_instance:'xyz',data}});}
async function doc(){await bot.handleUpdate({update_id:n++,message:{message_id:n,date:1,from,chat,document:{file_id:'ABCD_1234',file_name:'Tarea.pdf',mime_type:'application/pdf',file_size:500}}});}
(async()=>{
  await msg('/start');
  const bienvenida=requests.find(r=>r.method==='sendMessage');
  assert.ok(bienvenida.payload.text.includes('¿Qué necesitas hoy?'),'Bienvenida breve durante el horario');
  assert.ok(bienvenida.payload.text.startsWith('📘 Papelería universitaria UAEM Valle de Chalco 🦆💚💛'),'Encabezado sin WebAlma y con mascota y corazones');
  assert.ok(bienvenida.payload.text.includes('¡Hola, Basti! Bienvenido'),'Saludo con el nombre público de Telegram');
  assert.ok(!bienvenida.payload.text.includes('📢 Aviso:'),'Avisos heredados sin vigencia se ocultan del saludo');
  assert.ok(!bienvenida.payload.text.includes('Tarifas por cara'),'El menú no repite todas las tarifas');
  const etiquetas=bienvenida.payload.reply_markup?.inline_keyboard?.flat().map(b=>b.text)||[];
  assert.equal(etiquetas.length,7,'El menú incluye los siete accesos solicitados');
  assert.ok(!etiquetas.some(s=>/Horarios y avisos/i.test(s)),'Sin botón Horarios y avisos');
  assert.ok(etiquetas.includes('💰 Tarifas')&&etiquetas.includes('✅ Finalizar pedido'),'Se preservan funciones principales');
  await cb('informacion');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('7:00 a. m. – 7:00 p. m.')),'Los horarios aparecen en la sección adecuada');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('Sin avisos especiales vigentes')),'Los avisos heredados tampoco aparecen en consulta de horarios');
  await cb('tarifas');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('$5.00')),'La tarifa aparece al solicitarla');
  liveConfig={...liveConfig,precioBN:2,precioColor:4,horario:'09:00 a 17:00',aviso:'Hoy cerramos antes',
    horarioAvisoHasta:'2026-11-21T18:00:00Z',avisoHasta:'2026-11-21T18:00:00Z'};
  await cb('inicio');
  assert.ok(requests.at(-1)?.payload?.text?.includes('🕒 Horario actualizado: 9:00 a. m. – 5:00 p. m.'),'Cambio reciente de horario visible');
  assert.ok(requests.at(-1)?.payload?.text?.includes('Hoy cerramos antes'),'Avisos especiales vigentes visibles en bienvenida');
  await cb('informacion');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('Hoy cerramos antes')),'Aviso vigente en consulta de horarios');
  liveConfig={...liveConfig,avisoHasta:'2026-11-20T17:00:00Z',horarioAvisoHasta:'2026-11-20T17:00:00Z'};
  await cb('inicio');
  assert.ok(!requests.at(-1)?.payload?.text?.includes('📢 Aviso:'),'Aviso especial caducado no se muestra');
  assert.ok(!requests.at(-1)?.payload?.text?.includes('Horario actualizado:'),'Aviso de horario caducado no se muestra');
  liveConfig={...liveConfig,avisoHasta:null,horarioAvisoHasta:null};
  await cb('inicio');
  assert.ok(!requests.at(-1)?.payload?.text?.includes('📢 Aviso:'),'Avisos inactivos permanecen ocultos');
  await cb('tarifas');
  assert.ok(requests.some(r=>r.method==='sendMessage'&&String(r.payload.text).includes('$4.00')),'Las tarifas reflejan los cambios en PostgreSQL');
  // Recuperar tarifas iniciales para el caso PDF de cotización existente.
  liveConfig={precioBN:1,precioColor:5,horario:'07:00 a 19:00',aviso:'',preciosValidados:false};
  await cb('pdf_inicio');await doc();
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
  assert.equal(pdfAnalizados,1,'El documento de prueba se analizó una sola vez');
  // Fuera de horario se ignoran incluso botones antiguos, mensajes y PDFs.
  ahora=new Date('2026-11-21T04:00:00.000Z'); // 22:00, Ciudad de México
  const before=requests.length,previousOrder=registrado;
  await msg('/start');
  await msg('2 cuadernos');
  await doc();
  await cb('productos');
  await cb('comprar');
  const closed=requests.slice(before);
  const notices=closed.filter(r=>r.method==='sendMessage');
  assert.equal(notices.length,5,'Cada intento recibe un aviso de cierre');
  assert.ok(notices.every(r=>r.payload.text.includes('En este momento no estamos disponibles. ¡Nos vemos pronto!')),'Texto de cierre con ortografía');
  assert.ok(notices.every(r=>!r.payload.reply_markup?.inline_keyboard?.length),'Ningún mensaje de cierre muestra menú');
  assert.ok(closed.some(r=>r.method==='answerCallbackQuery'),'Los botones antiguos se reconocen sin ejecutar acciones');
  assert.equal(pdfAnalizados,1,'Fuera de horario no se analiza el PDF');
  assert.equal(registrado,previousOrder,'Fuera del horario no se registra un pedido');
  // Al abrir de nuevo, el mismo chat recupera el menú sin reiniciar Render.
  ahora=new Date('2026-11-21T17:00:00.000Z'); // 11:00, Ciudad de México
  const lastOpen=requests.length;
  await msg('/start');
  const reopened=requests.slice(lastOpen).find(r=>r.method==='sendMessage');
  assert.ok(reopened.payload.text.includes('¿Qué necesitas hoy?'));
  assert.ok(reopened.payload.reply_markup?.inline_keyboard?.length>0);
  console.log('Flujo Telegram simulado: apertura/cierre, horarios, tarifas, PDF, carrito y pedido OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
