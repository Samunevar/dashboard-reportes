# Lógica de negocio — Dashboard de Reportes Tienda Vitalia

Este documento resume TODAS las reglas de cálculo ya construidas y validadas en `index.html`.
**No se debe modificar ningún cálculo, fórmula, condición o pieza de lógica aquí descrita.**
Este archivo existe para que quien trabaje en el HTML/CSS (rediseño visual) entienda qué hace
cada parte del `<script>` y no la rompa sin querer al reestructurar el HTML.

---

## 1. Regla de oro

Todo lo que vive dentro de `<script>...</script>` es lógica de negocio ya validada con el
usuario a lo largo de muchas iteraciones. **Solo se pueden tocar colores hexadecimales
puramente decorativos** (ej. `#30D158` en los gráficos de torta). Todo lo demás —nombres de
función, condicionales, fórmulas, orden de cálculo— debe quedar intacto.

Los elementos HTML que el JS referencia por `id` (via `document.getElementById` / `$('...')`)
**no se pueden renombrar ni eliminar**. Se puede reestructurar el HTML alrededor libremente,
pero cada `id` que el JS busca debe seguir existiendo en algún punto del documento.

---

## 2. Fletes — cómo se cobran (función `fleteEfectivo(o)`)

A un pedido se le cobra **un solo flete**, nunca dos, sin importar si fue entregado, devuelto,
o sigue en movimiento:

- **ENTREGADO** → se cobra `PRECIO FLETE` completo.
- **DEVOLUCION** → si el Excel trae `COSTO DEVOLUCION FLETE > 0`, se usa ese valor real. Si no
  lo trae, se estima: `PRECIO FLETE − diferencia_promedio_de_esa_transportadora` (la diferencia
  promedio se calcula dinámicamente por reporte, a partir de los pedidos de esa misma
  transportadora que sí traen el dato). Para **Envía** específicamente, se suma **$2.000** de
  margen conservador extra a la diferencia estimada cuando falta el dato.
- **EN MOVIMIENTO** → la transportadora ya comprometió el flete al despachar, así que también
  se cobra (`o.flete`, tarifa normal), aunque el pedido no haya cerrado aún.
- **CANCELADO / RECHAZADO** → no se cobra flete.

**Fórmula de utilidad bruta (wallet real)**, tanto global como por producto:

```
utilBruta = ingresosEntregados − fletesEntregados − fletesDevueltos − fletesEnMovimiento − costoProveedorEntregados
```

---

## 3. Efectividad proyectada (función `calcEfectividad`)

- Rango del reporte ≤ 14 días → `EF = 80%` (conservador fijo).
- Rango > 14 días → `EF` = ratio real de pedidos **maduros** (fecha ≤ fecha_fin − 10 días) que
  llegaron a `ENTREGADO`, dividido entre esos mismos maduros que fueron `ENTREGADO + DEVOLUCION
  + EN_MOVIMIENTO`.
- Si hay menos de 10 pedidos despachados maduros → fallback al ratio general del período
  completo, o 80% si tampoco hay datos suficientes.

## 4. Proyección dependiente de la FECHA REAL de hoy (no la fecha del reporte)

Para cada pedido `EN MOVIMIENTO`, se calculan los días transcurridos entre su `FECHA` de
creación y **la fecha real del sistema (hoy)** — nunca la fecha "hasta" que el usuario eligió
para el reporte.

- Si han pasado **más de 15 días** desde la creación → se proyecta 100% como devolución (no se
  le aplica la efectividad `EF`, es devolución segura).
- Si son **15 días o menos** → se le aplica la proyección normal: `EF%` se proyecta como entrega,
  el resto como devolución.

Función: `diasDesdeHoyReal(fechaCreacion)`.

---

## 5. Sin movimiento — alerta +48h hábiles

- Calendario: excluye sábados, domingos y festivos colombianos (`diasHabiles`).
- Fecha de referencia (función `fechaRefSinMov`):
  1. Si el pedido tiene `FECHA DE SOLUCIÓN` (la novedad ya fue solucionada), **esa fecha manda
     siempre** — es la más confiable, no se compara con nada más.
  2. Si no hay solución pero sí `FECHA DE NOVEDAD`, se usa la más reciente entre
     `FECHA DE ÚLTIMO MOVIMIENTO` y `FECHA DE NOVEDAD` (la novedad también cuenta como un
     movimiento real del pedido, no solo lo que reporta la transportadora).
  3. Si no hay novedad, se usa `FECHA DE ÚLTIMO MOVIMIENTO` (o `FECHA` si esa viene vacía).
