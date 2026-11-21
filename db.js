'use strict';
const { Pool } = require('pg');
const session = require('express-session');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria: configura la URL interna de PostgreSQL en Render.');
const useSSL = process.env.DATABASE_SSL === 'require';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(useSSL ? { ssl: { rejectUnauthorized: true } } : {})
});
pool.on('error', err => console.error('Conexión PostgreSQL inactiva:', err.message));
const query = (sql, params=[]) => pool.query(sql, params);
const num = x => Number(x ?? 0);

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
function product(row) {
  return { ...row, precio: num(row.precio), stock: num(row.stock),
    stock_minimo_sugerido: num(row.stock_minimo),
    existencia_confirmada: !!row.existencia_confirmada,
    precio_confirmado: !!row.precio_confirmado,
    datos_de_prueba: !!row.datos_de_prueba };
}
async function getInventory() {
  const { rows } = await query(`SELECT p.id, p.producto, p.precio, p.stock, p.stock_minimo,
    p.existencia_confirmada, p.precio_confirmado, p.datos_de_prueba,
    c.nombre AS categoria FROM public.productos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.activo = TRUE ORDER BY p.id`);
  return rows.map(product);
}
async function getConfig() {
  const { rows } = await query('SELECT * FROM public.configuracion WHERE id=1');
  if (!rows.length) throw new Error('Falta ejecutar sql/01_actualizacion_segura.sql');
  const r = rows[0];
  return {stockMinimo:num(r.stock_minimo),precioBN:num(r.precio_bn),precioColor:num(r.precio_color),
    horario:r.horario,aviso:r.aviso,preciosValidados:r.precios_validados};
}
async function getOrders() {
  const { rows } = await query(`SELECT p.id, p.nombre_cliente, p.total, p.fecha,
   COALESCE(array_agg(d.descripcion ORDER BY d.id) FILTER (WHERE d.id IS NOT NULL), ARRAY[]::VARCHAR[]) AS articulos,
   p.estado,
   COALESCE((SELECT json_agg(json_build_object('id',f.id,'nombre',f.nombre_archivo) ORDER BY f.id)
     FROM public.documentos_impresion f WHERE f.pedido_id=p.id),'[]'::json) AS documentos
   FROM public.pedidos p LEFT JOIN public.detalle_pedido d ON d.pedido_id=p.id
   WHERE p.estado IN ('pendiente','aceptado') GROUP BY p.id ORDER BY p.fecha`);
  return rows.map(r => ({id:String(r.id),cliente:r.nombre_cliente||'Estudiante',total:num(r.total),
    fecha:r.fecha, hora:new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}).format(r.fecha),
    articulos:r.articulos,documentos:r.documentos||[],estado:r.estado}));
}
/**
 * Lecturas de sólo consulta para reportes: pedidos históricos (también entregados
 * y rechazados), actividad semanal en zona horaria de México y PDF vinculados.
 * Sin datos privados de estudiantes en la presentación de reportes.
 */
async function getReportActivity(bounds,today){
  const {buildReportActivity}=require('./reportes_actividad');
  const [summary,daily,pdf]=await Promise.all([
    query(`SELECT estado, COUNT(*)::integer AS cantidad,
      COALESCE(SUM(total),0) AS cotizado
      FROM public.pedidos GROUP BY estado`),
    query(`SELECT to_char(fecha AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD') AS dia,
      estado,COUNT(*)::integer AS cantidad,COALESCE(SUM(total),0) AS cotizado
      FROM public.pedidos
      WHERE (fecha AT TIME ZONE 'America/Mexico_City')::date BETWEEN $1::date AND $2::date
      GROUP BY 1,2 ORDER BY 1,2`,[bounds.start,bounds.end]),
    query(`SELECT COUNT(*)::integer AS total_pdf,
      COUNT(DISTINCT pedido_id)::integer AS pedidos_pdf
      FROM public.documentos_impresion`)
  ]);
  return buildReportActivity(summary.rows,daily.rows,[],pdf.rows[0],bounds,today);
}

/**
 * Historial solicitado por la propietaria. No se carga en la pantalla hasta
 * que el usuario seleccione fecha o estado y presione "Ver".
 * Únicamente metadatos; no exponemos cuentas, nombres ni tokens de Telegram.
 */
