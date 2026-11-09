'use strict';
const {Telegraf,Markup,session} = require('telegraf');
const db = require('./db');
const normalize = s => String(s||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const pesos = n => Number(n).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const menu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📦 Ver inventario (muestra)','accion_inventario')],
  [Markup.button.callback('✅ Terminar y ver total','accion_checkout')]
]);

function createBot(onOrder) {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN.');
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  bot.use(session({store:db.telegramStore}));
  bot.use((ctx,next)=>{ctx.session??={};ctx.session.carrito??=[];return next();});
  bot.catch((err,ctx)=>{ console.error('Error en Telegram',ctx.updateType,err.message); });

  bot.start(ctx=>ctx.reply(`¡Hola, ${ctx.from?.first_name||'estudiante'}! 👋 Soy WebAlma, asistente de la papelería CUVCh.\nBusca un producto o escribe, por ejemplo: 3 impresiones a color.`,menu()));
  bot.hears(/^(hola|men[uú]|inicio)$/i,ctx=>ctx.reply('¿Qué necesitas de nuestra papelería? Escribe un producto o consulta el catálogo.',menu()));
  bot.hears(/^(?:quiero\s+|dame\s+|necesito\s+)?(?:impresi[oó]n|impresiones|copia|copias|imprimir)$/i,
    ctx=>ctx.reply('Para cotizar escribe: 5 impresiones a color o 10 copias en blanco y negro.'));
  bot.hears(/(\d+)\s*(copias?|hojas?|impresiones?)\s*(?:a|en|de)?\s*(color|blanco\s*y\s*negro)/i,async ctx=>{
    const qty=Number(ctx.match[1]);
    if(!Number.isSafeInteger(qty)||qty<1||qty>5000) return ctx.reply('Indica entre 1 y 5000 hojas por cotización.');
    const kind=normalize(ctx.match[3])==='color'?'color':'bn';
    const cfg=await db.getConfig(),unit=kind==='color'?cfg.precioColor:cfg.precioBN;
    ctx.session.carrito.push({tipo:'impresion',impresionTipo:kind,cantidad:qty,descripcion:`${qty} impresiones ${kind==='bn'?'blanco y negro':'a color'}`,precioUnitario:unit,subtotal:qty*unit});
    const total=ctx.session.carrito.reduce((s,p)=>s+p.subtotal,0);
    return ctx.reply(`🖨️ Agregado: ${qty} impresiones ${kind==='color'?'a color':'blanco y negro'}.\nTotal provisional: ${pesos(total)}.`,menu());
  });
  bot.action('accion_inventario',async ctx=>{
    await ctx.answerCbQuery();
    const items=await db.getInventory();
    if(!items.length) return ctx.reply('El catálogo está vacío temporalmente.');
    const shown=items.filter(p=>p.stock>0).slice(0,15);
    const lines=shown.map(p=>`• ${p.producto}: ${pesos(p.precio)} (${p.stock} disponibles)`);
    return ctx.reply(`📦 Muestra del catálogo:\n\n${lines.join('\n')}\n\nEscribe el nombre del artículo para buscarlo. Los precios de prueba están sujetos a validación.`);
  });

  async function recotizar(ctx){
    const inventario=await db.getInventory(),cfg=await db.getConfig();
    const productMap=new Map(inventario.map(p=>[Number(p.id),p]));
    const output=[];let total=0;
    for(const item of ctx.session.carrito){
      const next={...item};
      if(item.tipo==='producto') {
        const fresh=productMap.get(Number(item.productoId));
        if(!fresh||fresh.stock<item.cantidad) return {error:`No hay existencias suficientes para ${item.nombre||item.descripcion}. Revisa tu carrito.`};
        next.nombre=fresh.producto;
        next.precioUnitario=fresh.precio;
        next.descripcion=`${item.cantidad} x ${fresh.producto} (${pesos(fresh.precio*item.cantidad)})`;
      }else{
        next.precioUnitario=item.impresionTipo==='color'?cfg.precioColor:cfg.precioBN;
        next.descripcion=`${item.cantidad} impresiones ${item.impresionTipo==='color'?'a color':'blanco y negro'} (${pesos(next.precioUnitario*item.cantidad)})`;
      }
      next.subtotal=Math.round(next.precioUnitario*next.cantidad*100)/100;
      total+=next.subtotal;output.push(next);
    }
    ctx.session.carrito=output;
    return {items:output,total:Math.round(total*100)/100};
  }
  bot.action('accion_checkout',async ctx=>{
    await ctx.answerCbQuery();
    if(!ctx.session.carrito.length) return ctx.reply('Tu carrito está vacío. Escribe un producto para comenzar.');
    const quote=await recotizar(ctx);
    if(quote.error) return ctx.reply(quote.error);
    const resumen=quote.items.map(i=>`• ${i.descripcion}`).join('\n');
    return ctx.reply(`🧾 Tu cotización:\n\n${resumen}\n\nTOTAL: ${pesos(quote.total)} MXN\n\n¿Vas al mostrador o solo deseas cotizar?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏃 Voy para allá','accion_comprar')],
        [Markup.button.callback('💭 Solo quería cotizar','accion_cotizar')],
        [Markup.button.callback('🔙 Seguir comprando','accion_menu')]
      ]));
  });
  bot.action('accion_comprar',async ctx=>{
    await ctx.answerCbQuery();
    if(!ctx.session.carrito?.length) return ctx.reply('No hay artículos para enviar.');
    const quote=await recotizar(ctx);
    if(quote.error) return ctx.reply(quote.error);
    const pedido={cliente:String(ctx.from?.first_name||'Estudiante').slice(0,100),telegramId:ctx.from?.id,
      total:quote.total,articulos:quote.items.map(i=>({productoId:i.tipo==='producto'?i.productoId:null,
        descripcion:i.descripcion,cantidad:i.cantidad,precioUnitario:i.precioUnitario,subtotal:i.subtotal}))};
    try {
      await onOrder(pedido);
      ctx.session.carrito=[];
      await ctx.editMessageReplyMarkup({inline_keyboard:[]}).catch(()=>{});
      return ctx.reply('✅ Tu solicitud quedó registrada para atención en mostrador. Aún no está pagada ni preparada. Te esperamos.');
    }catch(e){console.error('No se pudo registrar pedido:',e.message);
      return ctx.reply('⚠️ No pudimos registrar tu pedido. No se ha confirmado; intenta nuevamente o acude al mostrador.');}
  });
  bot.action('accion_cotizar',async ctx=>{
    await ctx.answerCbQuery(); ctx.session.carrito=[];
    return ctx.reply('Gracias por consultar. ¡Te esperamos cuando gustes!');
  });
  bot.action('accion_menu',async ctx=>{await ctx.answerCbQuery();return ctx.reply('Escribe qué otro artículo necesitas.',menu());});
  bot.on('text',async ctx=>{
    const original=String(ctx.message.text||'').trim();
    if(!original||original.startsWith('/')) return;
    let search=normalize(original.replace(/^(quiero|dame|necesito|agregar|buscar)\s+/i,''));
    let qty=1;const match=search.match(/^(\d+)\s+(.+)/);
    if(match){qty=Number(match[1]);search=match[2];}
    if(!search||!Number.isSafeInteger(qty)||qty<1||qty>1000) return ctx.reply('Indica una cantidad entre 1 y 1000.');
    const inventory=await db.getInventory();
    const words=search.split(/\s+/).filter(w=>w.length>2);
    const found=inventory.find(p=>words.length?words.every(w=>normalize(p.producto).includes(w)):normalize(p.producto).includes(search));
    if(!found) return ctx.reply(`No encontré "${original}". Intenta buscar un nombre más corto.`,menu());
    if(found.stock<qty) return ctx.reply(`Solo figuran ${found.stock} unidades de "${found.producto}" en el inventario. Puedes consultar una cantidad menor.`);
    const subtotal=Math.round(found.precio*qty*100)/100;
    ctx.session.carrito.push({tipo:'producto',productoId:found.id,nombre:found.producto,cantidad:qty,
      precioUnitario:found.precio,subtotal,descripcion:`${qty} x ${found.producto} (${pesos(subtotal)})`});
    const total=ctx.session.carrito.reduce((a,b)=>a+b.subtotal,0);
    return ctx.reply(`🛒 Agregado: ${qty} x ${found.producto}\nPrecio provisional: ${pesos(subtotal)}\nTotal provisional: ${pesos(total)}\n¿Algo más?`,menu());
  });
  return bot;
}
module.exports={createBot};
