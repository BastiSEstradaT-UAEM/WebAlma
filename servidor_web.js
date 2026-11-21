'use strict';
require('dotenv').config();
const express=require('express');
const session=require('express-session');
const http=require('http');
const path=require('path');
const crypto=require('crypto');
const {Readable}=require('node:stream');
const {Server}=require('socket.io');
const db=require('./db');
const {createBot}=require('./bot');
const {validarCuenta}=require('./cuentas');
const {parseHorario,validarHorario}=require('./horario_atencion');
const {asegurarEstadosPedido}=require('./migracion_estados');
const {procesarEstadoPedido}=require('./pedidos_estado');

for (const name of ['DATABASE_URL','SESSION_SECRET','ADMIN_USER','ADMIN_PASS']) {
  if (!process.env[name]) throw new Error(`Falta ${name} en las variables de entorno.`);
}
if (process.env.SESSION_SECRET.length<24) throw new Error('SESSION_SECRET debe tener mínimo 24 caracteres.');
const PORT=Number(process.env.PORT||3000);
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:false,limit:'40kb'}));
app.use(express.json({limit:'100kb'}));
app.use('/public',express.static(path.join(__dirname,'public'),{maxAge:'1h'}));
const sessionMiddleware=session({secret:process.env.SESSION_SECRET,
  store:new db.PgSessionStore(),resave:false,saveUninitialized:false,name:'webalma.sid',
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*3600000}});
app.use(sessionMiddleware);
app.use((req,res,next)=>{req.session.csrf??=crypto.randomBytes(24).toString('hex');next();});
const server=http.createServer(app);
const io=new Server(server);
io.engine.use(sessionMiddleware);
io.use((socket,next)=>{
  const id=socket.request.session?.usuario?.id;
  db.getActiveUser(id).then(user=>user?next():next(new Error('No autorizado'))).catch(next);
});
function desconectarUsuario(id){
  for(const socket of io.sockets.sockets.values()){
    if(Number(socket.request.session?.usuario?.id)===Number(id))socket.disconnect(true);
  }
}
const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
const money=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;};
const nonnegInt=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;};
function same(a,b){const x=crypto.createHash('sha256').update(String(a)).digest();const y=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(x,y);}
async function auth(req,res,next){
  if(!req.session.usuario)return res.redirect('/');
  try{
    const fresh=await db.getActiveUser(req.session.usuario.id);
    if(!fresh)return req.session.destroy(()=>res.redirect('/'));
    req.session.usuario=fresh;
    res.set('Cache-Control','private, no-store');
    next();
  }catch(e){next(e);}
}
function admin(req,res,next){if(req.session.usuario?.rol==='administradora')return next();res.status(403).send('Acceso reservado a la propietaria.');}
function csrf(req,res,next){const a=String(req.body._csrf||''),b=String(req.session.csrf||'');
  if(!a||a.length!==b.length||!same(a,b))return res.status(403).send('Formulario vencido o inválido.');next();}
