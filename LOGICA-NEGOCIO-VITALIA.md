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

Orden actual (desde el rediseño 2026-07-12, **9 tabs**): 0-Resumen, 1-Logística,
2-Proyección, 3-Sin movimiento, 4-Productos, 5-Trazabilidad, 6-Control diario,
7-Publicidad, 8-Por día.

**El tab "Transportadoras" ya no existe como pestaña propia:** su contenido (mapa de
Colombia, semáforos por ciudad/departamento/transportadora y lista de ciudades) se
movió **dentro del tab Logística** (panel `tp1`). Los `id` de los paneles conservan su
numeración vieja con un hueco (`tp0,tp1,tp2,tp3,tp4,tp6,tp7,tp8,tp9` — no hay `tp5`),
pero eso **no importa** porque `st()` va por posición física. Al mover el bloque se
respetaron todos los `id` internos (`mapa-dept-svg-wrap`, `transp-list`,
`ciudades-list`, etc.), por lo que las funciones de render siguen apuntando a ellos.

Llamada directa corregida: el botón "Revisar en Trazabilidad →" del Control diario
ahora llama `st(5)` (antes `st(7)`, que con el nuevo orden habría abierto Publicidad).

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

---

## 16. Rediseño visual y de experiencia (2026-07-12)

Rediseño completo de la **capa visual** del dashboard. **No se tocó ninguna fórmula ni
función de cálculo** — solo CSS, estructura HTML de presentación, textos de títulos y la
forma en que se dibujan (no lo que dibujan) los gráficos. Puntos clave:

- **Homepage / landing (`#landing`)**: pantalla de entrada a pantalla completa con un
  botón "Iniciar control logístico" que llama `entrarApp()` (añade `body.app-ready`, oculta
  el landing con transición y quita `landing-lock`). `volverInicio()` hace lo inverso y está
  colgado del logo del header. El landing es un overlay `position:fixed`; el área de trabajo
  (`.shell`) siempre existe debajo, así que no se ocultó ningún contenido ni lógica.
- **Sistema de diseño**: se añadió la tipografía **Sora** para títulos (Inter para UI,
  JetBrains Mono para cifras), tokens nuevos (`--font-*`, `--shadow-card`, `--ease`,
  `--rxl`), aurora de fondo animada (`auroraDrift`), tarjetas con más aire y hover, KPIs
  (`.mc`) rediseñados, y la barra de tabs ahora es **sticky** con iconos por pestaña.
  Se respetaron TODOS los nombres de clase que la JS togglea (`.tab`, `.tp`, `.active`,
  `.visible`, `.scroll-reveal`, `.drag`, `.mc`, `.al/.aw/.ai/.ao/.ar`, etc.).
- **Animación "radar" de las tortas**: nuevo helper `_radarPie(canvasId, datos, opt)` que
  pinta el mismo gráfico revelándolo con un barrido tipo radar (línea de escaneo que gira +
  estela). `dibujarTorta`, `dibujarTortaFin` y `dibujarTortaModalFin` ahora arman sus datos
  igual que antes (mismos valores, mismos colores, misma leyenda) y delegan el dibujo a
  `_radarPie`. Un token por canvas (`canvas._radarTok`) cancela animaciones anteriores.
- **Explicadores por apartado**: cada uno de los 9 tabs tiene un `<details class="how">`
  plegable ("¿Cómo funciona este apartado?") con una descripción **en lenguaje sencillo y
  sin fórmulas**, pensada para cualquier persona. No sustituye a los banners `.al ai` que ya
  explicaban criterios puntuales.
- **Títulos menos repetitivos**: p.ej. la tarjeta interna del tab Logística pasó de
  "Logística" a "Salud de la operación"; "KPIs principales" → "Vista rápida del período".
  Son solo textos de presentación.

Regla que se mantiene: si en el futuro se reordenan o agregan tabs, hay que volver a alinear
los índices `st(i)` con la posición física de los paneles (ver sección 13).

---

## 17. Simulador escalonado — utilidad según la efectividad final de la operación (2026-07-13, corregido 2026-07-13)

Nueva tarjeta en el tab **Proyección** (`renderEscalonado()`, `calcEscalonado(scope)`).
**No es una proyección adicional ni cambia la proyección existente (85%)** — es un simulador
aparte que responde: *"si apagara las campañas y solo esperara el resultado de lo que ya está
despachado, ¿cuánta utilidad me deja según la efectividad final que termine teniendo la
operación?"*.

**Importante — el % de cada escalón es la EFECTIVIDAD TOTAL sobre lo despachado**
(entregados + devueltos + en movimiento), **no** un porcentaje del pool en movimiento. La
primera versión de este simulador cometía ese error (aplicaba el % como fracción incremental
de `numMov`, lo que producía incrementos ridículamente pequeños e ignoraba la efectividad real
ya alcanzada). Corrección:

