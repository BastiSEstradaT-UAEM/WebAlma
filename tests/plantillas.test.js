'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('node:vm');
const assert=require('assert');
const ejs=require('ejs');
const BASE=path.resolve(__dirname,'..');
const sample=[{id:1,producto:'Libreta de prueba',precio:25,stock:4,stock_minimo_sugerido:5,
  categoria:'Cuadernos',existencia_confirmada:false,precio_confirmado:false,datos_de_prueba:true}];
const {buildReportActivity}=require('../reportes_actividad');
const sampleReport=buildReportActivity(
  [{estado:'entregado',cantidad:2,cotizado:130},{estado:'rechazado',cantidad:3,cotizado:410}],
  [{dia:'2026-11-20',estado:'entregado',cantidad:2,cotizado:130},
   {dia:'2026-11-20',estado:'rechazado',cantidad:3,cotizado:410}],
  [{id:87,dia:'2026-11-20',hora:'17:30',estado:'rechazado',total:91,articulos:1,pdf:1}],
  {total_pdf:1,pedidos_pdf:1},{start:'2026-11-16',end:'2026-11-22'},'2026-11-20'
);
const data={inventario:sample,pedidosActivos:[],lowStock:sample,
  config:{stockMinimo:10,precioBN:1,precioColor:5,horario:'07:00 a 19:00',aviso:'',preciosValidados:false},
   horarioConfigurado:{apertura:'07:00',cierre:'19:00'},
  usuario:{id:1,nombre:'Administración',rol:'administradora'},csrf:'test-csrf',
   usuariosPersonal:[{id:1,nombre:'Administración',usuario:'admin',rol:'administradora',activo:true},
     {id:2,nombre:'Auxiliar',usuario:'auxiliar1',rol:'auxiliar',activo:true},
     {id:3,nombre:'Cuenta anterior',usuario:'inactiva',rol:'auxiliar',activo:false}],
  bounds:{start:'2026-11-16',end:'2026-11-22'},
  reporteActividad:sampleReport,
  report:{bn:{trabajos:0,hojas:0,ingresos:0},color:{trabajos:0,hojas:0,ingresos:0},total:0},
  recientes:[],totalUnidades:4,valorEstimado:100,seccion:'inventario',resultado:'',mensajeResultado:''};