// Las confirmaciones se presentan desde el servidor: deben ser visibles incluso si JS no carga.
const RESULT_MESSAGES=Object.freeze({
  producto_agregado:'Producto agregado al catálogo.',
  producto_actualizado:'Producto actualizado correctamente.',
  producto_archivado:'Producto retirado del catálogo. Su historial se conserva.',
  producto_no_encontrado:'El producto ya no está disponible en el catálogo.',
  movimiento_registrado:'Movimiento de inventario registrado.',
  impresion_registrada:'Servicio de impresión registrado.',
  pedido_entregado:'Pedido marcado como entregado.',
  pedido_aceptado:'Pedido aceptado. Se notificó al estudiante por Telegram.',
  pedido_rechazado:'Pedido rechazado. Se notificó al estudiante por Telegram.',
  pedido_aceptado_sin_aviso:'Pedido aceptado, pero Telegram no pudo entregar el aviso.',
  pedido_rechazado_sin_aviso:'Pedido rechazado, pero Telegram no pudo entregar el aviso.',
  pedido_entregado_sin_aviso:'Pedido entregado; no se pudo enviar aviso por Telegram.',
  pedido_aceptado_sin_destinatario:'Pedido aceptado; no hay cuenta de Telegram asociada.',
  pedido_rechazado_sin_destinatario:'Pedido rechazado; no hay cuenta de Telegram asociada.',
  pedido_entregado_sin_destinatario:'Pedido entregado; no hay cuenta de Telegram asociada.',
  configuracion_guardada:'Configuración guardada correctamente.',
  horario_invalido:'Selecciona una hora de apertura y otra de cierre diferentes, en formato de 24 horas. El horario anterior no se modificó.',
  usuario_creado:'Cuenta de acceso creada correctamente.',
  usuario_actualizado:'Los datos de acceso se actualizaron. Las sesiones anteriores se cerraron.',
  usuario_eliminado:'Cuenta desactivada. No podrá volver a iniciar sesión.',
  usuario_duplicado:'Ese nombre de usuario ya existe; elige otro.',
  usuario_no_encontrado:'La cuenta ya no está activa o no existe.',
  clave_actual_incorrecta:'La contraseña actual de la administradora no coincide.',
  auto_cambio_prohibido:'No puedes cambiar tu propia cuenta a auxiliar.',
  auto_baja_prohibida:'No puedes desactivar la cuenta con la que has iniciado sesión.',
  ultimo_admin:'Debe quedar al menos una cuenta administradora activa.',
  cuenta_datos_invalidos:'Revisa los datos de la cuenta. Usuario: 3 a 32 caracteres (letras, números, punto, guion). Contraseña nueva: mínimo 12 caracteres.',

  datos_invalidos:'Revisa los datos del formulario.',
  movimiento_invalido:'Movimiento inválido: revisa existencias y cantidad.',
  lotes_inconsistentes:'Los lotes no coinciden con el inventario. Revisa la información.',
  pedido_no_encontrado:'El pedido ya no está pendiente.'
});
function go(res,code,section='inventario'){res.redirect(`/gestor?seccion=${encodeURIComponent(section)}&resultado=${encodeURIComponent(code)}`);}
function todayMX(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p=k=>parts.find(x=>x.type===k).value;return `${p('year')}-${p('month')}-${p('day')}`;}
function weekBounds(date=todayMX()){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};}
function report(logs,{start,end}){const data={bn:{trabajos:0,hojas:0,ingresos:0},color:{trabajos:0,hojas:0,ingresos:0},total:0};
  for(const r of logs.filter(x=>x.fecha>=start&&x.fecha<=end)){
    const k=r.tipo==='color'?'color':'bn';data[k].trabajos++;data[k].hojas+=Number(r.cantidad||0);data[k].ingresos+=Number(r.total||0);data.total+=Number(r.total||0);
  }return data;}
function csvReport(data){return '\ufeffConcepto,Trabajos,Hojas,Ingresos MXN\r\n'+
  `Blanco y negro,${data.bn.trabajos},${data.bn.hojas},${data.bn.ingresos.toFixed(2)}\r\n`+
  `Color,${data.color.trabajos},${data.color.hojas},${data.color.ingresos.toFixed(2)}\r\n`+
  `Total,,${data.bn.hojas+data.color.hojas},${data.total.toFixed(2)}\r\n`;}