```
desp = entregados + devueltos + enMovimiento   (mismo "despachado" que el resto del dashboard)
pEactual = entregados / desp × 100             (efectividad real de HOY — se muestra explícita)
techo    = (entregados + numMov) / desp × 100  (máximo posible si TODO lo en movimiento entrega bien)
```

**Por cada paso de % objetivo (25, 35, 45, 55, 65, 75, 85, 95 — efectividad FINAL deseada):**
```
targetEntregados = round(desp × pctStep / 100)
entregasExtra     = targetEntregados − entregados
```
- Si `entregasExtra ≤ 0` → ese escalón **ya está superado** por la efectividad actual; se
  muestra con la nota "ya superado hoy" y usa 0 entregas extra (el bloque queda igual que
  "Hoy").
- Si `entregasExtra > numMov` → el escalón **no es alcanzable** ni entregando el 100% de lo
  que queda en movimiento; se muestra con la nota "techo real: X%" y se usa como tope
  `numMov` completo (no se puede fabricar entregas que no existen).
- En cualquier otro caso, `entregasExtra` es exactamente cuántos de los pedidos en movimiento
  tendrían que resolverse bien para llegar a ese % final.

```
utilBruta(step) = utilBrutaHoy + entregasExtraClamped × utilPorEntrega
utilNeta(step)  = utilBruta(step) − pauta        (solo si hay pauta asignada; si no, null)
```

**Promedio real por entrega** (sin cambios respecto a la versión anterior):
```
utilPorEntrega (global) = max((totalOrdenEnt − fleteEnt − costoProvEnt) / entregados, 0)
utilPorEntrega (producto) = p.utilPorEntrega  (ya existía en calcProductosFinanciero)
```
No se resta de nuevo el flete/costoProv de los pedidos en movimiento o devueltos — esos ya
están descontados una sola vez en la utilidad bruta base (`fin.utilBruta` / `p.utilBruta`),
que es el punto de partida ("Hoy real", que ahora también muestra `pEactual` explícito).

**La pauta es constante en todos los pasos** — ya se gastó, no depende de cuánto termines
entregando, por eso no se recalcula ni se prorratea entre escalones.

**Alcance (`scope`) seleccionable:**
- `__global__` = todo el negocio, usa `gPautaTotal` y los agregados de `gDropiData`
  (`desp`, `ent`, `numMov`).
- Por producto = usa `gProdsFin` (resultado de `calcProductosFinanciero`, solo disponible si
  se subió el archivo de "Órdenes con productos"). `numMov` del producto se deriva como
  `desp − ent − dev`. Si el producto no tiene pauta asignada (`gastoPorNombreProducto`), la
  fila de "Utilidad neta" muestra "Sin pauta asignada" en vez de un número.

Variables globales nuevas para sostener este cálculo fuera de `fetchAll()`:
`gDropiData` (resultado de `procesarDropi`), `gPautaTotal` (pauta total del período, mismo
valor que `metaData.tot`), `gProdsFin` (array de `calcProductosFinanciero`, vacío si no hay
`dProd`). Se guardan al final de `fetchAll()`, después de `renderRes`.

**Aclaración de UX (2026-07-20):** cuando el "techo alcanzable" del negocio/producto (ver
fórmula de `techo` arriba) queda por debajo de varios escalones seguidos (ej. techo=74.4% y
escalones 75/85/95%), esos escalones muestran **exactamente el mismo valor** — es el
comportamiento correcto (todos topan en el máximo posible con los pedidos que quedan en
movimiento), no un bug, pero visualmente podía confundirse con uno. Se hizo más visible: la
nota de esos escalones ahora es `⚠ techo real X%` en color ámbar y negrita (antes era texto
plano del mismo color que "ya superado hoy"/"+N entregas"), y el párrafo explicativo de la
tarjeta menciona explícitamente por qué pasa esto.

**Orden en el tab Proyección (2026-07-20):** esta tarjeta (el simulador) ahora aparece
**primero**, antes de la tarjeta "Proyección de ingresos" (la tabla de pedidos en movimiento
con su ingreso neto estimado) — a petición del usuario, para ver primero el simulador de
utilidad y después el detalle pedido por pedido.

---

## 18. Pauta diaria REAL (extracción automática desde el informe de Meta/TikTok) (2026-07-13)

Algunos exports de Meta Ads incluyen una **segunda hoja oculta** en el mismo `.xlsx` (junto a
la hoja visible con los totales por campaña) con una fila **por campaña Y por día**: columnas
`Nombre de la cuenta`, `Nombre de la campaña`, `Día`, `Importe gastado (COP)`, etc. El nombre
de esa hoja puede variar, así que `extraerGastoDiarioWB(wb)` **escanea TODAS las hojas** del
workbook buscando una fila de encabezados que tenga a la vez "Nombre de la campa", "Día" e
"Importe gastado" (mismo criterio de detección tolerante que ya usaba `parsearInformeMeta`).

