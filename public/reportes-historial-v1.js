'use strict';

// Consulta de historial bajo demanda: evita mostrar todos los pedidos al abrir Reportes.
(() => {
  const byId=id=>document.getElementById(id);
  const form=byId('reportHistoryFilter');
  if(!form)return;
  const date=byId('reportDateFilter');
  const status=byId('reportStatusFilter');
  const button=byId('reportView');
  const hint=byId('reportHistoryHint');
  const results=byId('reportHistoryResults');
  const tbody=byId('reportHistoryBody');
  const table=byId('reportHistoryTableWrap');
  const empty=byId('reportNoMatches');
  const summary=byId('reportVisibleCount');
  const pageNote=byId('reportHistoryPageNote');
  const statusNames={
    pendiente:{label:'Por aceptar',css:'pending'},
    aceptado:{label:'Aceptado',css:'accepted'},
    entregado:{label:'Entregado',css:'delivered'},
    rechazado:{label:'Rechazado',css:'rejected'},
    cancelado:{label:'Cancelado',css:'cancelled'}
  };
  const currency=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
  let current=0;
  let controller=null;

  function resetResults(){
    current++;
    if(controller){controller.abort();controller=null;}
    results.hidden=true;
    table.hidden=true;
    empty.hidden=true;
    tbody.replaceChildren();
    summary.textContent='0 pedidos';
    pageNote.textContent='';
    button.disabled=false;
    button.textContent='Ver';
    hint.hidden=false;
    hint.textContent='Selecciona una fecha o un estado y presiona «Ver» para consultar los pedidos.';
  }
  form.addEventListener('change',resetResults);
  form.addEventListener('input',resetResults);

  const cell=(value,css='')=>{
    const td=document.createElement('td');
    td.textContent=String(value);
    if(css)td.className=css;
    return td;
  };
  function makeRow(p){
    const tr=document.createElement('tr');
    tr.append(
      cell('#'+String(p.id),'cell-id'),
      cell(String(p.fecha||'')+' · '+String(p.hora||'')),
    );
    const stateTd=document.createElement('td');
    const badge=document.createElement('span');
    const state=statusNames[p.estado]||{label:'Otro estado',css:'other'};
    badge.className='report-status-badge report-status-'+state.css;
    badge.textContent=state.label;
    stateTd.append(badge);
    tr.append(
      stateTd,
      cell(Number(p.articulos||0)),
      cell(Number(p.pdf||0)),
      cell(currency.format(Number(p.total||0)),'price-cell')
    );
    return tr;
  }

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const fecha=date.value.trim();
    const estado=status.value.trim();
    if(!fecha&&!estado){
      resetResults();
      hint.textContent='Elige una fecha, un estado o ambos para consultar los pedidos.';
      return;
    }
    if(controller)controller.abort();
    controller=new AbortController();
    const thisRequest=++current;
    results.hidden=true;
    hint.hidden=false;
    hint.textContent='Consultando pedidos...';
    button.disabled=true;
    button.textContent='Consultando...';
    const params=new URLSearchParams();
    if(fecha)params.set('fecha',fecha);
    if(estado)params.set('estado',estado);
    try{
      const response=await fetch('/reportes/historial?'+params.toString(),{
        method:'GET',
        credentials:'same-origin',
        headers:{Accept:'application/json'},
        cache:'no-store',
        signal:controller.signal
      });
      if(!response.ok)throw new Error('No se pudo consultar el historial.');
      const data=await response.json();
      if(thisRequest!==current)return;
      const records=Array.isArray(data.registros)?data.registros:[];
      tbody.replaceChildren();
      for(const p of records)tbody.append(makeRow(p));
      const total=Number(data.total||0);
      summary.textContent=total+' '+(total===1?'pedido encontrado':'pedidos encontrados');
      pageNote.textContent=total>records.length
        ?'Se muestran los '+records.length+' más recientes; ajusta los filtros para consultar otros.'
        :'';
      table.hidden=records.length===0;
      empty.hidden=records.length!==0;
      results.hidden=false;
      hint.hidden=true;
    }catch(e){
      if(thisRequest!==current||e.name==='AbortError')return;
      resetResults();
      hint.textContent='No fue posible consultar el historial. Comprueba tu conexión y vuelve a intentarlo.';
    }finally{
      if(thisRequest===current){
        controller=null;
        button.disabled=false;
        button.textContent='Ver';
      }
    }
  });
})();