const attempts=new Map();
app.get('/health',async (_req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok'});}catch(e){res.status(503).json({status:'db_unavailable'});}});
app.get('/',(req,res)=>req.session.usuario?res.redirect('/gestor'):res.render('login',{error:req.query.error==='1',csrf:req.session.csrf}));
app.post('/login',csrf,async(req,res)=>{
  const ip=req.ip||'unknown',now=Date.now();const a=attempts.get(ip)||{n:0,until:0};
  if(a.until>now)return res.status(429).send('Demasiados intentos. Vuelve a intentarlo en 15 minutos.');
  const user=clean(req.body.username,80),pass=String(req.body.password||'');
  const account=await db.verifyLogin(user,pass);
  if(!account){a.n++;if(a.n>=6){a.until=now+15*60*1000;a.n=0;} attempts.set(ip,a);return res.redirect('/?error=1');}
  attempts.delete(ip);
  req.session.regenerate(e=>{if(e)return res.status(500).send('Error de sesión');
    req.session.usuario=account;
    req.session.csrf=crypto.randomBytes(24).toString('hex');res.redirect('/gestor');});
});
app.post('/logout',auth,csrf,(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.get('/gestor',auth,async(req,res)=>{
  // Bloquear en el servidor las secciones exclusivas, aunque se intente entrar por URL.
  if(req.session.usuario.rol!=='administradora'&&['configuracion','reportes'].includes(clean(req.query.seccion,24)))
    return res.redirect('/gestor?seccion=resumen');
  const [inventario,pedidosActivos,impresiones,config,usuariosPersonal]=await Promise.all([db.getInventory(),db.getOrders(),db.getImpressions(),db.getConfig(),req.session.usuario.rol==='administradora'?db.listUsers():Promise.resolve([])]);
  const bounds=weekBounds();const lowStock=inventario.filter(x=>x.stock<=(x.stock_minimo_sugerido??config.stockMinimo));
  const reporteActividad=await db.getReportActivity(bounds,todayMX());
  res.render('gestor',{inventario,pedidosActivos,lowStock,config,horarioConfigurado:parseHorario(config.horario),reporteActividad,usuariosPersonal,usuario:req.session.usuario,
    csrf:req.session.csrf,bounds,report:report(impresiones,bounds),recientes:impresiones.slice(-8).reverse(),
    totalUnidades:inventario.reduce((s,p)=>s+p.stock,0),
    valorEstimado:inventario.reduce((s,p)=>s+p.precio*p.stock,0),
    seccion:clean(req.query.seccion,24),resultado:clean(req.query.resultado,80),
    mensajeResultado:Object.hasOwn(RESULT_MESSAGES,clean(req.query.resultado,80))
      ? RESULT_MESSAGES[clean(req.query.resultado,80)]
      : (req.query.resultado?'Operación terminada.':'')});
});
app.post('/inventario/nuevo',auth,admin,csrf,async(req,res)=>{
  const data={producto:clean(req.body.producto,150),categoria:clean(req.body.categoria,80)||'Otros',
    precio:money(req.body.precio),stock:nonnegInt(req.body.stock),minimo:nonnegInt(req.body.minimo),
    existencia_confirmada:req.body.existencia_confirmada==='si',precio_confirmado:req.body.precio_confirmado==='si'};
  if(!data.producto||data.precio===null||data.stock===null||data.minimo===null)return go(res,'datos_invalidos');
  await db.createProduct(data);io.emit('inventario_actualizado');go(res,'producto_agregado');
});
app.post('/inventario/:id/editar',auth,admin,csrf,async(req,res)=>{
  const data={producto:clean(req.body.producto,150),categoria:clean(req.body.categoria,80)||'Otros',
    precio:money(req.body.precio),minimo:nonnegInt(req.body.minimo),
    existencia_confirmada:req.body.existencia_confirmada==='si',precio_confirmado:req.body.precio_confirmado==='si'};
  if(!/^\d+$/.test(req.params.id)||!data.producto||data.precio===null||data.minimo===null)return go(res,'datos_invalidos');
  const ok=await db.editProduct(Number(req.params.id),data);
  if(!ok)return go(res,'datos_invalidos');io.emit('inventario_actualizado');go(res,'producto_actualizado');
});
// Solo la propietaria puede retirar un producto. No se hace DELETE físico.
app.post('/inventario/:id/archivar',auth,admin,csrf,async(req,res)=>{
  const raw=String(req.params.id);
  const id=Number(raw);
  if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(id))
    return go(res,'datos_invalidos');
  const archived=await db.archiveProduct(id);
  if(!archived)return go(res,'producto_no_encontrado');
  io.emit('inventario_actualizado');
  return go(res,'producto_archivado');
});
app.post('/inventario/:id/movimiento',auth,admin,csrf,async(req,res)=>{
  const cantidad=nonnegInt(req.body.cantidad),tipo=req.body.tipo;
  if(!/^\d+$/.test(req.params.id)||!cantidad||!['entrada','salida'].includes(tipo))return go(res,'movimiento_invalido');
  try{
    const out=await db.moveProduct(Number(req.params.id),tipo,cantidad,clean(req.body.nota,180),req.session.usuario.id,req.session.usuario.rol);
    if(out.error)return go(res,out.error);
  }catch(e){if(e.code==='LOTES_INCONSISTENTES')return go(res,'lotes_inconsistentes');throw e;}
  io.emit('inventario_actualizado');go(res,'movimiento_registrado');
});

// API opcional de compatibilidad; el bot integrado llama directamente a createOrder().
app.post('/api/nuevo_pedido',async(req,res)=>{
  const secret=process.env.BOT_API_KEY;
  if(!secret||!same(req.get('authorization')||'',`Bearer ${secret}`))return res.status(401).json({error:'No autorizado'});
  const cliente=clean(req.body.cliente,100)||'Estudiante',total=money(req.body.total);
  const articulos=Array.isArray(req.body.articulos)?req.body.articulos.slice(0,40):[];
  const parsed=articulos.map(a=>typeof a==='string'?{descripcion:clean(a,200),productoId:null,cantidad:1,precioUnitario:0,subtotal:0}:{
    descripcion:clean(a.descripcion,200),productoId:Number.isSafeInteger(a.productoId)?a.productoId:null,
    cantidad:nonnegInt(a.cantidad),precioUnitario:money(a.precioUnitario),subtotal:money(a.subtotal)});
  if(total===null||!parsed.length||parsed.some(a=>!a.descripcion||!a.cantidad||a.precioUnitario===null||a.subtotal===null))return res.status(400).json({error:'Datos inválidos'});
  const order=await db.createOrder({cliente,total,articulos:parsed});io.emit('alerta_nuevo_pedido',order);
  return res.status(201).json({success:true,pedidoId:order.id});
});
// El documento se obtiene desde Telegram al solicitarlo, sin exponer BOT_TOKEN al navegador.
// Solo el personal autenticado puede descargar un archivo asociado a un pedido.
app.get('/pedidos/:id/archivos/:doc/descargar',auth,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id)||!/^\d+$/.test(req.params.doc))return res.sendStatus(400);
  const archivo=await db.getOrderDocument(Number(req.params.id),Number(req.params.doc));
  if(!archivo)return res.sendStatus(404);
  if(!bot)return res.status(503).send('Servicio de documentos temporalmente no disponible.');
  try{
    const enlace=await bot.telegram.getFileLink(archivo.telegram_file_id);
    const u=new URL(String(enlace));
    if(u.protocol!=='https:'||u.hostname!=='api.telegram.org')return res.sendStatus(502);
    const respuesta=await fetch(u,{signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!respuesta.ok||!respuesta.body)return res.sendStatus(502);
    const limite=8*1024*1024;
    if(Number(respuesta.headers.get('content-length')||0)>limite)return res.status(413).send('Archivo demasiado grande.');
    let enviados=0;
    const stream=Readable.fromWeb(respuesta.body);
    stream.on('data',chunk=>{enviados+=chunk.length;if(enviados>limite)stream.destroy(new Error('Limite de archivo'));});
    stream.on('error',()=>{if(!res.headersSent)res.status(502).end();else res.destroy();});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Disposition',`attachment; filename="documento_webalma.pdf"; filename*=UTF-8''${encodeURIComponent(String(archivo.nombre_archivo).replace(/[\r\n]/g,' ').slice(0,120))}`);
    stream.pipe(res);
  }catch(_e){console.warn('No se pudo descargar PDF desde Telegram.');if(!res.headersSent)res.status(502).send('PDF no disponible; solicita el documento al estudiante.');}
});
async function resolverDecisionPedido(req,res,accion){
  if(!/^\d+$/.test(req.params.id))return go(res,'pedido_no_encontrado','pedidos');
  const id=Number(req.params.id);
  const resultado=await procesarEstadoPedido({
    id,accion,cambiarEstado:db.transitionOrder,
    enviarMensaje:(telegramId,mensaje)=>{
      if(!bot)throw new Error('Telegram no está disponible');
      return bot.telegram.sendMessage(telegramId,mensaje);
    }
  });
  if(!resultado.ok)return go(res,resultado.motivo==='datos_invalidos'?'datos_invalidos':'pedido_no_encontrado','pedidos');
  io.emit('pedido_estado_actualizado',{id:String(id),estado:resultado.estado});
  const sufijo=resultado.notificacion==='fallida'?'_sin_aviso':
    resultado.notificacion==='sin_destinatario'?'_sin_destinatario':'';
  return go(res,'pedido_'+resultado.estado+sufijo,'pedidos');
}
// En Express 4, enviar los errores asíncronos al manejador central.
const ejecutarDecision=accion=>(req,res,next)=>resolverDecisionPedido(req,res,accion).catch(next);
app.post('/pedidos/:id/aceptar',auth,csrf,ejecutarDecision('aceptar'));
app.post('/pedidos/:id/rechazar',auth,csrf,ejecutarDecision('rechazar'));
// Conservar la ruta anterior para que enlaces existentes sigan funcionando.
app.post('/completar_pedido/:id',auth,csrf,ejecutarDecision('entregar'));
app.post('/impresiones/registrar',auth,csrf,async(req,res)=>{
  const tipo=req.body.tipo,cantidad=nonnegInt(req.body.cantidad),cfg=await db.getConfig();
  if(!['bn','color'].includes(tipo)||!cantidad||cantidad>50000)return go(res,'datos_invalidos','impresiones');
  await db.registerPrint(tipo,cantidad,tipo==='bn'?cfg.precioBN:cfg.precioColor,clean(req.body.observacion,150),req.session.usuario.id);
  io.emit('impresion_actualizada');go(res,'impresion_registrada','impresiones');
});
// Historial bajo demanda: consulta de sólo lectura con filtros obligatorios.
app.get('/reportes/historial',authadmin,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  const fecha=typeof req.query.fecha==='string'?req.query.fecha.trim():'';
  const estado=typeof req.query.estado==='string'?req.query.estado.trim():'';
  const validStates=['pendiente','aceptado','entregado','rechazado','cancelado'];
  if(!fecha&&!estado)return res.status(400).json({error:'Selecciona una fecha o un estado.'});
  if(estado&&!validStates.includes(estado))return res.status(400).json({error:'Estado inválido.'});
  if(fecha){
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(fecha))return res.status(400).json({error:'Fecha inválida.'});
    const [y,m,d]=fecha.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==fecha)
      return res.status(400).json({error:'Fecha inválida.'});
  }
  try{
    const resultados=await db.getReportHistory(fecha||null,estado||null);
    return res.json(resultados);
  }catch(e){return next(e);}
});

