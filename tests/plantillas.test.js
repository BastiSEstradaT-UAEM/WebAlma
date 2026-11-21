'use strict';
const fs=require('fs');
const path=require('path');
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
  usuario:{id:1,nombre:'Administración',rol:'administradora'},csrf:'test-csrf',
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
  assert(html.includes('id="reportHistoryFilter"'));
  assert(html.includes('Corte mensual'));
  assert(html.includes('Pedidos de la semana'));
  assert(html.includes('Estado de los pedidos'));
  assert(html.includes('Historial de pedidos</h2>'));
  assert(html.includes('id="reportHistoryFilter"'));
  assert(html.includes('id="reportHistoryResults" class="report-history-results" hidden'));
  assert(html.includes('id="reportHistoryBody"></tbody>'));
  assert(html.includes('id="reportView" type="submit" class="btn btn-primary">Ver</button>'));
  assert(html.includes('/public/reportes-uaem-v1.css?v=2'));
  assert(html.includes('/public/reportes-historial-v1.js?v=1'));
  assert(html.includes('/public/panel.js?v=3'));
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
  assert(html.includes('/public/panel-uaem-v1.css?v=1'));
  assert(html.includes('PAPELERÍA UNIVERSITARIA'));
  assert(!html.includes('Papelería UAEM · Valle de Chalco'));
  assert(html.includes('Papelería universitaria'));
  assert(html.includes('CU UAEM Valle de Chalco'));
  assert(html.includes('Centro Universitario UAEM Valle de Chalco'));
  assert(html.includes('escudo-uaem.webp'));
  assert(html.includes('WebAlma'));
  assert(html.includes('reportes/mensual.csv'));
  if(role==='administradora') {
    assert(html.includes('id="archiveProductForm"'));
    assert(html.includes('id="archiveProductBtn"'));
    assert(html.includes('Eliminar del catálogo'));
    assert(html.includes('data-confirm="¿Retirar este artículo del catálogo?'));
    assert(html.includes('id="archiveProductForm" class="archive-product-form" method="post"'));
    assert(html.includes('name="_csrf" value="test-csrf"'));
  } else {
    assert(!html.includes('id="newProductBtn"'));
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
assert(dbSource.includes('UPDATE public.productos SET activo=FALSE WHERE id=$1 AND activo=TRUE RETURNING id'));
assert(!dbSource.includes('DELETE FROM public.productos'));
assert(dbSource.includes('WHERE p.activo = TRUE ORDER BY p.id'));
assert(serverSource.includes("app.post('/inventario/:id/archivar',auth,admin,csrf,async(req,res)=>{"));
assert(serverSource.includes("io.emit('inventario_actualizado')"));
assert(serverSource.includes("producto_archivado:'Producto retirado del catálogo. Su historial se conserva.'"));

const institutionalCss=fs.readFileSync(path.join(BASE,'public/panel-uaem-v1.css'),'utf8');
assert(institutionalCss.includes('.mobile-menu-bar{display:none}'));
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
assert(login.includes('/public/login-uaem-v3.css?v=3'));
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
assert(loginCss.includes('@media (max-width:800px)'));
assert(loginCss.includes('background:linear-gradient(150deg,#126847,#084e36)'));
assert(login.includes('Centro Universitario UAEM'));
assert(login.includes('cuxi-papeleria.webp'));
assert(login.includes('escudo-uaem.webp'));
assert(login.includes('method="post"'));
assert(login.includes('name="_csrf"'));
assert(login.includes('autocomplete="username"'));
assert(login.includes('autocomplete="current-password"'));
const loginError=ejs.render(fs.readFileSync(path.join(BASE,'views/login.ejs'),'utf8'),{error:true,csrf:'test'});
assert(loginError.includes('role="alert"'));
for(const asset of ['cuxi-papeleria.webp','escudo-uaem.webp']) {
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
assert(fs.statSync(path.join(BASE,'public/escudo-uaem.webp')).size>1000);
const reportCss=fs.readFileSync(path.join(BASE,'public/reportes-uaem-v1.css'),'utf8');
assert(reportCss.includes('.report-bars'));
assert(reportCss.includes('.report-state-chart'));
assert(reportCss.includes('.report-history-table'));
console.log('Prueba de plantillas: OK (administración, auxiliar, login).');