- Solo aplica a los estados de `EST_SIN_MOV_48` (excluye `NOVEDAD` y `RECLAME EN OFICINA`,
  que tienen su propio tratamiento).
- Alerta a partir de 2 días hábiles sin movimiento.

---

## 6. Control Diario — calendario especial (¡distinto al resto del dashboard!)

Función `diasHabilesControl`: **solo excluye domingos y festivos** — los sábados SÍ cuentan
como día hábil aquí, porque el equipo de logística sí trabaja los sábados. Este calendario
NO se usa en ningún otro cálculo del dashboard.

### 6.1 Novedades pendientes
Basado en `FECHA DE NOVEDAD`. 🟠 alerta naranja a partir de +1 día hábil sin resolver, 🔴 roja
a partir de +2 días, usando el calendario especial de arriba.

### 6.2 Efectividad de solución de novedades
- **Universo** = pedidos con campo `NOVEDAD` no vacío y `FECHA DE NOVEDAD` dentro del rango
  de fechas seleccionado en Control Diario.
- **Sin solucionar** = `FUE SOLUCIONADA LA NOVEDAD = NO`.
- **Solucionadas** = `FUE SOLUCIONADA LA NOVEDAD = SI`.
  - **Devolución directa** (dentro de las solucionadas) = aquellas cuyo campo `SOLUCIÓN`
    contiene el texto "DEVOLVER AL REMITENTE" o "Devolución total del despacho" — **estas NO
    cuentan como gestión real**, ya estaban perdidas de antemano.
  - **Evaluables** = solucionadas − devolución directa.
  - **% de efectividad de gestión** = `entregados (ESTATUS=ENTREGADO) / evaluables`.

### 6.3 Estado final de las guías con novedad
- **Guías despachadas** = pedidos entregados+devueltos+en movimiento (`EST_ENT`+`EST_DEV`+
  `EST_MOV`) cuya `FECHA` (creación) cae en el rango de Control Diario. Es el denominador del
  `% que entraron en novedad`.
- **Guías en novedad** = el mismo universo del bloque 6.2 (`NOVEDAD` no vacío, `FECHA DE
  NOVEDAD` en el rango) — los KPIs de este bloque son **solo sobre ese universo, no sobre el
  total general**.
- **Estado final** de cada guía en novedad (función `catNovedad`):
  1. Si el campo `SOLUCIÓN` ya es una devolución directa (mismo criterio del bloque 6.2:
     "DEVOLVER AL REMITENTE" / "Devolución total del despacho") → cuenta como **Devolución**,
     así el `ESTATUS` de Dropi todavía no se haya actualizado.
  2. Si no, y `ESTATUS = ENTREGADO` → **Entregado**.
  3. Si no, y `ESTATUS` es `DEVOLUCION`/`RECHAZADO` → **Devolución**.
  4. Cualquier otro caso (sigue en movimiento, novedad sin resolver, etc.) → **Tránsito**.

### 6.4 Devueltos de Coordinadora/Envía sin ninguna novedad (auditoría)
Guías cuya `TRANSPORTADORA` contiene el texto "COORDINADORA" o "ENVIA"/"ENVÍA" (cualquier
variante del nombre, comparación insensible a mayúsculas — cubre "COORDINADORA",
"COORDINADORA M", "ENVIA", etc.), con `ESTATUS = DEVOLUCION`, cuyo campo `NOVEDAD` **nunca
tuvo ningún dato**, y cuya `FECHA` cae en el rango de Control Diario. Solo aplica a estas dos
transportadoras porque Interrápisimo no reporta novedades en el archivo de Dropi — no se
audita ninguna otra transportadora con esta regla. Incluye botón para copiar las guías al
portapapeles (mismo patrón que "Sin movimiento").

---

## 7. Productos — ranking, score y fusión

