'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const sections = { resumen: 'Vista general', inventario: 'Inventario', pedidos: 'Pedidos de Telegram', impresiones: 'Copias e impresiones', reportes: 'Reportes', configuracion: 'Configuración' };
  const money = n => Number(n || 0).toLocaleString('es-MX', {style:'currency',currency:'MXN'});
  const toast = (title, detail = '') => {
    const host = $('#toasts');
    if (!host) return;
    const e = document.createElement('div'); e.className = 'toast';
    const heading = document.createElement('strong'); heading.textContent = title;
    const body = document.createElement('span'); body.textContent = detail;
    e.append(heading,body); host.prepend(e);
    setTimeout(() => e.remove(), 5500);
  };
  const show = name => {
    const view = Object.hasOwn(sections, name) ? name : 'resumen';
    $$('[data-view]').forEach(el => el.hidden = el.dataset.view !== view);
    $$('[data-nav]').forEach(el => { el.classList.toggle('active', el.dataset.nav === view); el.setAttribute('aria-current',el.dataset.nav===view?'page':'false'); });
    $('#currentViewName').textContent = sections[view];
    $('#sidebar').classList.remove('open');
    history.replaceState(null,'',`/gestor?seccion=${encodeURIComponent(view)}`);
    window.scrollTo({top:0,behavior:'instant'});
  };
  $$('[data-nav]').forEach(b => b.addEventListener('click', () => show(b.dataset.nav)));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  if ($('#openSidebar')) $('#openSidebar').addEventListener('click', () => $('#sidebar').classList.add('open'));
  if ($('#closeSidebar')) $('#closeSidebar').addEventListener('click', () => $('#sidebar').classList.remove('open'));
  show(document.body.dataset.initialSection || 'resumen');
  const today = $('#todayDate');
  if (today) today.textContent = new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Mexico_City'}).format(new Date());

  const flash = $('[data-flash]');
  const messages = {producto_agregado:'Producto agregado al catálogo.',producto_actualizado:'Producto actualizado correctamente.',movimiento_registrado:'Movimiento de inventario registrado.',impresion_registrada:'Servicio de impresión registrado.',pedido_entregado:'Pedido marcado como entregado.',configuracion_guardada:'Configuración guardada.',datos_invalidos:'Revisa los datos del formulario.',movimiento_invalido:'Movimiento inválido: revisa existencias y cantidad.',lotes_inconsistentes:'Los lotes no coinciden con el inventario. Revisa la información.',pedido_no_encontrado:'El pedido ya no está pendiente.'};
  if (flash) flash.textContent = messages[flash.dataset.flash] || 'Operación terminada.';

  const filterInventory = () => {
    if (!$('#inventorySearch')) return;
    const query = $('#inventorySearch').value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const category = $('#categoryFilter').value;
    const stock = $('#stockFilter').value;
    let shown = 0;
    $$('[data-product-row]').forEach(row => {
      const text = row.dataset.search.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const found = text.includes(query) && (!category || row.dataset.category === category) &&
        (!stock || (stock === 'low' && row.dataset.low === 'true') || (stock === 'empty' && row.dataset.empty === 'true') || (stock === 'unverified' && row.dataset.unverified === 'true'));
      row.hidden = !found;
      if (found) shown++;
    });
    $('#inventoryCounter').textContent = `Mostrando ${shown} de ${window.WEBALMA_PANEL.totalInventario} productos`;
  };
  ['inventorySearch','categoryFilter','stockFilter'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener(id === 'inventorySearch' ? 'input' : 'change', filterInventory);
  });
  const productModal = $('#productModal'), movementModal = $('#movementModal');
  const closeModals = () => { if(productModal)productModal.hidden = true; if(movementModal)movementModal.hidden = true; };
  $$('.close-modal').forEach(b => b.addEventListener('click',closeModals));
  $$('.modal-backdrop').forEach(modal => modal.addEventListener('mousedown',e => { if(e.target === modal)closeModals(); }));
  document.addEventListener('keydown',e=> { if(e.key === 'Escape')closeModals(); });
  if ($('#newProductBtn')) $('#newProductBtn').addEventListener('click', () => {
    $('#productForm').reset();
    $('#productForm').action = '/inventario/nuevo';
    $('#productModalTitle').textContent = 'Nuevo producto';
    $('#initialStockField').hidden = false;
    $('#formStock').disabled = false;
    productModal.hidden = false;
    $('#formProductName').focus();
  });
  $$('.edit-btn').forEach(b => b.addEventListener('click', () => {
    const d = b.dataset;
    $('#productForm').action = `/inventario/${encodeURIComponent(d.id)}/editar`;
    $('#productModalTitle').textContent = `Editar producto #${d.id}`;
    $('#formProductName').value = d.name;
    $('#formCategory').value = d.category;
    $('#formPrice').value = d.price;
    $('#formMin').value = d.minimum;
    $('#formExistence').checked = d.existence === 'true';
    $('#formPriceVerified').checked = d.priceVerified === 'true';
    $('#initialStockField').hidden = true;
    $('#formStock').disabled = true;
    productModal.hidden = false;
    $('#formProductName').focus();
  }));
  $$('.movement-btn').forEach(b => b.addEventListener('click', () => {
    $('#movementForm').reset();
    $('#movementForm').action = `/inventario/${encodeURIComponent(b.dataset.id)}/movimiento`;
    $('#movementTitle').textContent = 'Registrar movimiento';
    $('#movementProductName').textContent = `${b.dataset.name} · ${b.dataset.stock} unidades actuales`;
    movementModal.hidden = false;
  }));
  const updatePrintEstimate = () => {
    if (!$('#printType')) return;
    const price = $('#printType').value === 'color' ? window.WEBALMA_PANEL.precioColor : window.WEBALMA_PANEL.precioBN;
    const qty = Math.max(0, Number($('#printQuantity').value) || 0);
    $('#estimatedPrintTotal').textContent = money(price * qty);
  };
  if ($('#printType')) { $('#printType').addEventListener('change',updatePrintEstimate); $('#printQuantity').addEventListener('input',updatePrintEstimate); }

  const ordersList = $('#ordersList');
  const make = (tag,className,text) => { const el = document.createElement(tag); if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; };
  const addOrder = pedido => {
    if (!ordersList || !pedido || !Array.isArray(pedido.articulos)) return;
    $('#ordersEmpty')?.remove();
    const card = make('article','order-card'); card.dataset.orderId = pedido.id;
    const head = make('div','order-head');
    const customer = make('div','order-customer');
    const avatar = make('div','mini-avatar',(pedido.cliente || 'E').slice(0,1).toUpperCase());
    const customerBody = make('div');customerBody.append(make('strong','',pedido.cliente || 'Estudiante'),make('small','',pedido.hora || 'Ahora'));
    customer.append(avatar,customerBody);head.append(customer,make('span','badge badge-orange','Por atender'));
    const items = make('div','order-items');pedido.articulos.forEach(line=>items.append(make('div','','• '+String(line))));
    if(Array.isArray(pedido.documentos) && pedido.documentos.length){
      const docs=make('div','order-items');docs.append(make('strong','','PDF para imprimir:'));
      pedido.documentos.forEach(doc=>{
        const line=make('div');const link=make('a','',`📄 ${doc.nombre}`);
        link.href=`/pedidos/${encodeURIComponent(pedido.id)}/archivos/${encodeURIComponent(doc.id)}/descargar`;
        line.append(link);docs.append(line);
      });card.append(docs);
    }
    const bottom = make('div','order-bottom');const total = make('div');total.append(make('small','','Total cotizado'),make('strong','',money(pedido.total)));
    const form = make('form');form.method='POST';form.action=`/completar_pedido/${encodeURIComponent(pedido.id)}`;
    const csrf = make('input');csrf.type='hidden';csrf.name='_csrf';csrf.value=window.WEBALMA_PANEL.csrf;
    const submit = make('button','btn btn-success','✓  Marcar entregado');submit.type='submit';form.append(csrf,submit);bottom.append(total,form);
    card.append(head,items,bottom);ordersList.prepend(card);
    const n = $$('[data-order-id]').length;
    $('#ordersCounter').textContent = `${n} pendientes`;
    $('#navOrderCount').textContent = n;
    $('#metricPending').textContent = n;
    toast('Nuevo pedido desde Telegram', `${pedido.cliente || 'Estudiante'} · ${money(pedido.total)}`);
  };
  const socketStatus = $('#socketStatus');
  if (window.io) {
    const socket = io();
    socket.on('connect',()=>{if(socketStatus)socketStatus.textContent='Conectado en vivo';});
    socket.on('disconnect',()=>{if(socketStatus)socketStatus.textContent='Reconectando...';});
    socket.on('alerta_nuevo_pedido',addOrder);
    const refreshSharedData=()=>{if(document.querySelector('.modal-backdrop:not([hidden])')){toast('Datos actualizados en otro dispositivo','Cierra el formulario y recarga la página.');return;}
      location.reload();};
    socket.on('inventario_actualizado',refreshSharedData);
    socket.on('impresion_actualizada',refreshSharedData);
    socket.on('configuracion_actualizada',refreshSharedData);
    socket.on('pedido_completado',data=>{
      const item = $$('[data-order-id]').find(el => el.dataset.orderId === data.id);
      item?.remove();
      const n = $$('[data-order-id]').length;
      $('#ordersCounter').textContent = `${n} pendientes`;
      $('#navOrderCount').textContent = n;
      $('#metricPending').textContent = n;
    });
  } else if(socketStatus)socketStatus.textContent='Sin conexión';
})();