**Filas que se descartan** (son subtotales, no gasto diario real):
- Campaña vacía (fila de total global del reporte).
- Campaña = `"All"` (subtotal de cuenta para todo el período).
- Día que no matchee `/^\d{4}-\d{2}-\d{2}$/` — esto excluye tanto el subtotal de cuenta
  (Día="All") como el de campaña-período-completo (Día="All" con campaña real). Solo se toman
  las filas donde "Día" es una fecha real específica.

Resultado: `porDia = {'2026-06-01': 800000, '2026-06-02': 750000, ...}` — gasto sumado de
TODAS las campañas de ese día. Se guarda en cada entrada de `dMetaFiles`/`dTiktokFiles` como
`.porDia`, y `gastoDiarioReal()` los junta todos en un solo objeto.

**Uso en "Análisis por día" (`renderAnalisisPorDia`):** para cada día del rango, si existe
`gastoDiarioReal()[fecha]`, se usa ESE valor exacto como pauta del día (marcado visualmente
con `● real`). Para los días que NO tienen ese dato, se reparte proporcionalmente — pero
**solo el remanente** (`totPauta − Σ pauta real de los días con dato`), distribuido según el
% de ventas que esos días-sin-dato representan ENTRE ELLOS (no sobre el período completo), así
la suma final de todos los días siempre cuadra exactamente con el gasto total oficial que
muestra el resto del dashboard (Resumen, ROAS, etc.) — nunca se cuenta pauta de más ni de
menos. Si ningún archivo trae desglose diario, el comportamiento es idéntico al anterior
(100% proporcional).

---

## 19. Detalle por ciudad (clic en una ciudad, tab Logística) — cancelados visibles (2026-07-13)

Al hacer clic en una ciudad (`renderCiudadesFiltradas` → panel `#ciudad-det-i`), el desglose
"Por producto" y "Por transportadora" mostraba `entregados · devueltos · en movimiento · total`,
pero esos tres primeros números casi nunca suman el `total` — la diferencia son **cancelados**
(y en teoría pendientes, aunque en la práctica casi no aparecen a nivel de ciudad), que
correctamente **no cuentan** en la base de la barra de efectividad (`desp = ent+dev+mov`, sin
cancelados) ni en el % mostrado. Antes ese número no se explicaba en ningún lado, lo que parecía
un error de suma.

Ahora, si `d.can>0`, se muestra una línea aparte **arriba** del detalle: `N cancelados (no
entran en el cálculo)`, tanto para "Por producto" como para "Por transportadora"
(`transpPorCiudad` ahora también cuenta `can`, igual que `prodPorCiudad` ya lo hacía). El resto
del panel se rediseñó con clases dedicadas (`.cd-panel`, `.cd-row`, `.cd-bar`, etc.) en vez de
estilos en línea sueltos, para que coincida visualmente con el resto del dashboard ya
rediseñado — no cambia ningún número, solo la presentación y la aclaración de cancelados.

---

## 20. Netlify retirado del proyecto (2026-07-14)

Se eliminaron `netlify.toml` y `netlify/functions/*.js` (proxies viejos a las APIs de Meta y
Shopify de una versión anterior del proyecto, antes de que pasara a ser 100% client-side con
archivos subidos). No estaban referenciados por `index.html` ni por el despliegue real (que
siempre ha sido GitHub Pages) — el usuario confirmó que no se usan y no quiere pagar por ese
servicio.

---

## 21. Pauta Meta/TikTok — doble conteo corregido y ahora respeta el rango de fechas (2026-07-14)

**Bug real, confirmado analizando un export real de Meta Ads:** algunos informes de Meta traen,
dentro de la MISMA hoja que ya se lee (`parsearInformeMeta`), una fila de **total del período**
por campaña (columna "Día" = `"All"`) Y ADEMÁS una fila **por cada día** con el gasto real de
esa fecha. El código anterior no distinguía esto — empujaba CADA fila (la de total y cada una
de las diarias) como una entrada separada de `campanas[]` con el mismo nombre, así que al sumar
`todasLasCampanasMeta().reduce((s,c)=>s+c.gasto,0)` se contaba el total del período **dos
veces** (una como fila-total, otra como la suma de las diarias que ya sumaban ese mismo total).

