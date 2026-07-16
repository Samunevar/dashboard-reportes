-- ============================================================================
-- Esquema de Supabase para el historial acumulado de pedidos del dashboard
-- ----------------------------------------------------------------------------
-- Cómo usarlo: crea un proyecto gratuito en https://supabase.com, entra a
-- "SQL Editor" y pega TODO este archivo, luego dale "Run". Después ve a
-- Project Settings → API y copia la "Project URL" y la "anon public key" —
-- esas dos las necesita el dashboard (se pegan en index.html).
--
-- Diseño: una fila POR PEDIDO real de Dropi (no por archivo subido), usando
-- el campo 'ID' de Dropi como llave. Cuando se sube un reporte nuevo, cada
-- pedido se UPSERTEA: si su ID ya existía, se actualiza en su lugar (nunca
-- se duplica); si es nuevo, se agrega. Así, subir el rango 10-30 después de
-- haber subido el 1-15 deja el 10-15 actualizado y el 1-9 intacto, sin que
-- se dupliquen ni se pierdan pedidos — el negocio va acumulando su historial
-- completo con cada subida.
-- ============================================================================

create table if not exists pedidos_dropi (
  user_id        uuid not null references auth.users(id) on delete cascade,
  pedido_id      text not null,               -- el campo 'ID' de Dropi, tal cual
  orden          jsonb not null,               -- la fila cruda de dOrd para ese pedido
  productos      jsonb not null default '[]',  -- las filas crudas de dProd de ese pedido
  actualizado_en timestamptz not null default now(),
  primary key (user_id, pedido_id)
);

-- Row Level Security: cada usuario solo puede ver/crear/editar/borrar SUS
-- PROPIOS pedidos. Esto es lo que hace seguro exponer la "anon key" en el
-- cliente — sin esta policy, cualquiera podría leer los datos de otro.
alter table pedidos_dropi enable row level security;

create policy "pedidos_dropi_propios" on pedidos_dropi
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