for(const role of ['administradora','auxiliar']) {
  const html=ejs.render(fs.readFileSync(path.join(BASE,'views/gestor.ejs'),'utf8'),
    {...data,usuario:{id:1,nombre:'Prueba',rol:role}},{filename:path.join(BASE,'views/gestor.ejs')});
  assert(html.includes('Libreta de prueba'));
  assert(!html.includes('Datos en validación:'));
  assert(!html.includes('gran parte de los precios y existencias son de prueba'));
  assert(!html.includes('Confirmen los datos físicos con la propietaria'));
  assert(!html.includes('class="notice-bar"'));
  assert(html.includes('Stock por revisar'));
  if(role==='administradora'){
    assert(html.includes('id="reportHistoryFilter"'));
    assert(html.includes('Corte mensual'));
    assert(html.includes('Pedidos de la semana'));
    assert(html.includes('Estado de los pedidos'));
    assert(html.includes('Historial de pedidos</h2>'));
    assert(html.includes('id="reportHistoryResults" class="report-history-results" hidden'));
    assert(html.includes('id="reportHistoryBody"></tbody>'));
    assert(html.includes('id="reportView" type="submit" class="btn btn-primary">Ver</button>'));
  }
  assert(html.includes('/public/reportes-uaem-v1.css?v=2'));
  assert(html.includes('/public/reportes-historial-v1.js?v=1'));
  assert(html.includes('/public/panel.js?v=5'));
  assert(!html.includes('class="flash"'));

  assert(!html.includes('Historial de pedidos y pruebas'));
  assert(!html.includes('No hay una marca'));
  assert(!html.includes('Ver pruebas de hoy'));
  assert(!html.includes('Ver todos</button>'));
  assert(!html.includes('data-report-date="2026-11-20"'));
  assert(!html.includes('id="reportToday"'));
  assert(!html.includes('id="reportClear"'));
  assert(!html.includes('Conectado a PostgreSQL'));
  assert(!html.includes('class="topbar"'));
  assert(!html.includes('id="todayDate"'));
  assert(!html.includes('id="currentViewName"'));
  assert(html.includes('class="mobile-menu-bar"'));
  assert(html.includes('id="openSidebar"'));
  assert(html.includes('id="closeSidebar"'));
  assert(html.includes('class="sidebar"'));
  assert(html.includes('id="view-resumen"'));
  assert(html.includes('class="metric-grid"'));
  assert(html.includes('class="dashboard-grid"'));
  assert(html.includes('class="page-intro welcome-intro"'));
  assert(!html.includes('> Administrar inventario</button>'));
  assert(html.includes('data-go="pedidos"'));
  assert(html.includes('data-go="inventario"'));
  assert(!html.includes('class="insight-strip"'));
  assert(!html.includes('Aviso del establecimiento'));
  assert(html.includes('id="homeOrders"'));
  assert(html.includes('/public/panel-uaem-v1.css?v=9'));
  assert(html.includes('PAPELERÍA UNIVERSITARIA'));
  assert(!html.includes('Papelería UAEM · Valle de Chalco'));
  assert(html.includes('Papelería universitaria'));
  assert(html.includes('CU UAEM Valle de Chalco'));
  assert(html.includes('Centro Universitario UAEM Valle de Chalco'));
  assert(html.includes('escudo-uaem-nitido.svg'));
  assert(html.includes('<link rel="icon" type="image/svg+xml" sizes="any" href="/public/escudo-uaem-nitido.svg?v=2">'));
  assert(!html.includes('rel="icon" href="/favicon.ico"'));
  assert(!html.includes('/public/escudo-uaem.webp'));
  assert(html.includes('WebAlma'));
  if(role==='administradora') { 
    assert(html.includes('reportes/mensual.csv'));
    assert(html.includes('data-nav="reportes"'));
    assert(html.includes('id="view-reportes"'));
    assert(html.includes('<th>Estado</th><th class="align-right">Acciones</th>'));
    assert(html.includes('value="unverified"'));
    assert(html.includes('Movimiento</span></button>'));
  assert(html.includes('data-nav="configuracion"'));
  assert(html.includes('data-go="configuracion"'));
  assert(html.includes('id="view-configuracion"'));
  assert(html.includes('class="settings-board"'));
  assert(html.includes('class="section-card pad-card settings-operations"'));
  assert(html.includes('class="section-card pad-card settings-create"'));
  assert(html.includes('class="section-card pad-card settings-accounts"'));
  assert(html.includes('ADMINISTRACIÓN</div>'));
  assert(html.includes('name="horaApertura"'));
  assert(html.includes('name="horaCierre"'));
  assert(html.includes('type="time"'));
  assert(!html.includes('id="openingHours"'));
  assert(!html.includes('name="horario"'));
  assert(html.includes('Se aplica todos los días'));
  assert(!html.includes('El horario anterior no es válido.'));
  assert(!html.includes('0:600am a 19:00pm'));
    assert(html.includes('id="archiveProductForm"'));
    assert(html.includes('id="archiveProductBtn"'));
    assert(html.includes('Usuarios y contraseñas'));
    assert(html.includes('action="/configuracion/usuarios/crear"'));
    assert(html.includes('action="/configuracion/usuarios/2/actualizar"'));
    assert(html.includes('action="/configuracion/usuarios/2/desactivar"'));
    assert(!html.includes('action="/configuracion/usuarios/1/desactivar"'));
    assert(html.includes('Cuenta anterior'));
    assert(html.includes('Inactiva'));
    assert(html.includes('name="claveActual"'));
    assert(!html.includes('name="password" value='));
    assert(!html.includes('contrasena_hash'));

    assert(html.includes('class="archive-product-info"'));
    assert(html.includes('class="archive-product-copy"'));
    assert(html.includes('class="btn btn-reject archive-product-action"'));
    assert(html.includes('href="#i-trash"'));

    assert(html.includes('Eliminar del catálogo'));
    assert(html.includes('data-confirm="¿Retirar este artículo del catálogo?'));
    assert(html.includes('id="archiveProductForm" class="archive-product-form" method="post"'));
    assert(html.includes('name="_csrf" value="test-csrf"'));
  } else {
    assert(!html.includes('data-nav="reportes"'));
    assert(!html.includes('id="view-reportes"'));
    assert(!html.includes('id="reportHistoryFilter"'));
    assert(!html.includes('reportes/mensual.csv'));
    assert(!html.includes('<th>Estado</th>'));
    assert(!html.includes('<th class="align-right">Acciones</th>'));
    assert(!html.includes('value="unverified"'));
    assert(!html.includes('class="actions-cell"'));
    assert(html.includes('Consulta los productos, precios y existencias'));
    assert(!html.includes('data-nav="configuracion"'));
    assert(!html.includes('data-go="configuracion"'));
    assert(!html.includes('id="view-configuracion"'));
    assert(!html.includes('ADMINISTRACIÓN</div>'));
    assert(!html.includes('name="horaApertura"'));
    assert(!html.includes('name="horaCierre"'));
    assert(!html.includes('id="openingHours"'));
    assert(!html.includes('id="newProductBtn"'));
    assert(!html.includes('action="/configuracion/usuarios/crear"'));
    assert(!html.includes('action="/configuracion/usuarios/2/actualizar"'));
    assert(!html.includes('Usuarios y contraseñas'));

    assert(!html.includes('id="archiveProductForm"'));
    assert(!html.includes('id="archiveProductBtn"'));
  }
}
// El mensaje de éxito debe llegar en el HTML: JS puede estar desactivado o cacheado.
const template=fs.readFileSync(path.join(BASE,'views/gestor.ejs'),'utf8');
for (const role of ['administradora','auxiliar']) {
  const confirmHtml=ejs.render(template,{
    ...data,usuario:{id:1,nombre:'Prueba',rol:role},
    seccion:'configuracion',resultado:'configuracion_guardada',
    mensajeResultado:'Configuración guardada correctamente.'
  },{filename:path.join(BASE,'views/gestor.ejs')});
  assert(confirmHtml.includes('data-flash="configuracion_guardada"'));
  assert(confirmHtml.includes('role="status">Configuración guardada correctamente.</div>'));
  assert(!confirmHtml.includes('data-flash="configuracion_guardada" role="status"></div>'));
}
const badDataHtml=ejs.render(template,{
  ...data,resultado:'datos_invalidos',mensajeResultado:'Revisa los datos del formulario.'
},{filename:path.join(BASE,'views/gestor.ejs')});
assert(badDataHtml.includes('role="status">Revisa los datos del formulario.</div>'));
const panelScript=fs.readFileSync(path.join(BASE,'public/panel.js'),'utf8');
assert(!panelScript.includes("$('#currentViewName')"));
assert(!panelScript.includes("$('#todayDate')"));
assert(panelScript.includes("$('#openSidebar')"));
assert(panelScript.includes("$('#archiveProductForm')"));
assert(panelScript.includes("/archivar"));
assert(panelScript.includes('archiveForm.hidden = true'));
assert(panelScript.includes('archiveForm.hidden = false'));
const dbSource=fs.readFileSync(path.join(BASE,'db.js'),'utf8');
const serverSource=fs.readFileSync(path.join(BASE,'servidor_web.js'),'utf8');
assert(serverSource.includes("['configuracion','reportes'].includes(clean(req.query.seccion,24))"));
assert(serverSource.includes("app.get('/reportes/historial',auth,admin,"));
assert(serverSource.includes("app.get('/reportes/semanal.csv',auth,admin,"));
assert(serverSource.includes("app.get('/reportes/mensual.csv',auth,admin,"));
assert(serverSource.includes("return res.redirect('/gestor?seccion=resumen')"));
assert(panelScript.includes("$('[data-view]').some(el => el.dataset.view === name)"));
assert(serverSource.includes('const horario=validarHorario(req.body.horaApertura,req.body.horaCierre)'));
assert(serverSource.includes("if(!horario)return go(res,'horario_invalido','configuracion')"));
assert(serverSource.includes("app.post('/configuracion/usuarios/crear',auth,admin,csrf,async(req,res)=>{"));
assert(serverSource.includes("app.post('/configuracion/usuarios/:id/actualizar',auth,admin,csrf,async(req,res)=>{"));
assert(serverSource.includes("app.post('/configuracion/usuarios/:id/desactivar',auth,admin,csrf,async(req,res)=>{"));
assert(serverSource.includes("db.getActiveUser(req.session.usuario.id)"));
assert(dbSource.includes('UPDATE public.usuarios SET activo=FALSE WHERE id=$1'));
assert(dbSource.includes("DELETE FROM public.web_sessions WHERE sess->'usuario'->>'id'=$1::text"));
assert(dbSource.includes('if(existing.rows.length)return;'));
assert(!dbSource.includes('DELETE FROM public.usuarios'));