async function getReportHistory(fecha=null,estado=null) {
  const max=200;
  const {rows}=await query(`SELECT p.id,
    to_char(p.fecha AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD') AS dia,
    to_char(p.fecha AT TIME ZONE 'America/Mexico_City','HH24:MI') AS hora,
    p.estado, p.total,
    (SELECT COUNT(*)::integer FROM public.detalle_pedido d WHERE d.pedido_id=p.id) AS articulos,
    (SELECT COUNT(*)::integer FROM public.documentos_impresion f WHERE f.pedido_id=p.id) AS pdf,
    COUNT(*) OVER()::integer AS total_resultados
    FROM public.pedidos p
    WHERE ($1::date IS NULL OR (p.fecha AT TIME ZONE 'America/Mexico_City')::date=$1::date)
      AND ($2::text IS NULL OR p.estado=$2::text)
    ORDER BY p.fecha DESC,p.id DESC LIMIT $3`,[fecha||null,estado||null,max]);
  return {total:rows.length?Number(rows[0].total_resultados):0,limite:max,
    registros:rows.map(r=>({
      id:String(r.id),fecha:r.dia,hora:r.hora,estado:r.estado,
      articulos:Number(r.articulos||0),pdf:Number(r.pdf||0),total:Number(r.total||0)
    }))};
}

