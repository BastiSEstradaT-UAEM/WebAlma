'use strict';
// Migración automática, idempotente y transaccional del flujo de pedidos.
// Se ejecuta antes de abrir el servidor HTTP; no toca productos ni pedidos.
async function asegurarEstadosPedido(pool){
  const client=await pool.connect();
  let enTransaccion=false;
  try {
    await client.query('BEGIN');enTransaccion=true;
    // Protege frente a inicios simultáneos de más de una instancia.
    await client.query('SELECT pg_advisory_xact_lock(96332211)');
    const {rows}=await client.query(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid='public.pedidos'::regclass AND conname='pedidos_estado_check'`);
    const definition=String(rows[0]?.definition||'');
    const completo=["'pendiente'","'aceptado'","'rechazado'","'entregado'","'cancelado'"]
      .every(estado=>definition.includes(estado));
    if(!completo){
      await client.query('ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check');
      await client.query(`ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check
        CHECK (estado IN ('pendiente','aceptado','rechazado','entregado','cancelado'))`);
    }
    await client.query('COMMIT');enTransaccion=false;
    if(!completo)console.log('WebAlma: estados de pedidos actualizados (sin eliminar registros).');
    return {actualizada:!completo};
  }catch(error){
    if(enTransaccion)await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{client.release();}
}
module.exports={asegurarEstadosPedido};