`calcProductosFinanciero` agrupa las órdenes por nombre de producto (usando el nombre ya
**resuelto** por fusión si aplica, ver 7.2).

- **Deduplicación por pedido:** `dProd` trae una fila por producto dentro del pedido. Si el
  mismo pedido tiene el mismo producto repetido en más de una fila (línea duplicada), los
  valores del pedido (`ord.valor`, flete, costo proveedor — que son del pedido completo, no de
  la línea) se suman **solo la primera vez** que ese pedido aporta a ese producto, para no
  inflar `ingresosBrutos`/`fletesEnt`/`costoProvEnt`/`fletesDev`/`fletesMov`. El modal de
  detalle de producto (`abrirModal`) ya hacía esto correctamente al iterar por pedido en vez de
  por fila de `dProd`; el ranking no lo hacía y por eso podía mostrar una wallet bruta distinta
  (más alta) para el mismo producto que el modal.
- `utilBruta` = fórmula de la sección 2, aplicada por producto.
- `pauta` = `gastoPorNombreProducto(nombre)` → suma del gasto de todos los paquetes de
  campañas de Meta Ads asignados exactamente a ese nombre de producto.
- `utilNeta`:
  - Si `pauta > 0` → `utilNeta = utilBruta − pauta` (puede ser **negativa** si la pauta supera
    la utilidad bruta — se muestra en rojo, nunca se fuerza a 0).
  - Si no hay pauta asignada → `utilNeta = null` (null significa "sin dato", se muestra la
    bruta con un asterisco como referencia, nunca se confunde con "cero").

### 7.1 Filtros del ranking
`⭐ Mejor producto` (score = 50% utilidad neta por entrega, normalizada, + 50% efectividad sobre
despachados — **rentabilidad real por venta, no por volumen**: un producto con pocas ventas pero
muy rentable por entrega le gana a uno con muchas ventas pero poco rentable por entrega),
`🏆 Mayor utilidad neta`, `💰 Más wallet bruta`, `💸 Mejor CPA` (menor `cpaEntregado`),
`📊 Mejor entrega`, `📉 Menor devolución`, `📦 Más pedidos`.

**Regla del podio:** solo productos con **≥30 pedidos** pueden entrar al top 3. Del puesto 4
en adelante se listan TODOS los productos (incluidos los de menos de 30 pedidos), ordenados
de mayor a menor cantidad de pedidos.

**Exclusivo de `⭐ Mejor producto`:** los productos **sin pauta asignada** (`utilNeta === null`)
quedan **fuera de la competencia** de este criterio en particular — como no se puede calcular su
utilidad neta real, no se puede saber si de verdad son rentables, así que no compiten por el
podio ni entran en el ordenamiento por score. Se listan aparte, después de los que sí tienen
pauta, con una nota explicando por qué no entraron. (En los demás filtros —`🏆 Mayor utilidad
neta`, etc.— estos productos sí se incluyen usando la utilidad bruta como referencia con
asterisco, como antes.)

### 7.2 Fusión de productos
Se guarda en `localStorage` bajo la clave `vitalia_fusiones_v1`, como una lista de
`{id, nombre unificado, productos: [nombres originales]}`. La función
`resolverNombreProducto(nombreOriginal)` devuelve el nombre unificado si el producto está
fusionado, o el nombre original si no. Esto se aplica en todos los cálculos de productos,
ciudades y en el selector de paquetes de publicidad — un producto fusionado se comporta como
uno solo en todo el dashboard.

---

## 8. Simulador de ventas (dentro del modal de cada producto)

- La base de la simulación es la **proyección** del producto (entregados reales + proyección
  de los en movimiento con la EF madura de −10 días), **no** el porcentaje crudo actual del
  período (que puede estar sub-reportado si la operación aún no cerró).
- Se aplica una **penalización adicional de −2%** a la efectividad por saturación logística
  en volumen alto.
- El flete simulado de devolución se reparte según la distribución real del producto por
  transportadora, aplicando el ajuste de cada transportadora (misma lógica de la sección 2).
- Gráfico lineal de crecimiento: 9 puntos equidistantes (sin importar cuántos pedidos se
  simulen) mostrando utilidad bruta (verde) vs. gasto en pauta (azul punteado).