async function getImpressions() {
  const {rows}=await query(`SELECT id,fecha,tipo,cantidad,precio_unitario,total,observacion
    FROM public.impresiones ORDER BY fecha, id`);
  return rows.map(r=>({id:r.id,fecha:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(r.fecha),
    tipo:r.tipo==='blanco_negro'?'bn':'color',cantidad:num(r.cantidad),precioUnitario:num(r.precio_unitario),total:num(r.total),observacion:r.observacion||''}));
}
async function categoryId(client,name) {
  const {rows}=await client.query(`INSERT INTO public.categorias(nombre) VALUES($1)
  ON CONFLICT(nombre) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`,[name]);return rows[0].id;
}
async function createProduct(data) {
  return transaction(async c=>{
    const cat=await categoryId(c,data.categoria);
    const {rows}=await c.query(`INSERT INTO public.productos
      (producto,categoria_id,precio,stock,stock_minimo,existencia_confirmada,precio_confirmado,datos_de_prueba,origen_registro,estado_validacion)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'alta_web','pendiente_verificacion_con_propietaria') RETURNING id`,
      [data.producto,cat,data.precio,data.stock,data.minimo,data.existencia_confirmada,data.precio_confirmado,
      !(data.existencia_confirmada&&data.precio_confirmado)]);
    const id=rows[0].id;
    if(data.stock>0) await c.query(`INSERT INTO public.lotes_inventario(producto_id,cantidad_inicial,cantidad_disponible) VALUES($1,$2,$2)`,[id,data.stock]);
    return id;
  });
}
async function editProduct(id,data) {
  return transaction(async c=>{
    const cat=await categoryId(c,data.categoria);
    const result=await c.query(`UPDATE public.productos SET producto=$1,categoria_id=$2,precio=$3,stock_minimo=$4,
      existencia_confirmada=$5,precio_confirmado=$6,datos_de_prueba=$7 WHERE id=$8 AND activo=TRUE`,
      [data.producto,cat,data.precio,data.minimo,data.existencia_confirmada,data.precio_confirmado,
      !(data.existencia_confirmada&&data.precio_confirmado),id]);
    return result.rowCount>0;
  });
}
async function moveProduct(id,tipo,cantidad,nota,usuarioId=null,registradoPor=null) {
  return transaction(async c=>{
    const result=await c.query('SELECT id,stock FROM public.productos WHERE id=$1 AND activo=TRUE FOR UPDATE',[id]);
    if(!result.rows.length) return {error:'movimiento_invalido'};
    const before=num(result.rows[0].stock);
    if(tipo==='salida'&&cantidad>before) return {error:'movimiento_invalido'};
    if(tipo==='entrada') {
      await c.query('INSERT INTO public.lotes_inventario(producto_id,cantidad_inicial,cantidad_disponible) VALUES($1,$2,$2)',[id,cantidad]);
    } else {
      let remaining=cantidad;
      const lots=await c.query(`SELECT id,cantidad_disponible FROM public.lotes_inventario
        WHERE producto_id=$1 AND cantidad_disponible>0 ORDER BY fecha_entrada,id FOR UPDATE`,[id]);
      for(const lot of lots.rows) {
        if(!remaining) break;
        const taken=Math.min(remaining,num(lot.cantidad_disponible));
        await c.query('UPDATE public.lotes_inventario SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2',[taken,lot.id]);
        remaining-=taken;
      }
      if(remaining) { const e=new Error('lotes_inconsistentes'); e.code='LOTES_INCONSISTENTES'; throw e; }
    }
    const after=before+(tipo==='entrada'?cantidad:-cantidad);
    await c.query('UPDATE public.productos SET stock=$1 WHERE id=$2',[after,id]);
    await c.query(`INSERT INTO public.movimientos_inventario(producto_id,usuario_id,registrado_por,tipo,cantidad,stock_anterior,stock_nuevo,observaciones)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,usuarioId,registradoPor,tipo,cantidad,before,after,nota]);
    return {ok:true,stock:after};
  });
}
async function createOrder(order) {
  return transaction(async c=>{
    const {rows}=await c.query(`INSERT INTO public.pedidos(telegram_usuario_id,nombre_cliente,total,estado)
      VALUES($1,$2,$3,'pendiente') RETURNING id,fecha`,[order.telegramId||null,order.cliente,order.total]);
    const id=rows[0].id, documentos=[];
    for(const item of order.articulos) {
      const detalle=await c.query(`INSERT INTO public.detalle_pedido(pedido_id,producto_id,descripcion,cantidad,precio_unitario,subtotal)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[id,item.productoId||null,String(item.descripcion).slice(0,200),item.cantidad,item.precioUnitario,item.subtotal]);
      if(item.archivo){
        const a=item.archivo;
        if(!/^[\w-]+$/.test(a.fileId)||!Number.isSafeInteger(a.paginas)||a.paginas<1||a.paginas>200||
           !Number.isSafeInteger(a.copias)||a.copias<1||a.copias>30||!['bn','color'].includes(a.tipo))
          throw new Error('Datos de archivo inválidos');
        const doc=await c.query(`INSERT INTO public.documentos_impresion
           (pedido_id,detalle_id,telegram_file_id,nombre_archivo,tamano_bytes,paginas,copias,tipo,doble_cara,formato)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
           [id,detalle.rows[0].id,a.fileId,String(a.nombre).slice(0,120),a.bytes||0,a.paginas,a.copias,a.tipo,a.dobleCara,a.formato]);
        documentos.push({id:doc.rows[0].id,nombre:a.nombre});
      }
    }
    return { id:String(id),cliente:order.cliente,total:order.total,documentos,
      articulos:order.articulos.map(a=>a.descripcion),fecha:rows[0].fecha,
      hora:new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}).format(rows[0].fecha),estado:'pendiente'};
  });
}
async function getOrderDocument(pedidoId,documentoId){
  const {rows}=await query(`SELECT telegram_file_id,nombre_archivo,tamano_bytes
    FROM public.documentos_impresion WHERE id=$1 AND pedido_id=$2`,[documentoId,pedidoId]);
  return rows[0]||null;
}
async function transitionOrder(id,fromStatus,toStatus) {
  // UPDATE atómico: evita aceptar y rechazar simultáneamente el mismo pedido.
  const {rows}=await query(`UPDATE public.pedidos SET estado=$3
    WHERE id=$1 AND estado=$2 RETURNING id,telegram_usuario_id`,[id,fromStatus,toStatus]);
  if(!rows.length)return null;
  return {id:String(rows[0].id),telegramId:rows[0].telegram_usuario_id ? String(rows[0].telegram_usuario_id) : null};
}
async function completeOrder(id) {
  return !!(await transitionOrder(id,'aceptado','entregado'));
}
async function registerPrint(tipo,cantidad,precio,observacion,usuarioId=null) {
  return query(`INSERT INTO public.impresiones(usuario_id,tipo,cantidad,precio_unitario,total,observacion)
    VALUES($1,$2,$3,$4,$5,$6)`,[usuarioId,tipo==='bn'?'blanco_negro':'color',cantidad,precio,Math.round(precio*cantidad*100)/100,observacion]);
}
async function saveConfig(v) {
  await query(`UPDATE public.configuracion SET stock_minimo=$1,precio_bn=$2,precio_color=$3,horario=$4,aviso=$5,precios_validados=$6 WHERE id=1`,
    [v.stockMinimo,v.precioBN,v.precioColor,v.horario,v.aviso,v.preciosValidados]);
}

function hashPassword(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password,stored) {
  const parts=String(stored||'').split(':');
  if(parts.length!==3||parts[0]!=='scrypt')return false;
  const actual=crypto.scryptSync(String(password),parts[1],64);
  const expected=Buffer.from(parts[2],'hex');
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
async function ensureInitialUsers() {
  const users=[{name:'Administración',username:process.env.ADMIN_USER,pass:process.env.ADMIN_PASS,rol:'administradora'},
    {name:'Auxiliar',username:process.env.AUX_USER,pass:process.env.AUX_PASS,rol:'auxiliar'}];
  for(const u of users){
    if(!u.username||!u.pass)continue;
    await query(`INSERT INTO public.usuarios(nombre,usuario,contrasena_hash,rol,activo) VALUES($1,$2,$3,$4,TRUE)
      ON CONFLICT(usuario) DO NOTHING`,[u.name,u.username,hashPassword(u.pass),u.rol]);
  }
}
async function verifyLogin(username,password){
  const {rows}=await query('SELECT id,nombre,usuario,contrasena_hash,rol FROM public.usuarios WHERE usuario=$1 AND activo=TRUE',[username]);
  if(!rows.length||!verifyPassword(password,rows[0].contrasena_hash))return null;
  return {id:rows[0].id,nombre:rows[0].nombre,rol:rows[0].rol};
}

class PgSessionStore extends session.Store {
  get(sid,cb) {query('SELECT sess FROM public.web_sessions WHERE sid=$1 AND expire_at>NOW()',[sid])
    .then(r=>cb(null,r.rows[0]?.sess||null)).catch(cb);}
  set(sid,sess,cb) {const exp=sess.cookie?.expires?new Date(sess.cookie.expires):new Date(Date.now()+8*3600000);
    query(`INSERT INTO public.web_sessions(sid,sess,expire_at) VALUES($1,$2,$3)
      ON CONFLICT(sid) DO UPDATE SET sess=$2,expire_at=$3`,[sid,JSON.stringify(sess),exp])
      .then(()=>cb?.()).catch(e=>cb?.(e));}
  destroy(sid,cb) {query('DELETE FROM public.web_sessions WHERE sid=$1',[sid]).then(()=>cb?.()).catch(e=>cb?.(e));}
  touch(sid,sess,cb) {const exp=sess.cookie?.expires?new Date(sess.cookie.expires):new Date(Date.now()+8*3600000);
    query('UPDATE public.web_sessions SET expire_at=$2 WHERE sid=$1',[sid,exp]).then(()=>cb?.()).catch(e=>cb?.(e));}
}
const telegramStore={
  async get(key){const r=await query('SELECT datos FROM public.telegram_sessions WHERE clave=$1',[key]);return r.rows[0]?.datos||undefined;},
  async set(key,value){await query(`INSERT INTO public.telegram_sessions(clave,datos,actualizado) VALUES($1,$2,NOW())
  ON CONFLICT(clave) DO UPDATE SET datos=$2,actualizado=NOW()`,[key,JSON.stringify(value)]);},
  async delete(key){await query('DELETE FROM public.telegram_sessions WHERE clave=$1',[key]);}
};
module.exports={pool,query,transaction,getInventory,getConfig,getOrders,getImpressions,getReportActivity,getReportHistory,
  createProduct,editProduct,moveProduct,createOrder,getOrderDocument,transitionOrder,completeOrder,registerPrint,saveConfig,ensureInitialUsers,verifyLogin,hashPassword,verifyPassword,PgSessionStore,telegramStore};