assert(dbSource.includes('UPDATE public.productos SET activo=FALSE WHERE id=$1 AND activo=TRUE RETURNING id'));
assert(!dbSource.includes('DELETE FROM public.productos'));
assert(dbSource.includes('WHERE p.activo = TRUE ORDER BY p.id'));
assert(serverSource.includes("app.post('/inventario/:id/archivar',auth,admin,csrf,async(req,res)=>{"));
assert(serverSource.includes("io.emit('inventario_actualizado')"));
assert(serverSource.includes("producto_archivado:'Producto retirado del catálogo. Su historial se conserva.'"));

const institutionalCss=fs.readFileSync(path.join(BASE,'public/panel-uaem-v1.css'),'utf8');
assert(institutionalCss.includes('#initialStockField[hidden]{display:none!important}'));
assert(institutionalCss.includes('.archive-product-form[hidden]{display:none!important}'));
assert(institutionalCss.includes('.archive-product-copy p{'));
assert(institutionalCss.includes('@media(max-width:600px)'));

assert(institutionalCss.includes('.mobile-menu-bar{display:none}'));
assert(institutionalCss.includes('html:has(#view-resumen:not([hidden]))'));
assert(institutionalCss.includes('body:has(#view-resumen:not([hidden])) .layout'));
assert(institutionalCss.includes('grid-template-rows:auto auto minmax(0,1fr) auto'));
assert(institutionalCss.includes('overscroll-behavior:contain'));
assert(institutionalCss.includes('#view-resumen > .welcome-intro h1'));
assert(institutionalCss.includes('min-height:clamp(123px,17dvh,160px)'));
assert(institutionalCss.includes('grid-template-rows:minmax(0,.95fr) auto minmax(0,1.05fr)'));
assert(institutionalCss.includes('#view-resumen #homeOrders .empty-state'));
assert(institutionalCss.includes('@media (min-width:1061px) and (min-height:570px)'));
assert(institutionalCss.includes('.content:has(#view-resumen:not([hidden]))'));
assert(institutionalCss.includes('max-height:100dvh'));
assert(institutionalCss.includes('#view-resumen > .dashboard-grid > .panel'));
assert(institutionalCss.includes('@media (min-width:1180px) and (min-height:740px)'));
assert(institutionalCss.includes('.mobile-menu-bar .hamburger'));
const pedidoEjemplo={id:'55',cliente:'Estudiante de prueba',total:12,hora:'12:00',articulos:['PDF Tarea.pdf'],documentos:[{id:'9',nombre:'Tarea.pdf'}]};
const ejemploHTML=ejs.render(fs.readFileSync(path.join(BASE,'views/gestor.ejs'),'utf8'),
  {...data,pedidosActivos:[pedidoEjemplo]},{filename:path.join(BASE,'views/gestor.ejs')});