---

## 9. Publicidad (Meta Ads + TikTok Ads) — antes llamado "Pauta Meta"

- Se suben uno o más informes `.xlsx` de **Meta Ads** (parser `parsearInformeMeta`) y/o de
  **TikTok Ads** (parser `parsearInformeTiktok`), cada uno en su propia zona de carga y su
  propia card de "Campañas cargadas" (`dMetaFiles` / `dTiktokFiles`). Ambos parsers ignoran
  las filas de subtotal de cuenta; el de TikTok además prueba varias frases de encabezado
  posibles (español/inglés) porque el export de TikTok Ads Manager no usa el mismo texto que
  el de Meta, y reconoce su propia fila de gran total (`"Total: N resultados"` en la columna
  de cuenta con `"-"` en la de campaña — formato distinto al `All`/`Total` que usa Meta).
  Verificado contra un informe real de TikTok Ads Manager (KAIROS TECH GROUP): extrae
  correctamente las campañas con gasto > 0 y el total coincide exacto con el del archivo.
- **Paquetes**: el usuario selecciona campañas — de Meta, de TikTok, o de **ambas mezcladas**
  (`todasLasCampanas()` combina los dos pools) — y las asigna a UN producto (por su nombre ya
  resuelto/fusionado). El gasto total del paquete es la suma del gasto real de esas campañas,
  sin importar la plataforma de origen.
- `gastoPorNombreProducto(nombre)` = suma del gasto de todos los paquetes cuyo `prodId`
  coincide exactamente con ese nombre de producto (ya incluye Meta + TikTok si el paquete los
  mezcla).
- El gasto total de los informes de Meta sube automáticamente al campo "Gasto Meta" del resumen
  general (`gastoMetaArchivos`/`todasLasCampanasMeta`), y el de TikTok al campo "Gasto TikTok"
  (`todasLasCampanasTiktok`) — cada uno **reemplaza** su propio campo manual cuando hay archivos
  cargados de esa plataforma (el campo manual queda como fallback si no se sube ningún informe
  de esa plataforma en particular).
- Persistencia: `localStorage` bajo `vitalia_pauta_v1` (paquetes) — más exportar/importar como
  archivo `.json` para respaldo o mover entre dispositivos.

---

## 10. Trazabilidad Shopify ↔ Dropi

- Cruce por número de teléfono normalizado (`normTel`: quita `+57`, espacios y guiones).
- El CSV de Shopify solo pone el teléfono en la primera fila de cada pedido multi-producto —
  se aplica *forward fill* por número de orden para propagarlo a las filas siguientes.
- Cruce de producto por similitud de palabras clave entre el nombre en Shopify y en Dropi.
- **Pedidos adicionales (WhatsApp/carritos)**: pedidos de Dropi cuyo teléfono normalizado no
  aparece en ninguna orden de Shopify del período — se cuentan como canal adicional, y quedan
  incluidos en todos los KPIs generales del dashboard.

### 10.1 Fecha real del pedido (función `shopifyFechaPorTelefono`)

Un pedido siempre llega primero a Shopify y migra a Dropi después; a veces esa migración se
demora (bug, proceso manual) y el `FECHA` que trae Dropi termina siendo de días después. Sin
esto, un pedido real del 30 de un mes que migró a Dropi el 1 del mes siguiente se perdía del
cierre del mes correcto.

- Si se sube el CSV de Shopify, se construye un mapa **teléfono → fecha de creación en Shopify**
  (`Created at`), usando **todas** las órdenes de Shopify sin filtrar por rango. Si un mismo
  teléfono tiene varias órdenes, se toma la **más antigua**.
- Al procesar Dropi (`procesarDropi`), si el teléfono del pedido tiene fecha en ese mapa, **esa
  fecha reemplaza a `FECHA` de Dropi** para decidir si el pedido cae dentro del rango
  seleccionado, y pasa a ser la fecha (`_iso`/`o.fecha`) que usa el resto del dashboard
  (efectividad madura, proyección por días transcurridos, etc.) — o sea que corrige la fecha en
  **todos** los cálculos, no solo el filtro de entrada.
