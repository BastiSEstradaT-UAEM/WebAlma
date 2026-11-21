-- WebAlma: completar el esquema YA EXISTENTE de diez tablas.
-- IDEMPOTENTE: no borra tablas ni modifica los 274 productos importados.
BEGIN;
ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS datos_de_prueba BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS existencia_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio_confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(100),
    ADD COLUMN IF NOT EXISTS estado_validacion VARCHAR(100);

ALTER TABLE public.movimientos_inventario
    ADD COLUMN IF NOT EXISTS registrado_por VARCHAR(80);

ALTER TABLE public.impresiones
    ADD COLUMN IF NOT EXISTS observacion VARCHAR(150);

CREATE TABLE IF NOT EXISTS public.configuracion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stock_minimo INTEGER NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0),
    precio_bn NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (precio_bn >= 0),
    precio_color NUMERIC(10,2) NOT NULL DEFAULT 5 CHECK (precio_color >= 0),
    horario VARCHAR(100) NOT NULL DEFAULT '07:00 a 19:00 (pendiente de validar)',
    aviso VARCHAR(350) NOT NULL DEFAULT '',
    precios_validados BOOLEAN NOT NULL DEFAULT FALSE,
    aviso_hasta TIMESTAMPTZ,
    horario_aviso_hasta TIMESTAMPTZ
);
ALTER TABLE public.configuracion
    ADD COLUMN IF NOT EXISTS aviso_hasta TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS horario_aviso_hasta TIMESTAMPTZ;
INSERT INTO public.configuracion(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.web_sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSONB NOT NULL,
    expire_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_expira ON public.web_sessions(expire_at);

CREATE TABLE IF NOT EXISTS public.telegram_sessions (
    clave VARCHAR(200) PRIMARY KEY,
    datos JSONB NOT NULL,
    actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_fecha ON public.pedidos(estado,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_impresiones_fecha ON public.impresiones(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON public.movimientos_inventario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_fecha ON public.lotes_inventario(producto_id,fecha_entrada,id);
COMMIT;
