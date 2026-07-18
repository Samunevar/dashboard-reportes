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

-- ============================================================================
-- informes_dropi — reemplaza a pedidos_dropi como fuente de verdad (2026-07-16)
-- ----------------------------------------------------------------------------
-- pedidos_dropi (arriba) guarda un estado YA FUSIONADO por pedido — una vez que un
-- pedido se sobrescribe, no queda ningún rastro de qué informe lo trajo ni de cuál
-- era su valor antes. Eso hace imposible "borrar solo el informe del día 2" sin tocar
-- los demás. informes_dropi guarda cada SUBIDA completa tal cual llegó (sus filas
-- crudas), y el estado acumulado que ve el dashboard se recalcula reproduciendo todos
-- los informes en orden cronológico cada vez que hace falta — el pedido que aparece en
-- varios informes toma el valor del informe MÁS RECIENTE que lo mencione. Si se borra
-- un informe, sus pedidos simplemente dejan de estar en esa reproducción: vuelven al
-- valor de un informe anterior si alguno lo mencionaba, o desaparecen si no.
--
-- pedidos_dropi NO se borra (por si acaso), pero deja de recibir escrituras nuevas —
-- el dashboard la usa una sola vez, automáticamente, para migrar cualquier dato que ya
-- se haya guardado con el sistema anterior a un único informe "Historial previo".
-- ============================================================================

create table if not exists informes_dropi (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  fecha_desde date,
  fecha_hasta date,
  num_pedidos int not null default 0,
  ord         jsonb not null default '[]',  -- filas crudas de dOrd de ESTA subida, tal cual
  productos   jsonb not null default '[]'   -- filas crudas de dProd de ESTA subida, tal cual
);

alter table informes_dropi enable row level security;

create policy "informes_dropi_propios" on informes_dropi
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