- Si no se sube Shopify, o el teléfono del pedido no tiene ninguna orden de Shopify, se usa
  `FECHA` de Dropi tal cual, como siempre.

---

## 11. Duplicados y clasificación de pedidos

- Un pedido se excluye de todos los cálculos si el campo `TAGS` contiene el texto
  "pedido duplicado" (`o.dup = true`).
- WhatsApp/orgánicos = pedidos donde `ID DE ORDEN DE TIENDA` está vacío en Dropi.
- Cancelaciones = métrica de marketing (se reportan aparte). Devoluciones = métrica logística
  (nunca se mezclan en el mismo porcentaje).

---

## 12. Grupos de estados (constantes globales)

Cada lista trae el nombre exacto ya validado **más variantes de redacción** que Dropi puede
traer según versión/configuración del export (pura tolerancia de texto — no cambia ninguna
regla de cálculo ni el comportamiento para los estados que ya se reconocían).

```js
EST_ENT = ['ENTREGADO','ENTREGADA','ENTREGADO PARCIAL']
EST_DEV = ['DEVOLUCION','RECHAZADO','DEVUELTO','DEVUELTA','DEVOLUCION EN PROCESO','RECHAZADA']
EST_CAN = ['CANCELADO','CANCELADA','ANULADA','ANULADO','GUIA ANULADA','ORDEN ANULADA']
EST_PEND = ['PENDIENTE CONFIRMACION','PENDIENTE DE CONFIRMACION','PENDIENTE POR CONFIRMACION']
EST_MOV = ['DESPACHADA','EN REPARTO','EN BODEGA DESTINO','EN BODEGA TRANSPORTADORA',
           'INTENTO DE ENTREGA','NOVEDAD SOLUCIONADA','GUIA_GENERADA','EN PROCESAMIENTO',
           'PREPARADO PARA TRANSPORTADORA','RECLAME EN OFICINA','NOVEDAD']
EST_SIN_MOV_48 = EST_MOV sin NOVEDAD y sin RECLAME EN OFICINA
```

---

## 13. Estructura de tabs (por posición física en el HTML, no por `id`)

**Importante:** la función `st(i)` activa pestañas por su **posición en el documento**
(`querySelectorAll('.tp')[i]`), no por el número en su `id`. Si al reestructurar el HTML se
reordenan los bloques `<div class="tp" id="tpX">`, el índice de cada tab en el array `.tabs`
debe seguir coincidiendo con la posición física real de su panel correspondiente, o los tabs
mostrarán el contenido equivocado (bug ya ocurrido una vez en este proyecto).

Orden actual: 0-Resumen, 1-Logística, 2-Proyección, 3-Sin movimiento, 4-Productos,
5-Transportadoras, 6-Trazabilidad, 7-Control Diario, 8-Publicidad, 9-Por día.

---

## 14. Archivos que se suben

1. **Dropi — Órdenes** (una fila por pedido): `ordenes_xxx.xlsx`
2. **Dropi — Órdenes con productos** (una fila por producto dentro del pedido):
   `ordenes_productos_xxx.xlsx`
