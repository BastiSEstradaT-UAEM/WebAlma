'use strict';
const assert=require('node:assert/strict');
const {buildReportActivity}=require('../reportes_actividad');
const bounds={start:'2026-11-16',end:'2026-11-22'};
const data=buildReportActivity(
  [{estado:'entregado',cantidad:7,cotizado:'937.00'},{estado:'rechazado',cantidad:3,cotizado:'494.00'}],
  [{dia:'2026-11-20',estado:'entregado',cantidad:2,cotizado:'135.00'},
    {dia:'2026-11-20',estado:'rechazado',cantidad:3,cotizado:'494.00'}],
  [{id:10,dia:'2026-11-20',hora:'17:45',estado:'rechazado',total:'94.00',articulos:2,pdf:1}],
  {total_pdf:1,pedidos_pdf:1},bounds,'2026-11-20'
);
assert.equal(data.allCount,10);
assert.equal(data.allCotizado,1431);
assert.equal(data.weeklyCount,5);
assert.equal(data.weeklyQuoted,629);
assert.equal(data.totalPdf,1);
assert.equal(data.ordersWithPdf,1);
assert.equal(data.days.length,7);
assert.deepEqual(data.days.map(d=>d.total),[0,0,0,0,5,0,0]);
assert.equal(data.days[4].label,'Vie');
assert.equal(data.days[4].height,100);
assert.equal(data.states.find(s=>s.key==='entregado').percent,70);
assert.equal(data.states.find(s=>s.key==='rechazado').percent,30);
assert.equal(data.recent[0].id,'10');
assert.equal(data.recent[0].pdf,1);
assert.equal(data.recent[0].statusLabel,'Rechazados');
assert(!JSON.stringify(data).includes('telegram_usuario_id'));
const empty=buildReportActivity([],[],[],{total_pdf:0,pedidos_pdf:0},bounds,'2026-11-20');
assert.equal(empty.allCount,0);
assert.equal(empty.weeklyQuoted,0);
assert.equal(empty.days.every(d=>d.height===0),true);
assert.equal(empty.recent.length,0);
console.log('Reportes: OK (histórico, estados, cotizaciones, PDF, días, privacidad, cero registros).');
