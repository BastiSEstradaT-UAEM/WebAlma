'use strict';
const {Telegraf,Markup,session}=require('telegraf');
const db=require('./db');
const {analizarPDF,descargarPDFTelegram,cotizarPDF,MAX_BYTES}=require('./pdf_cotizador');
const {estaAbierto,horarioLegible}=require('./horario_atencion');
const MENSAJE_CERRADO='🌙 En este momento no estamos disponibles. ¡Nos vemos pronto!';
const normalize=s=>String(s||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const pesos=n=>Number(n).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const kb=rows=>Markup.inlineKeyboard(rows.map(row=>row.map(([label,id])=>Markup.button.callback(label,id))));
const inicio=()=>kb([
  [['📚 Ver productos','productos'],['🖨 Cotizar impresiones','impresiones']],
  [['📄 Cotizar PDF','pdf_inicio'],['🛒 Mi carrito','carrito']],
  [['💰 Tarifas','tarifas'],['ℹ️ Ayuda','ayuda']],
  [['✅ Finalizar pedido','checkout']]
]);
const seguir=()=>kb([[['📚 Productos','productos'],['📄 PDF','pdf_inicio']],[['🛒 Mi carrito','carrito'],['✅ Finalizar','checkout']]]);
function precioMenu(){return kb([[['1 copia','pdf_copias:1'],['2 copias','pdf_copias:2'],['3 copias','pdf_copias:3']],[['5 copias','pdf_copias:5'],['10 copias','pdf_copias:10']],[['✏️ Otra cantidad','pdf_copias:otra']],[['⬅️ Menú','inicio']]]);}
function createBot(onOrder,{ahora=()=>new Date()}={}){
  if(!process.env.TELEGRAM_BOT_TOKEN)throw new Error('Falta TELEGRAM_BOT_TOKEN.');
  const bot=new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  bot.use(session({store:db.telegramStore}));
  bot.use((ctx,next)=>{ctx.session??={};ctx.session.carrito??=[];return next();});
  bot.catch((err,ctx)=>{console.error('Telegram: error en actualización',ctx.updateType,err.code||err.name);});
  // Guard global: bloquea /start, mensajes, archivos PDF y botones antiguos
  // cuando la papelería está cerrada. Sin teclado ni registro de pedidos.
  bot.use(async(ctx,next)=>{
    if(ctx.updateType!=='message'&&ctx.updateType!=='callback_query')return next();
    const cfg=await db.getConfig();
    if(estaAbierto(cfg.horario,ahora())!==false)return next();
    if(ctx.callbackQuery){
      await ctx.answerCbQuery('La papelería está cerrada por el momento.').catch(()=>{});
      // Solo se oculta el teclado del mensaje presionado: Telegram no permite
      // quitar de forma retroactiva los botones de todo el historial del chat.
      await ctx.editMessageReplyMarkup({inline_keyboard:[]}).catch(()=>{});
    }
    return ctx.reply(MENSAJE_CERRADO);
  });
  // Cada entrada al menú lee PostgreSQL. No se almacena en caché la configuración pública.
  function informacionPublica(cfg){
    const horario=horarioLegible(cfg.horario);
    const aviso=String(cfg.aviso||'').trim();
    return '🕒 Horario de la papelería: '+horario+
      (aviso?'\n📢 Aviso del establecimiento: '+aviso:'\n📢 Sin avisos especiales.');
  }
  function tarifasPublicas(cfg){
    const leyenda=cfg.preciosValidados?'Tarifas confirmadas por la papelería.':'Tarifas estimadas, sujetas a confirmación.';
    return '🖨️ Tarifas por cara impresa\n• Blanco y negro: '+pesos(cfg.precioBN)+
      '\n• A color: '+pesos(cfg.precioColor)+'\n'+leyenda;
  }
  async function menu(ctx){
    // Usar el nombre público de Telegram; no pedir datos personales adicionales.
    const nombre=String(ctx.from?.first_name||'').replace(/\s+/g,' ').trim().slice(0,60)||'estudiante';
    // Mostrar avisos configurados desde el panel sin un botón dedicado.
    const aviso=String((await db.getConfig()).aviso||'').trim();
    return ctx.reply('📘 Papelería universitaria UAEM Valle de Chalco 🦆💚💛\n\n'+
      `👋 ¡Hola, ${nombre}! Bienvenido a la papelería universitaria.\n\n`+
      'Estoy aquí para ayudarte a consultar productos, conocer precios y cotizar tus impresiones.\n\n'+
      (aviso?`📢 Aviso: ${aviso}\n\n`:'')+
      '¿Qué necesitas hoy? 😊',inicio());
  }
  async function enter(ctx){await ctx.answerCbQuery().catch(()=>{});}
  bot.start(menu);
  bot.hears(/^(hola|men[uú]|inicio)$/i,menu);
  async function mostrarInformacion(ctx){
    const cfg=await db.getConfig();
    return ctx.reply(informacionPublica(cfg)+'\n\nPara un pedido, espera la confirmación del personal.',inicio());
  }
  async function mostrarTarifas(ctx){
    const cfg=await db.getConfig();
    return ctx.reply(tarifasPublicas(cfg),inicio());
  }
  bot.command('horario',mostrarInformacion);
  bot.command('precios',mostrarTarifas);
  bot.hears(/^(horario|horarios|horario de atenci[oó]n|aviso|avisos)$/i,mostrarInformacion);
  bot.hears(/^(tarifas|precios de impresi[oó]n)$/i,mostrarTarifas);
  bot.action('informacion',async ctx=>{await enter(ctx);return mostrarInformacion(ctx);});
  bot.action('tarifas',async ctx=>{await enter(ctx);return mostrarTarifas(ctx);});
  bot.action('inicio',async ctx=>{await enter(ctx);ctx.session.pdfPendiente=null;ctx.session.esperando=null;return menu(ctx);});
  bot.action('ayuda',async ctx=>{await enter(ctx);return ctx.reply('Usa los botones para ver productos o enviar un PDF. También puedes escribir «2 plumas» o «5 impresiones a color». Si necesitas consultar el horario, escribe «horario». La papelería confirma las solicitudes en mostrador.',inicio());});
  bot.action('impresiones',async ctx=>{await enter(ctx);return ctx.reply('🖨️ Para cotizar impresiones sin archivo, escribe por ejemplo:\n• 5 impresiones a color\n• 10 impresiones blanco y negro\n\nPara cotizar un documento completo, selecciona PDF.',kb([[['📄 Enviar PDF','pdf_inicio']],[['⬅️ Menú','inicio']]]));});
  bot.action('pdf_inicio',async ctx=>{await enter(ctx);return ctx.reply('📄 Envíame tu archivo *PDF como documento* por este chat privado. Detectaré el número de páginas y el tamaño; luego elegirás color, copias y doble cara.\n\nLímite de demostración: 8 MB y 200 páginas. Evita documentos con datos sensibles.',{parse_mode:'Markdown',...kb([[['⬅️ Menú','inicio']]])});});

  // Se aceptan archivos solo en conversaciones privadas, nunca en grupos.
  bot.on('document',async ctx=>{
    if(ctx.chat?.type!=='private')return ctx.reply('Por privacidad, envía el PDF directamente al chat privado de WebAlma.');
    const d=ctx.message.document||{};
    if(!String(d.file_name||'').toLowerCase().endsWith('.pdf')||!['application/pdf','application/octet-stream',undefined].includes(d.mime_type))
      return ctx.reply('Por ahora únicamente acepto archivos PDF. Envíalo como documento de Telegram.');
    if(!Number.isFinite(d.file_size)||d.file_size<=0||d.file_size>MAX_BYTES)return ctx.reply('Este PDF supera el límite de 8 MB o no tiene tamaño válido.');
    if(Date.now()-Number(ctx.session.ultimaSubidaPDF||0)<10000)return ctx.reply('Para evitar envíos duplicados, intenta de nuevo en unos segundos.');
    ctx.session.ultimaSubidaPDF=Date.now();
    try {
      const buffer=await descargarPDFTelegram(bot,d.file_id);
      const info=await analizarPDF(buffer);
      ctx.session.pdfPendiente={fileId:d.file_id,nombre:String(d.file_name).replace(/[\r\n]/g,' ').slice(0,120),bytes:d.file_size,
        paginas:info.paginas,formato:info.formato,tipo:null,copias:1,dobleCara:false};
      ctx.session.esperando=null;
      return ctx.reply(`✅ PDF recibido y revisado\n📄 ${ctx.session.pdfPendiente.nombre}\nPáginas: ${info.paginas}\nFormato: ${info.formato}\n\n¿En qué modalidad deseas imprimirlo?`,
        kb([[['⚫ Blanco y negro','pdf_tipo:bn']],[['🎨 A color','pdf_tipo:color']],[['❌ Cancelar','pdf_cancelar']]]));
    } catch(e){console.warn('Documento PDF no procesado:',e.code||e.message);
      return ctx.reply('⚠️ No pude revisar el archivo. Comprueba que sea un PDF válido, sin contraseña y dentro del límite de 8 MB y 200 páginas.');}
  });
  bot.action(/^pdf_tipo:(bn|color)$/,async ctx=>{await enter(ctx);
    if(!ctx.session.pdfPendiente)return ctx.reply('Envía primero un PDF.',inicio());
    ctx.session.pdfPendiente.tipo=ctx.match[1];
    return ctx.reply('¿Cuántas copias completas del documento deseas?',precioMenu());
  });
  bot.action(/^pdf_copias:(1|2|3|5|10|otra)$/,async ctx=>{await enter(ctx);
    if(!ctx.session.pdfPendiente?.tipo)return ctx.reply('Selecciona primero un PDF y su tipo.',inicio());
    if(ctx.match[1]==='otra'){ctx.session.esperando='copias_pdf';return ctx.reply('Escribe únicamente el número de copias (1 a 30).');}
    ctx.session.pdfPendiente.copias=Number(ctx.match[1]);
    return ctx.reply('¿Cómo deseas imprimir?',kb([[['📄 Una cara','pdf_caras:una']],[['📖 Doble cara','pdf_caras:doble']],[['❌ Cancelar','pdf_cancelar']]]));
  });
  async function mostrarCotizacionPDF(ctx){
    const p=ctx.session.pdfPendiente;if(!p)return ctx.reply('No hay un archivo pendiente.',inicio());
    const cfg=await db.getConfig();const q=cotizarPDF(p,cfg);
    return ctx.reply(`🧾 Cotización de documento PDF\n📄 ${p.nombre}\n${q.paginas} páginas × ${q.copias} copia(s) = ${q.impresiones} caras impresas\nHojas estimadas: ${q.hojas}\nModalidad: ${p.tipo==='color'?'Color':'Blanco y negro'} / ${p.dobleCara?'Doble cara':'Una cara'}\nFormato: ${p.formato}\n\n💰 TOTAL ESTIMADO: ${pesos(q.total)}\n\nLa tarifa es por cara impresa. Los formatos especiales y precios están sujetos a confirmación con la papelería.`,{
      ...kb([[['✅ Agregar al carrito','pdf_agregar']],[['✏️ Cambiar opciones','pdf_editar'],['❌ Cancelar','pdf_cancelar']]])});
  }
  bot.action(/^pdf_caras:(una|doble)$/,async ctx=>{await enter(ctx);
    if(!ctx.session.pdfPendiente?.tipo)return ctx.reply('Envía primero el archivo PDF.');
    ctx.session.pdfPendiente.dobleCara=ctx.match[1]==='doble';return mostrarCotizacionPDF(ctx);
  });
  bot.action('pdf_editar',async ctx=>{await enter(ctx);
    if(!ctx.session.pdfPendiente)return ctx.reply('Envíame primero el archivo PDF.',inicio());
    return ctx.reply('Elige de nuevo el tipo de impresión:',kb([[['⚫ Blanco y negro','pdf_tipo:bn']],[['🎨 A color','pdf_tipo:color']],[['❌ Cancelar','pdf_cancelar']]]));
  });
  bot.action('pdf_agregar',async ctx=>{await enter(ctx);
    const p=ctx.session.pdfPendiente;if(!p?.tipo)return ctx.reply('No hay una cotización activa.',inicio());
    const cfg=await db.getConfig(),q=cotizarPDF(p,cfg);
    if(ctx.session.carrito.length>=40)return ctx.reply('Has alcanzado el máximo de 40 conceptos en el carrito.');
    ctx.session.carrito.push({tipo:'impresion_pdf',impresionTipo:p.tipo,cantidad:q.impresiones,precioUnitario:q.precioUnitario,
      subtotal:q.total,descripcion:`PDF ${p.nombre} (${q.paginas} pág. × ${q.copias} copias, ${p.tipo==='color'?'color':'B/N'}, ${p.dobleCara?'doble cara':'una cara'})`,
      archivo:{fileId:p.fileId,nombre:p.nombre,paginas:p.paginas,copias:p.copias,tipo:p.tipo,dobleCara:p.dobleCara,formato:p.formato,bytes:p.bytes}});
    ctx.session.pdfPendiente=null;ctx.session.esperando=null;
    return ctx.reply(`✅ Documento agregado al carrito (${pesos(q.total)}).\nNo se enviará a imprimir hasta confirmar el pedido.`,seguir());
  });
  bot.action('pdf_cancelar',async ctx=>{await enter(ctx);ctx.session.pdfPendiente=null;ctx.session.esperando=null;return ctx.reply('Se canceló la cotización de este PDF.',inicio());});

  // Navegación del catálogo con paginación y selección por botones.
  bot.action('productos',async ctx=>{await enter(ctx);const items=await db.getInventory();
    ctx.session.categorias=[...new Set(items.map(x=>x.categoria||'Otros'))].sort((a,b)=>a.localeCompare(b,'es'));
    return categorias(ctx,0);
  });
  async function categorias(ctx,page){const a=ctx.session.categorias||[];const total=Math.max(1,Math.ceil(a.length/7));page=Math.max(0,Math.min(page,total-1));
    const rows=a.slice(page*7,page*7+7).map((x,i)=>[[`📚 ${x.slice(0,25)}`,`cat:${page*7+i}:0`]]);
    const nav=[];if(page>0)nav.push(['⬅️ Anterior',`cats:${page-1}`]);if(page<total-1)nav.push(['➡️ Siguiente',`cats:${page+1}`]);if(nav.length)rows.push(nav);
    rows.push([['🏠 Menú','inicio']]);return ctx.reply(`Selecciona una categoría (${page+1}/${total}):`,kb(rows));}
  bot.action(/^cats:(\d+)$/,async ctx=>{await enter(ctx);return categorias(ctx,Number(ctx.match[1]));});
  bot.action(/^cat:(\d+):(\d+)$/,async ctx=>{await enter(ctx);
    const categoria=ctx.session.categorias?.[Number(ctx.match[1])];if(!categoria)return ctx.reply('Elige la categoría desde el menú.',inicio());
    const inventario=await db.getInventory(),items=inventario.filter(p=>p.categoria===categoria&&p.stock>0);
    const total=Math.max(1,Math.ceil(items.length/6)),page=Math.max(0,Math.min(Number(ctx.match[2]),total-1));
    const rows=items.slice(page*6,page*6+6).map(p=>[[`${p.producto.slice(0,36)} · ${pesos(p.precio)}`,`prod:${p.id}`]]);
    const nav=[];if(page>0)nav.push(['⬅️',`cat:${ctx.match[1]}:${page-1}`]);if(page<total-1)nav.push(['➡️',`cat:${ctx.match[1]}:${page+1}`]);if(nav.length)rows.push(nav);
    rows.push([['📚 Categorías','productos'],['🏠 Menú','inicio']]);
    return ctx.reply(`📚 ${categoria} (${page+1}/${total}). Escoge un artículo:`,kb(rows));
  });
  bot.action(/^prod:(\d+)$/,async ctx=>{await enter(ctx);const inv=await db.getInventory(),p=inv.find(x=>x.id===Number(ctx.match[1]));
    if(!p||p.stock<1)return ctx.reply('Artículo no disponible por ahora.');
    ctx.session.productoPendiente=Number(p.id);
    return ctx.reply(`${p.producto}\nPrecio provisional: ${pesos(p.precio)}\nExistencias registradas: ${p.stock}\n¿Cuántas piezas deseas?`,
      kb([[['1','prod_qty:1'],['2','prod_qty:2'],['3','prod_qty:3']],[['5','prod_qty:5'],['✏️ Otra cantidad','prod_qty:otra']],[['🏠 Menú','inicio']]]));
  });
  async function agregarProducto(ctx,qty){const inv=await db.getInventory(),p=inv.find(x=>x.id===ctx.session.productoPendiente);
    if(!p)return ctx.reply('Selecciona un producto primero.',inicio());
    if(qty>p.stock)return ctx.reply(`Solo figuran ${p.stock} unidades disponibles.`);
    const subtotal=Math.round(p.precio*qty*100)/100;
    if(ctx.session.carrito.length>=40)return ctx.reply('Carrito completo (40 conceptos).');
    ctx.session.carrito.push({tipo:'producto',productoId:p.id,nombre:p.producto,cantidad:qty,precioUnitario:p.precio,subtotal,
      descripcion:`${qty} x ${p.producto} (${pesos(subtotal)})`});ctx.session.productoPendiente=null;
    return ctx.reply(`✅ Agregado: ${qty} × ${p.producto}\nSubtotal ${pesos(subtotal)}`,seguir());}
  bot.action(/^prod_qty:(1|2|3|5|otra)$/,async ctx=>{await enter(ctx);
    if(!ctx.session.productoPendiente)return ctx.reply('Selecciona un producto primero.',inicio());
    if(ctx.match[1]==='otra'){ctx.session.esperando='cantidad_producto';return ctx.reply('Escribe la cantidad (1 a 1000):');}
    return agregarProducto(ctx,Number(ctx.match[1]));
  });
  bot.hears(/(\d+)\s*(copias?|hojas?|impresiones?)\s*(?:a|en|de)?\s*(color|blanco\s*y\s*negro)/i,async ctx=>{
    const qty=Number(ctx.match[1]);if(!Number.isSafeInteger(qty)||qty<1||qty>5000)return ctx.reply('Indica entre 1 y 5000 impresiones.');
    const kind=normalize(ctx.match[3])==='color'?'color':'bn',cfg=await db.getConfig(),unit=kind==='color'?cfg.precioColor:cfg.precioBN;
    if(ctx.session.carrito.length>=40)return ctx.reply('El carrito está completo.');
    ctx.session.carrito.push({tipo:'impresion',impresionTipo:kind,cantidad:qty,descripcion:`${qty} impresiones ${kind==='bn'?'blanco y negro':'a color'}`,precioUnitario:unit,subtotal:Math.round(qty*unit*100)/100});
    return ctx.reply(`✅ Agregadas ${qty} impresiones ${kind==='color'?'a color':'B/N'}: ${pesos(qty*unit)}`,seguir());
  });
  async function recotizar(ctx){
    const inv=await db.getInventory(),cfg=await db.getConfig(),byId=new Map(inv.map(p=>[Number(p.id),p]));const items=[];let total=0;
    for(const item of ctx.session.carrito){const x={...item};
      if(item.tipo==='producto'){const p=byId.get(Number(item.productoId));
        if(!p||p.stock<item.cantidad)return {error:`Existencias insuficientes para ${item.nombre||item.descripcion}.`};
        x.nombre=p.producto;x.precioUnitario=p.precio;x.descripcion=`${item.cantidad} x ${p.producto} (${pesos(p.precio*item.cantidad)})`;
      }else{x.precioUnitario=item.impresionTipo==='color'?cfg.precioColor:cfg.precioBN;
        if(item.tipo==='impresion_pdf') {const f=item.archivo;const q=cotizarPDF({...f,tipo:item.impresionTipo},cfg);
          x.cantidad=q.impresiones;x.descripcion=`PDF ${f.nombre} (${f.paginas} pág. × ${f.copias} copias, ${item.impresionTipo==='color'?'color':'B/N'}, ${f.dobleCara?'doble cara':'una cara'})`;
        }else x.descripcion=`${item.cantidad} impresiones ${item.impresionTipo==='color'?'a color':'blanco y negro'} (${pesos(x.precioUnitario*item.cantidad)})`;
      }
      x.subtotal=Math.round(x.precioUnitario*x.cantidad*100)/100;total+=x.subtotal;items.push(x);
    }
    ctx.session.carrito=items;return {items,total:Math.round(total*100)/100};
  }
  bot.action('carrito',async ctx=>{await enter(ctx);if(!ctx.session.carrito.length)return ctx.reply('🛒 Tu carrito está vacío.',inicio());
    const q=await recotizar(ctx);if(q.error)return ctx.reply(q.error);
    const lines=q.items.map((x,i)=>`${i+1}. ${x.descripcion} — ${pesos(x.subtotal)}`);
    return ctx.reply(`🛒 Tu carrito\n\n${lines.join('\n').slice(0,2800)}\n\nTotal estimado: ${pesos(q.total)}`,
      kb([[['🗑 Quitar artículo','quitar'],['🧹 Vaciar carrito','vaciar']], [['✅ Finalizar','checkout'],['🏠 Menú','inicio']]]));
  });
  bot.action('quitar',async ctx=>{await enter(ctx);if(!ctx.session.carrito.length)return ctx.reply('El carrito está vacío.',inicio());
    const rows=ctx.session.carrito.map((x,i)=>[[`❌ ${i+1}. ${x.descripcion.slice(0,33)}`,`quitar:${i}`]]);
    rows.push([['🏠 Menú','inicio']]);return ctx.reply('Elige qué artículo quitar:',kb(rows.slice(0,41)));
  });
  bot.action(/^quitar:(\d+)$/,async ctx=>{await enter(ctx);const i=Number(ctx.match[1]);if(i<0||i>=ctx.session.carrito.length)return ctx.reply('Elige un artículo válido.');
    ctx.session.carrito.splice(i,1);return ctx.reply('✅ Artículo eliminado.',seguir());
  });
  bot.action('vaciar',async ctx=>{await enter(ctx);return ctx.reply('¿Quieres vaciar todo el carrito?',kb([[['Sí, vaciar','vaciar_ok'],['No','carrito']]]));});
  bot.action('vaciar_ok',async ctx=>{await enter(ctx);ctx.session.carrito=[];return ctx.reply('✅ Carrito vaciado.',inicio());});
  bot.action('checkout',async ctx=>{await enter(ctx);if(!ctx.session.carrito.length)return ctx.reply('El carrito está vacío.',inicio());
    const q=await recotizar(ctx);if(q.error)return ctx.reply(q.error);
    const detalle=q.items.map(x=>`• ${x.descripcion} — ${pesos(x.subtotal)}`).join('\n');
    return ctx.reply(`🧾 Tu cotización\n\n${detalle.slice(0,2700)}\n\nTOTAL ESTIMADO: ${pesos(q.total)}\n\n¿Deseas registrar tu solicitud para mostrador?`,
      kb([[['🏪 Registrar pedido','comprar']],[['💬 Solo cotizar','cotizar'],['🛒 Modificar','carrito']]]));
  });
  bot.action('comprar',async ctx=>{await enter(ctx);
    if(!ctx.session.carrito.length)return ctx.reply('No hay artículos para registrar.',inicio());
    if(ctx.session.registrando)return ctx.reply('Tu pedido se está registrando; evita presionar nuevamente.');
    ctx.session.registrando=true;
    try {const q=await recotizar(ctx);if(q.error)return ctx.reply(q.error);
      const pedido={cliente:String(ctx.from?.first_name||'Estudiante').slice(0,100),telegramId:ctx.from?.id,total:q.total,
        articulos:q.items.map(i=>({productoId:i.tipo==='producto'?i.productoId:null,descripcion:i.descripcion,
          cantidad:i.cantidad,precioUnitario:i.precioUnitario,subtotal:i.subtotal,archivo:i.archivo||null}))};
      // Verificación final por si el horario terminó durante la cotización.
      if(estaAbierto((await db.getConfig()).horario,ahora())===false)return ctx.reply(MENSAJE_CERRADO);
      const r=await onOrder(pedido);ctx.session.carrito=[];ctx.session.pdfPendiente=null;
      await ctx.editMessageReplyMarkup({inline_keyboard:[]}).catch(()=>{});
      return ctx.reply(`✅ Solicitud registrada${r?.id?' · Folio '+r.id:''}\nTotal estimado: ${pesos(q.total)}\nTu pedido está pendiente de revisión. Recibirás un aviso por Telegram cuando sea aceptado o rechazado. No está pagado ni preparado.`,inicio());
    }catch(e){console.error('No se pudo registrar pedido:',e.code||e.name);return ctx.reply('⚠️ No fue posible registrar el pedido. No se ha confirmado; inténtalo más tarde.');}
    finally{ctx.session.registrando=false;}
  });
  bot.action('cotizar',async ctx=>{await enter(ctx);ctx.session.carrito=[];return ctx.reply('✅ Cotización mostrada. No se creó un pedido.',inicio());});
  bot.on('text',async ctx=>{
    const original=String(ctx.message.text||'').trim();if(!original||original.startsWith('/'))return;
    if(ctx.session.esperando==='copias_pdf'){
      const qty=Number(original);if(!/^\d+$/.test(original)||!Number.isSafeInteger(qty)||qty<1||qty>30)return ctx.reply('Escribe un número entre 1 y 30.');
      if(!ctx.session.pdfPendiente)return ctx.reply('Envíame primero el archivo PDF.',inicio());
      ctx.session.pdfPendiente.copias=qty;ctx.session.esperando=null;
      return ctx.reply('¿Cómo deseas imprimir?',kb([[['📄 Una cara','pdf_caras:una']],[['📖 Doble cara','pdf_caras:doble']]]));
    }
    if(ctx.session.esperando==='cantidad_producto'){
      const qty=Number(original);if(!/^\d+$/.test(original)||!Number.isSafeInteger(qty)||qty<1||qty>1000)return ctx.reply('Indica de 1 a 1000 unidades.');
      ctx.session.esperando=null;return agregarProducto(ctx,qty);
    }
    let search=normalize(original.replace(/^(quiero|dame|necesito|agregar|buscar)\s+/i,''));let qty=1;
    const m=search.match(/^(\d+)\s+(.+)/);if(m){qty=Number(m[1]);search=m[2];}
    if(!search||!Number.isSafeInteger(qty)||qty<1||qty>1000)return ctx.reply('Indica entre 1 y 1000 unidades.');
    const inventory=await db.getInventory(),words=search.split(/\s+/).filter(w=>w.length>2);
    const found=inventory.find(p=>words.length?words.every(w=>normalize(p.producto).includes(w)):normalize(p.producto).includes(search));
    if(!found)return ctx.reply(`No encontré «${original}». Intenta un nombre más corto o usa las categorías.`,inicio());
    if(found.stock<qty)return ctx.reply(`Solo figuran ${found.stock} unidades de «${found.producto}».`);
    ctx.session.productoPendiente=found.id;return agregarProducto(ctx,qty);
  });
  return bot;
}
module.exports={createBot};