assert(ejemploHTML.includes('/pedidos/55/archivos/9/descargar'));
assert(ejemploHTML.includes('/pedidos/55/aceptar'));
assert(ejemploHTML.includes('/pedidos/55/rechazar'));
assert(!ejemploHTML.includes('action="/completar_pedido/55"'));
const aceptadoHTML=ejs.render(fs.readFileSync(path.join(BASE,'views/gestor.ejs'),'utf8'),
  {...data,pedidosActivos:[{...pedidoEjemplo,estado:'aceptado'}]},{filename:path.join(BASE,'views/gestor.ejs')});
assert(aceptadoHTML.includes('action="/completar_pedido/55"'));
assert(!aceptadoHTML.includes('action="/pedidos/55/rechazar"'));
const login=ejs.render(fs.readFileSync(path.join(BASE,'views/login.ejs'),'utf8'),{error:false,csrf:'test'});
assert(login.includes('login'));
assert(login.includes('login-uaem'));
assert(login.includes('/public/login-uaem-v3.css?v=4'));
assert(!login.includes('/public/login-uaem-v2.css'));
assert(!login.includes('/public/panel.css'));
assert(login.includes('uaem-side-wave'));
assert(login.includes('uaem-sparkle'));
assert(login.includes('<svg class="button-arrow"'));
assert(!login.includes('🛒'));
const loginCss=fs.readFileSync(path.join(BASE,'public/login-uaem-v3.css'),'utf8');
assert(loginCss.includes('grid-template-columns:minmax(0,44%) minmax(0,56%)'));
assert(loginCss.includes('height:100dvh'));
assert(loginCss.includes('overflow:hidden'));
assert(loginCss.includes('transform:scale(1.10)'));
assert(loginCss.includes('transform-origin:center bottom'));
assert(loginCss.includes('@media (max-width:800px)'));
assert(loginCss.includes('background:linear-gradient(150deg,#126847,#084e36)'));
assert(login.includes('Centro Universitario UAEM'));
assert(login.includes('cuxi-webalma-nitido.svg'));
assert(!login.includes('src="/public/cuxi-papeleria.webp"'));
const cuxiAsset=fs.readFileSync(path.join(BASE,'public/cuxi-webalma-nitido.svg'),'utf8');
assert(cuxiAsset.includes('data:image/avif;base64,'),'La nueva ilustración de Cuxi debe incluir el recurso de alta definición');
assert(cuxiAsset.length>15000,'El recurso de Cuxi no debe ser una miniatura vacía');
assert(login.includes('escudo-uaem-nitido.svg'));
assert(login.includes('<link rel="icon" type="image/svg+xml" sizes="any" href="/public/escudo-uaem-nitido.svg?v=2">'));
assert(!login.includes('rel="icon" href="/favicon.ico"'));
assert(!login.includes('/public/escudo-uaem.webp'));
assert(login.includes('WebAlma · Sistema de gestión en la nube · 2026'));
assert(!login.includes('Sistema de gestión local'));
assert(login.includes('method="post"'));
assert(login.includes('name="_csrf"'));
assert(login.includes('autocomplete="username"'));
assert(login.includes('autocomplete="current-password"'));
const loginError=ejs.render(fs.readFileSync(path.join(BASE,'views/login.ejs'),'utf8'),{error:true,csrf:'test'});
assert(loginError.includes('role="alert"'));
for(const asset of ['cuxi-papeleria.webp','escudo-uaem-nitido.svg']) {
  const filepath=path.join(BASE,'public',asset);
  assert(fs.existsSync(filepath),`Falta recurso visual: ${asset}`);
  assert(fs.statSync(filepath).size>1000,`Imagen vacía o dañada: ${asset}`);
}

