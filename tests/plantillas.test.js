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
const login=ejs.render(fs.readFileSync(path.join(BASE,'views/login.ejs'),'utf8'),{error:false,csrf:'test'});
assert(login.includes('login'));
console.log('Prueba de plantillas: OK (administración, auxiliar, login).');
