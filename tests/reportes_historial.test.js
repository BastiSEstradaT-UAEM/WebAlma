'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element{
  constructor(id){
    this.id=id;this.value='';this.hidden=false;this.disabled=false;
    this.textContent='';this.className='';this.children=[];this.handlers={};
  }
  addEventListener(name,cb){this.handlers[name]=cb;}
  replaceChildren(){this.children=[];}
  append(...children){this.children.push(...children);}
}
const ids=['reportHistoryFilter','reportDateFilter','reportStatusFilter','reportView',
  'reportHistoryHint','reportHistoryResults','reportHistoryBody',
  'reportHistoryTableWrap','reportNoMatches','reportVisibleCount','reportHistoryPageNote'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
elements.reportHistoryResults.hidden=true;
elements.reportHistoryTableWrap.hidden=true;
elements.reportNoMatches.hidden=true;
elements.reportView.textContent='Ver';
const document={
  getElementById:id=>elements[id]||null,
  createElement:tag=>new Element(tag)
};
const calls=[];
const fetch=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({
    total:1,limite:200,registros:[
      {id:'87',fecha:'2026-11-20',hora:'17:30',estado:'rechazado',total:91,articulos:1,pdf:1}
    ]
  })};
};
class AbortControllerMock{
  constructor(){this.signal={};this.aborted=false;}
  abort(){this.aborted=true;}
}
const script=fs.readFileSync(path.join(__dirname,'../public/reportes-historial-v1.js'),'utf8');
vm.runInNewContext(script,{document,fetch,AbortController:AbortControllerMock,URLSearchParams,Intl}, {filename:'reportes-historial-v1.js'});

(async()=>{
  const form=elements.reportHistoryFilter;
  assert.equal(elements.reportHistoryResults.hidden,true,'La tabla inicia oculta');
  assert.equal(elements.reportHistoryBody.children.length,0,'No se precargan registros');
  assert.equal(typeof form.handlers.submit,'function');
  await form.handlers.submit({preventDefault(){}});
  assert.equal(calls.length,0,'No debe consultar sin filtros');
  assert.match(elements.reportHistoryHint.textContent,/Elige una fecha/);
  elements.reportDateFilter.value='2026-11-20';
  elements.reportStatusFilter.value='rechazado';
  await form.handlers.submit({preventDefault(){}});
  assert.equal(calls.length,1,'Solo consulta cuando se presiona Ver');
  assert.match(calls[0].url,/fecha=2026-11-20/);
  assert.match(calls[0].url,/estado=rechazado/);
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(elements.reportHistoryResults.hidden,false);
  assert.equal(elements.reportHistoryTableWrap.hidden,false);
  assert.equal(elements.reportHistoryBody.children.length,1);
  const tr=elements.reportHistoryBody.children[0];
  assert.equal(tr.children[0].textContent,'#87');
  assert.equal(tr.children[2].children[0].textContent,'Rechazado');
  assert.match(tr.children[5].textContent,/91/);
  assert.equal(elements.reportVisibleCount.textContent,'1 pedido encontrado');
  elements.reportDateFilter.value='2026-11-19';
  form.handlers.change();
  assert.equal(elements.reportHistoryResults.hidden,true,'Al cambiar filtros se oculta el resultado anterior');
  assert.equal(elements.reportHistoryBody.children.length,0);
  assert.equal(elements.reportView.textContent,'Ver');
  assert.equal(calls.length,1,'Cambiar filtros no consulta automáticamente');
  elements.reportStatusFilter.value='';
  await form.handlers.submit({preventDefault(){}});
  assert.equal(calls.length,2,'Permite filtrar solo por fecha');
  assert(!calls[1].url.includes('estado='));
  assert(!script.includes('reportToday'));
  assert(!script.includes('reportClear'));

  // Regresión: la validación del servidor debe aceptar fechas ISO reales.
  const backend=fs.readFileSync(path.join(__dirname,'../servidor_web.js'),'utf8');
  const match=backend.match(/if\(!((?:\/\^[^\r\n]*\$\/))\.test\(fecha\)\)/);
  assert(match,'Existe el validador de fecha del historial en el servidor');
  const validDateRegex=vm.runInNewContext('('+match[1]+')');
  assert(validDateRegex.test('2026-11-23'),'Acepta fecha ISO YYYY-MM-DD');
  assert(!validDateRegex.test('23/11/2026'),'Rechaza formato dd/mm/aaaa');
  console.log('Historial: OK (oculto, Ver, fecha/estado, actualización y tabla segura).');
})().catch(e=>{console.error(e);process.exitCode=1;});