app.get('/reportes/semanal.csv',authadmin,async(req,res)=>{
  const bounds=weekBounds();const data=report(await db.getImpressions(),bounds);
  res.type('text/csv; charset=utf-8').set('Content-Disposition',`attachment; filename="reporte_impresiones_${bounds.start}.csv"`).send(csvReport(data));
});
app.get('/reportes/mensual.csv',authadmin,async(req,res)=>{
  const mes=String(req.query.mes||todayMX().slice(0,7));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))return res.status(400).send('Mes inválido');
  const end=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  const data=report(await db.getImpressions(),{start:mes+'-01',end});
  res.type('text/csv; charset=utf-8').set('Content-Disposition',`attachment; filename="reporte_mensual_${mes}.csv"`).send(csvReport(data));
});
// Gestión de cuentas: restringida a administradora, protegida por CSRF, sin eliminar historial.
const userId=v=>{const n=Number(v);return /^[1-9]\d*$/.test(String(v))&&Number.isSafeInteger(n)?n:null;};
app.post('/configuracion/usuarios/crear',auth,admin,csrf,async(req,res)=>{
  const values=validarCuenta(req.body,{exigirPassword:true});
  if(values.error)return go(res,'cuenta_datos_invalidos','configuracion');
  const result=await db.createUser(values);
  go(res,result.code==='ok'?'usuario_creado':result.code,'configuracion');
});
app.post('/configuracion/usuarios/:id/actualizar',auth,admin,csrf,async(req,res)=>{
  const id=userId(req.params.id);
  const values=validarCuenta(req.body,{exigirPassword:false});
  if(!id||values.error)return go(res,'cuenta_datos_invalidos','configuracion');
  const result=await db.updateUser(id,values,req.session.usuario.id,String(req.body.claveActual||''));
  if(result.code!=='ok')return go(res,result.code,'configuracion');
  desconectarUsuario(id);
  if(result.own)return req.session.destroy(()=>res.redirect('/'));
  go(res,'usuario_actualizado','configuracion');
});
app.post('/configuracion/usuarios/:id/desactivar',auth,admin,csrf,async(req,res)=>{
  const id=userId(req.params.id);
  if(!id)return go(res,'cuenta_datos_invalidos','configuracion');
  const result=await db.deactivateUser(id,req.session.usuario.id);
  if(result.code!=='ok')return go(res,result.code,'configuracion');
  desconectarUsuario(id);
  go(res,'usuario_eliminado','configuracion');
});
app.post('/configuracion/guardar',auth,admin,csrf,async(req,res)=>{
  const horario=validarHorario(req.body.horaApertura,req.body.horaCierre);
  if(!horario)return go(res,'horario_invalido','configuracion');
  const values={stockMinimo:nonnegInt(req.body.stockMinimo),precioBN:money(req.body.precioBN),precioColor:money(req.body.precioColor),
    horario,aviso:clean(req.body.aviso,350),preciosValidados:req.body.preciosValidados==='si'};
  if(values.stockMinimo===null||values.precioBN===null||values.precioColor===null)return go(res,'datos_invalidos','configuracion');
  await db.saveConfig(values);io.emit('configuracion_actualizada');go(res,'configuracion_guardada','configuracion');
});

