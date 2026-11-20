'use strict';
const assert=require('node:assert/strict');
const {cotizarPDF,MAX_BYTES,MAX_PAGES}=require('../pdf_cotizador');
const cfg={precioBN:1,precioColor:5};
assert.deepEqual(cotizarPDF({paginas:12,copias:1,tipo:'bn',dobleCara:false},cfg),{
  paginas:12,copias:1,impresiones:12,hojas:12,tipo:'bn',dobleCara:false,precioUnitario:1,total:12
});
assert.equal(cotizarPDF({paginas:12,copias:3,tipo:'color',dobleCara:true},cfg).total,180);
assert.equal(cotizarPDF({paginas:11,copias:2,tipo:'bn',dobleCara:true},cfg).hojas,12);
assert.throws(()=>cotizarPDF({paginas:0,copias:1,tipo:'bn'},cfg));
assert.throws(()=>cotizarPDF({paginas:201,copias:1,tipo:'bn'},cfg));
assert.throws(()=>cotizarPDF({paginas:2,copias:31,tipo:'bn'},cfg));
assert.throws(()=>cotizarPDF({paginas:2,copias:1,tipo:'fake'},cfg));
assert.equal(MAX_BYTES,8388608);assert.equal(MAX_PAGES,200);
console.log('Cotización PDF: pruebas de tarifas, páginas, copias y doble cara superadas.');
