-- WebAlma: ampliar estados de pedidos sin eliminar registros existentes.
-- Ejecutar una sola vez en DBeaver antes de publicar el backend actualizado.
-- Mantiene el estado 'cancelado' para compatibilidad con versiones anteriores.
BEGIN;
ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'entregado', 'cancelado'));
COMMIT;