3. **Shopify — Pedidos exportados**: CSV
4. **Meta Ads — Informes de campañas**: uno o varios `.xlsx` (formato "Tabla de datos sin
   procesar")

---

## 15. Mejoras traídas de "Level Up Analytics" (2026-07-11)

El usuario compartió la documentación de otro sistema de logística/P&L y pidió traer lo que
aplicara a Vitalia sin tocar lo que ya funciona bien. Quedó explícitamente **fuera de alcance**
la detección de "producto propio" (costo ficticio ≤ 2 en Dropi) porque no aplica a este negocio.

### 15.1 Fix: `gW` (pedidos WA/orgánicos) nunca llegaba al Resumen
`calcPedidosAdicionales` ya calculaba todo correctamente pero nunca lo guardaba en ningún lado
que `renderRes` pudiera leer — el KPI "Pedidos WhatsApp/Orgánicos" del Resumen mostraba **0**
siempre. Ahora `calcPedidosAdicionales` guarda el resultado en el global `gW` (`totWP`, `entWP`,
`devWP`, `movWP`, `canWP`, `despWP`, `efDespWP`, `pWP`, `valorWP` —solo entregados—, `valorGenWP`
—todos, sin importar estatus, usado para ROAS—, `utilBrutaWP`), y `fetchAll` llama
`calcPedidosAdicionales` **antes** de `renderRes` (antes iba después y con un `wpData` local que
quedaba siempre en `null`).

### 15.2 ROAS con semáforos (Resumen → Resultados financieros)
```
ticketProm  = totalOrdenEnt / entregados
valorVenta  = ingresos Shopify + valorGenWP (WA/orgánico, todos los estatus)

ROAS venta    = valorVenta / gastoTotalPauta
ROAS despacho = (despachados × ticketProm) / gastoTotalPauta
ROAS entrega  = totalOrdenEnt / gastoTotalPauta
```
Semáforos (`colorROAS(valor, límiteRojo, límiteVerde)`): rojo si < límiteRojo, ámbar si <
límiteVerde, verde si ≥ límiteVerde.
- Venta: rojo <5, ámbar 5–6.9, verde ≥7.
- Despacho: rojo <4, ámbar 4–5.4, verde ≥5.5.
- Entrega: rojo <3.3, ámbar 3.3–3.9, verde ≥4.

### 15.3 Alertas automáticas (Resumen, arriba de todo — `#alertas-resumen`)
Se recalculan en cada `renderRes`. % guía generada y % oficina son **sobre despachados**
(`d.ec['GUIA_GENERADA']`/`d.ec['RECLAME EN OFICINA']` ÷ `d.desp`).

| Condición | Severidad |
|---|---|
| % guía generada > 5% | ⚠️ warning |
| % oficina > 5% | ⚠️ warning |
| % devolución ≥ 30% | 🔴 danger |
| % devolución ≥ 20% (y <30%) | ⚠️ warning |
| Margen neto real < 0% | 🔴 danger |
| Margen neto real < 10% (y ≥0%) | ⚠️ warning |
| Pauta / utilidad bruta > 40% | ⚠️ warning |

**Ojo:** el margen usado para la alerta es `(utilBruta − pauta) / utilBruta`, **sin el piso en
0** que sí tiene el KPI "Utilidad neta" mostrado en pantalla (ese piso es una regla ya validada
y no se tocó) — si no fuera así la alerta de margen negativo nunca podría dispararse.

### 15.4 Estado de cuenta — utilidad neta real (Resumen, card nueva al final)
Nuevos campos manuales en Credenciales, persistidos en localStorage junto con Meta/TikTok
(`saveKeys`/`loadKeys`): **Nómina del período**, **Gastos extras del período**, **% Impuestos
sobre ingresos**, **Anticipos adicionales recibidos**. Aplican al rango del reporte actual
(igual que Gasto Meta/TikTok, no hay un sistema de períodos YYYY-MM separado).

```
ingresosTotalesReales = totalOrdenEnt + anticipos
impuestos             = ingresosTotalesReales × (%impuestos / 100)
gastosAdicionales     = nómina + gastosExtras + impuestos
utilBrutaReal         = utilBruta + anticipos − gastoTotalPauta   (sin piso en 0)
utilidadNetaReal      = utilBrutaReal − gastosAdicionales
margenNetoReal        = utilidadNetaReal / ingresosTotalesReales × 100
```
Esta es **adicional** a la "Utilidad neta" existente (que solo resta pauta) — no la reemplaza.

### 15.5 Tab "Por día" (nueva, índice 9 — ver sección 13)
Agrupa `allOrds` por `fecha` y calcula, por cada día: entregados, despachados, ventas, costo
producto, costo flete (con `fleteEfectivo`, igual que el resto del dashboard), utilidad bruta.
Como Vitalia no tiene pauta ni gastos fijos cargados día por día (solo el monto total del
período), la pauta total y los gastos fijos (nómina+gastos extras) se **reparten
proporcionalmente** según qué % de las ventas totales del período generó cada día — un día sin
ventas no recibe nada de ese reparto:
```
share(día)        = ventas_día / ventas_totales_período
pauta_día         = gastoTotalPauta × share(día)
gastosFijos_día   = (nómina + gastosExtras) × share(día)
utilidadNeta_día  = utilidadBruta_día − pauta_día − gastosFijos_día
```