**Fix en `parsearInformeMeta`/`parsearInformeTiktok`:** ahora se detecta la columna "Día" (si
existe) y se agrupa por campaña. Si una campaña tiene filas con fecha real
(`/^\d{4}-\d{2}-\d{2}$/`), su `gasto` final es la SUMA de solo esas filas (ignorando la fila de
total-de-período, que ya no hace falta); si no tiene columna "Día", el comportamiento es
idéntico al de siempre (una fila = un total). Cada entrada de `campanas[]` ahora también trae
`porDia: {fecha: gasto}` (o `null` si el archivo no tenía ese desglose).

**Bug #2 — la pauta no se recortaba al rango de fechas elegido:** el total de pauta usado en
Resumen/ROAS/Estado de Cuenta (`gastoMetaFinal`/`gastoTiktokFinal`) sumaba el gasto COMPLETO de
todos los archivos subidos, sin importar el rango "Desde/Hasta" seleccionado en Credenciales —
por eso filtrar a un solo día mostraba como si el 100% de la pauta del período completo se
hubiera gastado ese único día. Nueva función `pautaEnRango(campanas, df, dt)`: para cada
campaña, si tiene `porDia`, suma SOLO los días dentro de `[df, dt]`; si no tiene desglose
diario, usa su total completo (no hay forma de recortarla por fecha en ese caso). Se usa en:
- `fetchAll()` — reemplaza la suma plana para `gastoMetaArchivos`/`gastoTiktokArchivos`.
- `gastoPorNombreProducto(nombre)` — igual, para que el ranking de productos y su ROAS por
  producto no infle la pauta cuando se filtra a un rango más corto que el informe completo.

