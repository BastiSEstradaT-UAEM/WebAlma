'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const ejs=require('ejs');
const BASE=path.resolve(__dirname,'..');
const sample=[{id:1,producto:'Libreta de prueba',precio:25,stock:4,stock_minimo_sugerido:5,
  categoria:'Cuadernos',existencia_confirmada:false,precio_confirmado:false,datos_de_prueba:true}];
const data={inventario:sample,pedidosActivos:[],lowStock:sample,
  config:{stockMinimo:10,precioBN:1,precioColor:5,horario:'07:00 a 19:00',aviso:'',preciosValidados:false},
  usuario:{id:1,nombre:'Administración',rol:'administradora'},csrf:'test-csrf',
  bounds:{start:'2026-11-02',end:'2026-11-08'},
  report:{bn:{trabajos:0,hojas:0,ingresos:0},color:{trabajos:0,hojas:0,ingresos:0},total:0},
  recientes:[],totalUnidades:4,valorEstimado:100,seccion:'inventario',resultado:''};
for(const role of ['administradora','auxiliar']) {
  const html=ejs.render(fs.readFileSync(path.join(BASE,'views/gestor.ejs'),'utf8'),
    {...data,usuario:{id:1,nombre:'Prueba',rol:role}},{filename:path.join(BASE,'views/gestor.ejs')});
  assert(html.includes('Libreta de prueba'));
  assert(html.includes('Corte mensual'));
  assert(html.includes('Conectado a PostgreSQL'));
  assert(html.includes('reportes/mensual.csv'));
  if(role==='auxiliar')assert(!html.includes('id="newProductBtn"'));
}
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
console.log('Prueba de plantillas: OK (administración, auxiliar, login).');