let bot;
async function initializeBot(){
  const mode=process.env.BOT_MODE||'off';
  if(mode==='off')return console.log('Telegram desactivado (BOT_MODE=off).');
  bot=createBot(async pedido=>{const order=await db.createOrder(pedido);io.emit('alerta_nuevo_pedido',order);return order;});
  if(mode==='webhook') {
    const url=String(process.env.PUBLIC_URL||'').replace(/\/$/,'');
    const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
    if(!url.startsWith('https://')||!secret||!/^[A-Za-z0-9_-]{12,256}$/.test(secret))throw new Error('Webhook requiere PUBLIC_URL HTTPS y TELEGRAM_WEBHOOK_SECRET (12-256 caracteres).');
    app.post('/telegram/webhook',(req,res,next)=>{
      if(!same(req.get('x-telegram-bot-api-secret-token')||'',secret))return res.sendStatus(403);
      bot.webhookCallback('/telegram/webhook')(req,res,next);
    });
    await bot.telegram.setWebhook(url+'/telegram/webhook',{secret_token:secret,allowed_updates:['message','callback_query']});
    console.log('Webhook de Telegram configurado.');
  }else if(mode==='polling'){
    if(process.env.NODE_ENV==='production')throw new Error('Para Render usa BOT_MODE=webhook.');
    await bot.telegram.deleteWebhook();
    await bot.launch();console.log('Telegram iniciado en modo pruebas (polling).');
  }else throw new Error('BOT_MODE debe ser off, webhook o polling.');
}
app.use((err,req,res,_next)=>{console.error('Error WebAlma:',err.message);if(!res.headersSent)res.status(500).send('Ocurrió un error en el servidor.');});

async function start(){
  const configCheck=await db.query('SELECT 1 FROM public.configuracion WHERE id=1');
  if(!configCheck.rows.length)throw new Error('Falta ejecutar 01_actualizacion_segura.sql');
  await db.ensureInitialUsers();
  await db.ensureNoticeConfig();
  await asegurarEstadosPedido(db.pool);
  await new Promise(resolve=>server.listen(PORT,'0.0.0.0',resolve));
  console.log(`WebAlma web escuchando en puerto ${PORT}`);
  try{await initializeBot();}catch(e){console.error('No se pudo iniciar Telegram:',e.message);server.close();process.exitCode=1;}
}
if(require.main===module){start().catch(e=>{console.error('Arranque fallido:',e.message);process.exitCode=1;});}
module.exports={app,server,start,report,weekBounds};