// Comprobaciones de identidad visual de la papelería (sin tocar la lógica).
const uaemPanelCss=fs.readFileSync(path.join(BASE,'public/panel-uaem-v1.css'),'utf8');
assert(uaemPanelCss.includes('.sidebar'));
assert(uaemPanelCss.includes('#075338'));
assert(uaemPanelCss.includes('.nav-item.active'));
assert(uaemPanelCss.includes('.btn-primary'));
assert(uaemPanelCss.includes('.modal'));
assert(uaemPanelCss.includes('.data-table'));
const escudoSVG=fs.readFileSync(path.join(BASE,'public/escudo-uaem-nitido.svg'),'utf8');
assert(escudoSVG.includes('<svg') && escudoSVG.includes('</svg>'));
assert(!/<script\b|onload\s*=|javascript:/i.test(escudoSVG));
assert(fs.statSync(path.join(BASE,'public/escudo-uaem-nitido.svg')).size>10000);
const reportCss=fs.readFileSync(path.join(BASE,'public/reportes-uaem-v1.css'),'utf8');
assert(reportCss.includes('.report-bars'));
assert(reportCss.includes('.report-state-chart'));
assert(reportCss.includes('.report-history-table'));
console.log('Prueba de plantillas: OK (administración, auxiliar, login).');

