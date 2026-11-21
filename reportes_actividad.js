'use strict';

/**
 * Modelo de lectura para el reporte administrativo.
 * Nunca interpreta una cotización como ingreso cobrado.
 * No incluye nombres, usuarios de Telegram ni identificadores de archivos.
 */
const STATES=[
  {key:'pendiente',label:'Por aceptar',className:'pending'},
  {key:'aceptado',label:'Aceptados',className:'accepted'},
  {key:'entregado',label:'Entregados',className:'delivered'},
  {key:'rechazado',label:'Rechazados',className:'rejected'},
  {key:'cancelado',label:'Cancelados',className:'cancelled'}
];
const num=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?n:0;};
const count=v=>Math.floor(num(v));
function buildReportActivity(summaryRows,dayRows,recentRows,pdfRow,bounds,today){
  const states=STATES.map(s=>({...s,count:0,cotizado:0,percent:0}));
  const lookup=Object.fromEntries(states.map(s=>[s.key,s]));
  let allCount=0,allCotizado=0;
  for(const row of summaryRows){
    const quantity=count(row.cantidad);
    const quoted=num(row.cotizado);
    allCount+=quantity;allCotizado+=quoted;
    if(lookup[row.estado]){
      lookup[row.estado].count+=quantity;
      lookup[row.estado].cotizado+=quoted;
    }
  }
  const extraCount=allCount-states.reduce((sum,s)=>sum+s.count,0);
  if(extraCount>0)states.push({key:'otros',label:'Otros',className:'other',count:extraCount,cotizado:0,percent:0});
  for(const s of states)s.percent=allCount?Math.min(100,Math.round(s.count/allCount*1000)/10):0;

  const byDay=new Map();
  const cursor=new Date(bounds.start+'T12:00:00Z');
  const end=new Date(bounds.end+'T12:00:00Z');
  for(let i=0;i<7&&cursor<=end;i++){
    const day=cursor.toISOString().slice(0,10);
    const weekday=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][cursor.getUTCDay()];
    byDay.set(day,{date:day,label:weekday,day:cursor.getUTCDate(),total:0,cotizado:0});
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  // dayRows puede contener fecha sin información de dinero, no se inventan importes por día.
  for(const row of dayRows){
    const d=byDay.get(String(row.dia).slice(0,10));
    if(d){d.total+=count(row.cantidad);d.cotizado+=num(row.cotizado);}
  }
  const days=[...byDay.values()];
  const weeklyCount=days.reduce((sum,d)=>sum+d.total,0);
  const weeklyQuoted=days.reduce((sum,d)=>sum+d.cotizado,0);
  const maxPerDay=Math.max(1,...days.map(d=>d.total));
  days.forEach(d=>{d.height=d.total===0?0:Math.round(d.total/maxPerDay*100);});
  const recent=recentRows.map(r=>({
    id:String(r.id),date:String(r.dia).slice(0,10),time:String(r.hora),
    estado:String(r.estado),statusLabel:lookup[r.estado]?.label||'Otro estado',
    statusClass:lookup[r.estado]?.className||'other',
    items:count(r.articulos),pdf:count(r.pdf),total:num(r.total)
  }));
  return {
    allCount,allCotizado,states,days,weeklyCount,weeklyQuoted,
    totalPdf:count(pdfRow?.total_pdf),ordersWithPdf:count(pdfRow?.pedidos_pdf),
    recent,today:String(today||''),start:bounds.start,end:bounds.end
  };
}
module.exports={buildReportActivity};
