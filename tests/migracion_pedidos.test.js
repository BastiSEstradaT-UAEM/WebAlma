'use strict';
const assert=require('node:assert/strict');
const {asegurarEstadosPedido}=require('../migracion_estados');
const estados="CHECK (estado IN ('pendiente','aceptado','rechazado','entregado','cancelado'))";
async function ejecutar(definition,fallar=false){
  const sql=[];let liberado=false;
  const pool={connect:async()=>({query:async q=>{
    sql.push(q);
    if(fallar&&q.includes('ADD CONSTRAINT'))throw new Error('Simulación error SQL');
    if(q.includes('SELECT pg_get_constraintdef'))return {rows:[{definition}]};
    return {rows:[]};
  },release:()=>{liberado=true;}})};
  let resultado,error;
  try{resultado=await asegurarEstadosPedido(pool);}catch(e){error=e;}
  return {sql,liberado,resultado,error};
}
(async()=>{
  const vigente=await ejecutar(estados);
  assert.equal(vigente.resultado.actualizada,false);
  assert.equal(vigente.sql.some(q=>q.includes('ALTER TABLE')),false);
  const antigua=await ejecutar("CHECK (estado IN ('pendiente','entregado','cancelado'))");
  assert.equal(antigua.resultado.actualizada,true);
  assert.equal(antigua.sql.filter(q=>q.includes('ALTER TABLE')).length,2);
  assert.equal(antigua.sql.at(-1),'COMMIT');
  const falla=await ejecutar("CHECK (estado IN ('pendiente'))",true);
  assert.match(falla.error.message,/Simulación/);
  assert.equal(falla.sql.at(-1),'ROLLBACK');
  assert.equal(falla.liberado,true);
  console.log('Migración de estados: idempotencia, actualización y reversión OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