// Prueba real de navegación ejecutando panel.js con un DOM mínimo simulado:
// protege contra errores como llamar .some() sobre querySelector(), que bloqueó todos los menús.
const navigationSource=fs.readFileSync(path.join(BASE,'public/panel.js'),'utf8');
function probarNavegacion(rol,primeraSeccion){
  const nombres=['resumen','inventario','pedidos','impresiones',...(rol==='administradora'?['reportes','configuracion']:[])];
  const vistas=nombres.map(nombre=>({dataset:{view:nombre},hidden:true}));
  const botones=nombres.map(nombre=>({
    dataset:{nav:nombre},
    classList:{toggle(){},remove(){},add(){}},
    setAttribute(){},
    addEventListener(tipo,fn){if(tipo==='click')this.click=fn;}
  }));
  const barraLateral={classList:{remove(){},add(){}}};
  const documento={
    body:{dataset:{initialSection:primeraSeccion}},
    querySelector(selector){return selector==='#sidebar'?barraLateral:null;},
    querySelectorAll(selector){return selector==='[data-view]'?vistas:selector==='[data-nav]'?botones:[];},
    getElementById(){return null;},
    addEventListener(){}
  };
  let url='';
  vm.runInNewContext(navigationSource,{
    document:documento,
    window:{io:null,scrollTo(){}},
    history:{replaceState(_a,_b,path){url=path;}},
    location:{reload(){}},
    console,
    setTimeout(){}
  },{timeout:2000});
  const inicial=nombres.includes(primeraSeccion)?primeraSeccion:'resumen';
  assert.strictEqual(vistas.find(v=>!v.hidden)?.dataset.view,inicial);
  for(const nombre of nombres){
    const boton=botones.find(b=>b.dataset.nav===nombre);
    assert.strictEqual(typeof boton.click,'function','Clic funcional: '+rol+'/'+nombre);
    boton.click();
    assert.strictEqual(vistas.find(v=>!v.hidden)?.dataset.view,nombre,'Vista visible: '+rol+'/'+nombre);
    assert.strictEqual(url,'/gestor?seccion='+encodeURIComponent(nombre));
  }
  if(rol==='auxiliar'){
    assert(!botones.some(b=>['configuracion','reportes'].includes(b.dataset.nav)));
    assert(!vistas.some(v=>['configuracion','reportes'].includes(v.dataset.view)));
  }
}
probarNavegacion('auxiliar','resumen');
probarNavegacion('auxiliar','configuracion');
probarNavegacion('auxiliar','reportes');
probarNavegacion('administradora','configuracion');
console.log('Navegación por rol simulada: módulos del auxiliar y configuración de administradora OK.');