Nota: `extraerGastoDiarioWB`/`gastoDiarioReal()` (sección 18, usados solo por "Análisis por
día") no se tocaron — siguen funcionando igual, ya estaban correctamente implementados.

---

## 22. Novedades — fecha de novedad vacía ya no descarta la novedad (2026-07-14)

**Bug real:** en `renderControlDiario`, si el campo `FECHA DE NOVEDAD` de Dropi venía vacío
para un pedido que SÍ tenía una novedad registrada (columna `NOVEDAD` llena), esa novedad se
descartaba silenciosamente del conteo total (`todasNovedades`) porque `enRango('')` siempre es
falso. Esto hacía que "Total novedades del período" mostrara un número menor al real.

**Fix:** `fechaNovByID[id]` ahora usa `FECHA DE NOVEDAD || FECHA DE ÚLTIMO MOVIMIENTO ||
FECHA` como cadena de respaldo — una novedad real nunca desaparece del conteo solo porque le
falte ese campo específico. Afecta tanto al Bloque 1 (novedades pendientes) como al Bloque 2
(total de novedades del período) por igual, ya que ambos parten de `fechaNovByID`.

**Corrección de texto:** la tarjeta "Solucionadas — devolución directa" decía "no cuenta como
gestión real", lo cual es incorrecto — SÍ hubo gestión (se registró una solución). Lo que no
cuenta es en el **% de efectividad** (porque esos casos no representan una oportunidad real de
"salvar" el pedido, ya iban directo a devolución). Texto corregido a: *"sí se gestionaron; no
entran en el % de efectividad"*. El número (`devolucionDirecta.length`) y el cálculo de
`pctEfectividad` (que ya los excluía correctamente del denominador) no cambiaron.

---

## 23. Publicidad — arreglos en la asignación de paquetes (2026-07-14)

- **Contraste roto en los `<select>` de producto/paquete:** los `<option>` generados
  dinámicamente (`#paquete-producto`, `#paquete-existente`, `#stair-scope`) no tenían
  `background`/`color` propio, así que el popup nativo del navegador los mostraba con texto
  claro sobre fondo claro (heredado del tema oscuro de la página, pero renderizado por el SO
  sin ese contexto) — prácticamente ilegible. Fix: cada `<option>` generado ahora lleva
  `style="background:var(--bg3);color:var(--text)"` explícito.
- **`renderPaquetes()` mostraba el producto mal:** intentaba buscar `p.prodId` (que en realidad
  YA es el nombre resuelto del producto, no un ID) dentro de un mapa indexado por la columna
  `PRODUCTO ID` de Dropi — un cruce que nunca iba a coincidir, cayendo casi siempre al
  fallback `ID ${p.prodId}` (mostraba algo como "ID ETHIOPIAN BLACK SEED OIL"). Fix: se
  muestra `p.prodId` directo, sin ese cruce roto.
- **Nueva opción "Agregar a un paquete existente"** (`agregarACampanaPaquete()`): si falta
  asignar una campaña, ya no hay que crear un paquete nuevo — se puede seleccionar la campaña
  en el buscador y sumarla a cualquier paquete ya creado (con su producto ya asignado) desde un
  selector nuevo junto al de "Crear paquete". Recalcula `gasto` del paquete automáticamente.

---

## 24. Fecha de Shopify por teléfono — ya no se queda solo con la más antigua (2026-07-14)

**Bug real, causaba el desfase de "número de pedidos por fecha" reportado por el usuario:**
`shopifyFechaPorTelefono()` (la función que hace que la fecha de creación de Shopify tenga
prioridad sobre la FECHA propia de Dropi — sección 10, regla de negocio explícita del usuario:
*"Shopify es la fecha REAL de la orden"*) guardaba, por cada teléfono, únicamente la fecha
**más antigua** de todos sus pedidos en Shopify (`if(!porTel[o.tel]||o.fecha<porTel[o.tel])`).

Para un **cliente recurrente** (varios pedidos distintos en Shopify a lo largo del tiempo, algo
común en un negocio de consumo recurrente), esto hacía que **TODOS** sus pedidos en Dropi —
sin importar a cuál compra correspondieran realmente — heredaran la fecha de su **primera
compra**, desplazándolos fuera del día en que realmente ocurrieron. Esto inflaba el conteo del
día de la primera compra y vaciaba los días de las compras posteriores — exactamente el tipo de
"un día metí 137 y me puso 148" que se reportó.

**Fix:** `shopifyFechaPorTelefono()` ahora guarda TODAS las fechas de Shopify de cada teléfono
(`{tel: [fecha1, fecha2, ...]}`), y una nueva función `fechaShopifyMasCercana(fechas, ref)`
elige, para cada pedido de Dropi, la fecha de Shopify de ESE teléfono más cercana a la FECHA
propia del pedido en Dropi (usada solo como ancla para desempatar cuál de las varias compras es
esta). Así cada pedido de Dropi se empareja con SU propio pedido de Shopify, no con el primero
que ese cliente hizo alguna vez. El caso simple (un solo pedido de Shopify por teléfono, o
ningún match) se comporta exactamente igual que antes.

---

## 25. Zona horaria: todo el dashboard opera en hora de Bogotá (GMT-5) (2026-07-14)

**Regla de negocio explícita del usuario:** los pedidos ocurren en Bogotá, así que "hoy" y toda
la aritmética de fechas (días hábiles, antigüedad de pedidos "sin movimiento", rangos rápidos
de Control Diario, filtros de fecha por defecto) deben calcularse **siempre desde GMT-5**, sin
importar en qué zona horaria esté el dispositivo de quien abre el dashboard.

**Por qué importaba:** varias funciones usaban `new Date()` + getters/setters LOCALES
(`.getDate()`, `.setHours(0,0,0,0)`, `.getDay()`, `.toISOString()` mezclado con operaciones
locales) para calcular "hoy" y hacer aritmética de fechas. Esto es correcto SOLO si el reloj del
sistema operativo de quien mira el dashboard está puesto en GMT-5 — si alguien lo abre desde
otra zona horaria (o un dispositivo mal configurado), "hoy" podía quedar desfasado por horas,
corriendo los rangos por defecto, los días hábiles de "Sin movimiento" y de Control Diario, y
la antigüedad de pedidos a un día equivocado.

**Solución — utilidades centralizadas (junto a `parseFecha`), todas sin ninguna dependencia de
la zona horaria del navegador:**
```js
const BOGOTA_OFFSET_MS = 5*60*60*1000;               // Colombia no tiene horario de verano
function nowBogota()                                  // instante "ahora" leído en hora Bogotá
function hoyISOBogota()                                // 'YYYY-MM-DD' de HOY en Bogotá
function sumarDiasISO(iso, dias)                       // suma/resta días de calendario
function diaDeSemanaISO(iso)                           // 0=domingo...6=sábado
function epochDiasISO(iso)                             // día absoluto, para restar dos fechas
```
Todas construyen sus instantes con `Date.UTC(...)` y se leen con getters `getUTC*` — nunca con
los getters locales (`getDate`, `getHours`, etc.), que son los que dependían del reloj del
dispositivo.

**Funciones migradas a estas utilidades** (mismo comportamiento, ahora ancladas a Bogotá):
`setDates()` (rango por defecto: hoy + primero del mes), `calcEfectividad()` (fecha de corte
-10 días), `diasDesdeHoyReal()` (antigüedad para "Sin movimiento"), `diasHabiles()` (días
hábiles sin sábado/domingo), `diasHabilesControl()` (días hábiles de Control Diario, sábado SÍ
cuenta), `setControlRapido()` (hoy/ayer/antier/semana/mes) y la inicialización por defecto de
`controlDesde`/`controlHasta` en `renderControlDiario()`. Se eliminó `fmtISO()` (ya no hace
falta). Los cálculos que YA comparaban dos fechas-string ISO directamente (`fechaShopifyMasCercana`,
`diasRango` en `calcEfectividad`) no se tocaron porque restar dos `new Date('YYYY-MM-DD')`
siempre da un resultado exacto en días sin importar la zona horaria (el spec de JS parsea
fechas-solo-fecha como medianoche UTC).

---

## 26. Trazabilidad Shopify — el "Total analizados" contaba líneas de producto, no pedidos (2026-07-14)

**Bug real, confirmado por el usuario comparando contra una tabla dinámica de Excel** (agrupada
por dirección IP — un campo que sí identifica al pedido completo, no cada línea): el mes de
julio tenía 2169 pedidos reales en Shopify, pero el dashboard mostraba 2276 en la tarjeta
"Total Shopify analizados" de Trazabilidad — una inflación de ~5%, consistente con pedidos que
tienen más de un producto (línea) por orden.

**Causa:** `calcTrazabilidad()` arma `resultados` con **una fila por cada producto/línea** de
cada pedido de Shopify (`sOrd.productos.forEach(shopProd=>{resultados.push(...)})`) — necesario
para el detalle (mostrar cada producto y si migró), pero los KPIs (`migrados`, `noBajados`,
`diffProd`, `total`) se calculaban con `resultados.filter(...).length`/`resultados.length`
directamente. Un pedido con 2 productos distintos contaba como 2 pedidos; uno con 3, como 3.

**Fix:** los KPIs ahora se agrupan primero por `shopName` (el pedido real) — cada orden se
clasifica una sola vez según su MEJOR resultado entre sus líneas (si alguna línea migró →
migrada; si ninguna migró pero alguna tiene producto distinto en Dropi → producto diferente; si
no → no migrada). `total` ahora es el número de **pedidos únicos**, no de líneas. La tabla de
detalle (`trazData`/`resultados`, con una fila por producto) NO se tocó — sigue mostrando el
desglose línea por línea, solo los KPIs de resumen quedaron corregidos.

---

## 27. Cuentas con acumulación de pedidos (Supabase) (2026-07-15)

Sistema opcional de inicio de sesión para que el negocio pueda ir acumulando su historial de
pedidos de Dropi entre subidas, sin duplicar ni perder información. **Puramente aditivo:** si
`SUPABASE_URL`/`SUPABASE_ANON_KEY` no están configurados (siguen con el valor placeholder), `sb`
queda `null` y todo el dashboard se comporta exactamente igual que antes — sin login, sin
guardado, sin ningún cambio de comportamiento.

### Por qué "pedido por pedido" y no "reporte por reporte"

El primer diseño (descartado) guardaba un JSON-resumen por cada reporte generado (por rango de
fechas). Ese enfoque **no permite mezclar rangos que se traslapan** sin duplicar o perder datos:
si el último informe subido fue del 1 al 15 y el nuevo es del 10 al 30, no hay forma de "sumar"
dos resúmenes ya calculados sin ambigüedad. La solución correcta es guardar **cada pedido
individual**, usando su campo `ID` de Dropi (único por pedido) como llave de upsert:
- Si el `ID` ya existía → se actualiza en su lugar (nunca se duplica).
- Si es nuevo → se agrega.
- Los pedidos de subidas anteriores que no vuelven a aparecer en la subida actual **se quedan
  tal cual estaban** — nunca se pierden ni se ignoran.

Esto logra exactamente "acumular sin duplicar, complementando" para cualquier combinación de
rangos de fechas, sin necesidad de lógica especial de fusión de reportes.

### Esquema (`supabase_schema.sql`, para pegar en el SQL Editor de Supabase)

Tabla `pedidos_dropi`: `user_id`, `pedido_id` (el `ID` de Dropi, como texto), `orden` (jsonb —
la fila cruda de `dOrd` para ese pedido), `productos` (jsonb — array de las filas crudas de
`dProd` de ese pedido), `actualizado_en`. Llave primaria `(user_id, pedido_id)` — es lo que
permite el upsert por ID. RLS habilitado con una sola policy `for all` restringida a
`auth.uid() = user_id`.

**Por qué no satura:** el tamaño crece con el número REAL de pedidos del negocio (no con
cuántas veces se re-sube el mismo rango), y cada fila pesa unos cientos de bytes de JSON — la
capa gratuita de Supabase (500MB) cubre años de operación típica. Escala a muchas cuentas
porque cada una queda aislada por `user_id` vía RLS.

**Alcance actual:** solo pedidos de Dropi (`dOrd`+`dProd`). Shopify/Meta/TikTok podrían sumarse
después con el mismo patrón (tabla propia, llave natural: `Name` de Shopify, campaña de
Meta/TikTok) si se pide.

### Piezas nuevas en `index.html`

- **Cliente:** `<script>` de `@supabase/supabase-js` (junto al de XLSX), y `let sb = ...` —
  `let` (no `const`) para poder reconfigurarlo sin recargar si hiciera falta. Constantes
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` con placeholder por defecto.
- **UI de auth:** dentro del landing (`#lg-auth`, con pestañas Entrar/Crear cuenta) y en el
  header (`#hdr-session`, correo + "Cerrar sesión") — ambos ocultos si `sb` es `null`.
  `lgAuthSubmit()` llama `sb.auth.signInWithPassword()` / `sb.auth.signUp()`; `cerrarSesion()`
  llama `sb.auth.signOut()`.
- **Fusión** (el corazón del feature):
  - `agruparProdPorId(filas)` — agrupa filas de `dProd` por el `ID` de pedido al que
    pertenecen (varias líneas de producto comparten el mismo `ID`).
  - `cargarPedidosGuardados()` — trae TODOS los pedidos guardados del usuario, paginando de a
    1000 filas (límite de Supabase por consulta) hasta que una página vuelve incompleta.
  - `guardarPedidosNuevos(nuevosOrd, nuevosProdPorId)` — sube en tandas de 500 SOLO los
    pedidos recién subidos en esta sesión de navegador (no todo lo acumulado, para no
    reescribir de más). Si falla (sin internet, etc.) no bloquea el flujo — solo un aviso.
  - En `fetchAll()` (justo antes de `procesarDropi`): si hay sesión activa y se subió algo,
    se trae lo guardado, se combina con lo recién subido (lo recién subido gana en caso de
    `ID` repetido — es la versión más fresca), se reasignan los globales `dOrd`/`dProd` al
    resultado mezclado, y se guarda (en segundo plano) solo lo nuevo. El rango de fechas
    seleccionado (`df`/`dt`) sigue siendo el que la persona eligió — si quiere ver todo lo
    acumulado, solo tiene que ampliar el rango de "Desde/Hasta".
  - `onSesionActiva()` — al detectar sesión (login exitoso o ya activa al cargar la página):
    trae todo lo acumulado, si hay datos ajusta `date-from`/`date-to` al rango completo
    (mínima/máxima fecha encontrada) y llama `fetchAll()` — así la persona ve de inmediato
    todo su historial sin subir nada. Si la cuenta es nueva (sin datos), se queda en el
    landing normal.
  - `verificarSesionInicial()` — se llama al cargar la página (línea final del script) y
    revisa `sb.auth.getSession()` para restaurar la sesión si ya existía.

### Verificación realizada

Se probó con un cliente Supabase simulado en memoria (mock de `auth` + tabla `pedidos_dropi`
con upsert real por `(user_id,pedido_id)`), ya que no se contaba con credenciales reales de un
proyecto Supabase en esta sesión: registro, login con clave incorrecta, subida de pedidos 1-15,
subida de pedidos 10-30 (con 10-15 cambiando de estatus y 16-30 nuevos) → se confirmó que el
resultado final tiene exactamente 30 pedidos únicos, los no tocados (1-9) intactos, los
traslapados (10-15) actualizados al nuevo estatus, cierre de sesión, y auto-carga completa de
los 30 pedidos acumulados al simular una sesión de navegador nueva — sin subir ningún archivo.
Barrido de las 9 tabs sin errores de consola en todo el proceso.

**Pendiente del lado del usuario:** crear el proyecto en supabase.com, correr
`supabase_schema.sql` en el SQL Editor, y reemplazar `SUPABASE_URL`/`SUPABASE_ANON_KEY` en
`index.html` con los valores reales del proyecto (Project Settings → API) para activar el
login de verdad en producción.

**Actualización:** ya conectado con el proyecto real del usuario (`SUPABASE_URL`/
`SUPABASE_ANON_KEY` con los valores reales, no el placeholder). Verificado con un signup real
contra el proyecto — Supabase pide confirmar el correo por defecto, y el usuario desactivó esa
opción (Authentication → Sign In / Providers → "Confirm email") para simplificar el registro
mientras el número de cuentas es pequeño.

---

## 28. Ciudades: expandir por producto como tabla dinámica de Excel (2026-07-16)

El desglose por ciudad (clic en una ciudad → "Por producto"/"Por transportadora", sección 19)
ahora se comporta como el drill-down de una tabla dinámica de Excel:
- **Flechita que gira** (`.cd-chev`) en la fila de la ciudad, igual al patrón ya usado en los
  `<details class="how">` — indica visualmente que la fila es expandible y su estado actual.
- **Acordeón, no acumulativo**: solo una ciudad puede estar expandida a la vez. Al abrir una
  nueva, la que estuviera abierta se cierra sola (`ciudadAbierta` guarda el índice de la única
  ciudad abierta). Antes se podían dejar varias ciudades abiertas al mismo tiempo.
- El panel de detalle (`.cd-panel`) se ve "conectado" a la fila de la ciudad (sin borde
  superior, con una línea vertical sutil a la izquierda) en vez de una tarjeta flotando aparte,
  para reforzar la sensación de jerarquía ciudad → producto/transportadora.

No cambia ningún cálculo — es puramente la interacción/presentación de `renderCiudadesFiltradas`
y `toggleCiudadDetalle`, ambas en `index.html`.

---

## 29. Landing enfocado en el login cuando hay cuentas configuradas (2026-07-16)

Cuando `sb` está configurado (Supabase activo), el landing ya no muestra primero el copy de
marketing con el login escondido al final — ahora el login/registro es lo PRIMERO y único que
se ve, con un título grande y estilizado (`.lg-hero-title`, tipografía Sora con degradado
animado) y un tag "Bienvenido de nuevo" arriba.

**Cómo funciona (`ajustarLandingSegunCuentas()`, llamada al cargar la página):**
- Si `sb` existe: oculta `#lg-marketing` (todo el copy/CTA/chips clásicos), muestra
  `#lg-hero-auth`, le agrega la clase `lg-focus-auth` a `#landing` (atenúa los orbes de fondo
  para que no compitan visualmente con el login), y **traslada** el mismo `#lg-auth` (no lo
  duplica) al slot `#lg-auth-hero-slot` dentro del bloque épico — sigue siendo el mismo
  formulario con la misma lógica de `lgAuthSubmit`/`lgAuthTab`, solo cambia de lugar en el DOM.
- Si `sb` es `null` (sin cuentas configuradas): el landing se ve exactamente igual que antes
  del sistema de cuentas — el bloque de marketing clásico con su CTA "Iniciar control
  logístico".
- **Escape hatch:** dentro del bloque épico hay un link pequeño "¿Solo quieres verlo? Continuar
  sin cuenta →" (`usarSinCuenta()`) que llama a `entrarApp()` directo — para quien no quiera
  crear cuenta, sigue pudiendo usar el dashboard de forma normal, sin persistencia.

Una vez hay sesión activa, el flujo de siempre sigue igual: `onSesionActiva()` carga todo lo
acumulado y entra directo al dashboard (sección 27); si la cuenta es nueva sin datos, se queda
en el landing pero ya mostrando "Conectado como [correo]" en vez del formulario.

---

## 30. Tipografía monoespaciada retirada + fondo sólido del login + autofill (2026-07-16)

**Tipografía:** `JetBrains Mono` (usada en casi todos los números del dashboard — KPIs,
montos en tablas, IDs, guías) se veía "de código/juego de los 90" según el usuario. Se
reemplazó por `'Inter',sans-serif` en las ~32 apariciones del archivo (la variable
`--font-mono`, todos los `style="font-family:'JetBrains Mono',monospace"` inline, y los dos
usos en `canvas` para las etiquetas de las tortas) y se quitó `JetBrains+Mono` del `@import`
de Google Fonts (ya no se usa, no hace falta cargarlo). Para que las columnas de dinero sigan
alineándose bien con una fuente proporcional, se agregó `font-variant-numeric:tabular-nums`
en `body` (los dígitos quedan con el mismo ancho entre sí, sin ser monoespaciados).

**Fondo del landing:** tenía transparencia real (`rgba` con alpha .55–.92 + `backdrop-filter:
blur(2px)`), dejando ver claramente las tarjetas del dashboard (Credenciales, Archivos)
detrás del login. Ahora es 100% opaco: `background-color` sólido + gradiente entre dos
colores sólidos (sin alpha), sin `backdrop-filter`.

**Autofill de Chrome:** el navegador fuerza un fondo claro/blanco en campos que reconoce (como
el de correo), ignorando el CSS del sitio. Se agregó la regla estándar
`input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px var(--bg3) inset!important;...}` para
que el autocompletado respete el tema oscuro.

---

## 31. Desplegables nativos en tema claro + reordenar tab Proyección (2026-07-20)

**Desplegables (`<select>`) con fondo blanco:** aunque cada `<option>` ya tenía
`background:var(--bg3);color:var(--text)` inline, el panel emergente que el navegador dibuja al
abrir un `<select>` es en parte control nativo del sistema operativo y algunos navegadores
ignoran ese CSS para ese panel específico, mostrándolo con los colores claros por defecto del
SO. Se agregó `color-scheme:dark;` en `:root` — le indica a Chrome/Edge que todos los controles
nativos de formulario (el panel de `<select>`, checkboxes, scrollbars, selector de fecha) deben
dibujarse en su variante oscura por defecto, sin depender de que cada control tenga su propio
CSS.

**Orden del tab Proyección:** la tarjeta "Utilidad según cuánto entregues..." (el simulador
escalonado, sección 17) ahora aparece **antes** que "Proyección de ingresos" (la tabla de
pedidos en movimiento) — antes era al revés. Cambio puramente de orden en el HTML, sin tocar
ningún cálculo.
