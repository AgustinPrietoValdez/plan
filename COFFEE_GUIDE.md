# COFFEE_GUIDE - Cerebro de referencia del asistente de cafe (app Plan)

Esta es la guia viva de extraccion de cafe que usa el asistente de Plan. La idea: el dueno
pregunta a Claude Code en la terminal "que ajusto?" y Claude lee este archivo MAS los datos
de sus brews para recomendar cambios concretos.

## Estructura en 3 partes

- **Parte 1 - Ciencia de extraccion** (este bloque, ya completo): la teoria y las tablas
  de diagnostico que no cambian. Es el conocimiento base para razonar cualquier ajuste.
- **Parte 2 - Info por cafe**: se completa al cargar cada grano (origen, proceso, tueste,
  recetas probadas, notas).
- **Parte 3 - Perfil de gustos del usuario**: se construye con las catas (que le gusta,
  que evita, sesgos personales).

## Como usar

Claude lee esto MAS los brews del usuario y recomienda ajustes. La guia se actualiza con
cada cafe: lo aprendido en una cata se vuelca en Parte 2 y Parte 3 para mejorar futuras
recomendaciones. Parte 1 es la fisica; Partes 2 y 3 son la memoria personal.

---

# PARTE 1 - Ciencia de extraccion

## Regla que sostiene todo

**El ratio controla la fuerza (concentracion). La molienda, el tiempo, la temperatura y la
agitacion controlan la extraccion (rendimiento).** Son dos ejes independientes: podes tener
un cafe bien extraido pero debil, o mal extraido pero fuerte. Diagnosticar el problema
correcto evita "arreglar" el eje equivocado.

Definiciones rapidas:
- **Fuerza / concentracion (TDS)**: porcentaje de solidos disueltos en la taza. Es que tan
  intenso/cargado se siente. Se ajusta con el ratio agua:cafe.
- **Rendimiento de extraccion (EY)**: porcentaje de la masa del cafe molido que termino
  disuelta en la bebida. Es que tanto sacaste del grano. Se ajusta con molienda, tiempo,
  temperatura y agitacion.
- Relacion: Fuerza = ratio de preparacion x porcentaje de extraccion (Wikipedia, Coffee
  extraction).

## 1. Tabla de variables (las palancas)

| Variable | Afecta principalmente | Direccion del efecto | Paso de ajuste tipico |
|---|---|---|---|
| Molienda (grind) | Extraccion (EY) | Mas fina = mas superficie = mas extraccion y mas rapida; mas gruesa = menos extraccion | 1-2 clicks por vez en el molino |
| Ratio / dosis (agua:cafe) | Fuerza (TDS) | Mas agua por dosis = mas debil; menos agua por dosis = mas fuerte | Mover un punto, ej 1:15 -> 1:14 (mas fuerte) o 1:16 (mas debil) |
| Temperatura del agua | Extraccion (EY) | Mas caliente = mas extraccion; mas fria = menos. Rango util 91-94 C; tope 100 C | 2-3 C por vez |
| Agitacion (stir/swirl/pour) | Extraccion (EY) | Mas agitacion = mas extraccion (mas contacto y mezcla); menos = menos | Agregar o quitar un swirl / un stir |
| Perfil de vertido (pours) | Extraccion + uniformidad | Mas pours / vertidos altos = mas agitacion y extraccion; un solo vertido suave = menos | Pasar de 2 a 3 pours, o subir/bajar altura |
| Tiempo de preparacion | Extraccion (EY) | Mas largo = mas extraccion; mas corto = menos. Suele moverse junto con la molienda | +/- 15-30 s (a menudo se ajusta moviendo la molienda) |

Nota: el tiempo total rara vez se fuerza solo; en filtro se controla sobre todo cambiando la
molienda (mas fino = drena mas lento = mas tiempo). (Wikipedia, Coffee extraction; principios
del Coffee Compass de Matt Perger / Barista Hustle.)

## 2. La caja ideal de la SCA (Brewing Control Chart)

El Brewing Control Chart cruza dos ejes y deja un rectangulo "ideal" en el centro:

- **Eje fuerza (TDS):** ~1.15 - 1.45 % segun region. Referencias: Norteamerica 1.15-1.35 %,
  Europa 1.20-1.45 %, nordico 1.30-1.50 %. Usar **1.15-1.45 %** como caja amplia.
- **Eje extraccion (EY):** **18 - 22 %**.
  - Debajo de 18 % = sub-extraido (sabe acido/agrio).
  - Arriba de 22 % = sobre-extraido (sabe amargo).

Como leerlo (las 4 esquinas y el centro):
- **Centro (en caja):** balanceado, dulce, limpio. No tocar.
- **Izquierda (EY < 18 %):** sub-extraido -> mover hacia mas extraccion (ver Parte 1.3).
- **Derecha (EY > 22 %):** sobre-extraido -> mover hacia menos extraccion.
- **Arriba (TDS alto):** muy fuerte -> aflojar ratio (mas agua por dosis).
- **Abajo (TDS bajo):** muy debil -> apretar ratio (menos agua por dosis).

Importante: extraccion (horizontal) y fuerza (vertical) se ajustan con palancas distintas;
por eso primero ubicas en que cuadrante caes y despues elegis la palanca correcta.
(Wikipedia, Coffee extraction; SCA Brewing Research / Brewing Control Chart.)

## 3. Coffee Compass: defecto -> arreglo (el corazon del asistente)

Como leer el cafe: a medida que sube la extraccion, el sabor progresa de **agrio/salado
(sub-extraido) -> dulce (ideal) -> amargo/seco (sobre-extraido)**. Por separado, el ratio
mueve el cafe entre **debil** y **muy fuerte**. (Matt Perger, "Coffee Extraction and How to
Taste It".)

Primer movimiento recomendado casi siempre: **la molienda** (es la palanca mas potente).
Despues afinar con temperatura, tiempo y agitacion. El ratio se toca solo para problemas de
fuerza, no de sabor de extraccion.

| Sintoma en la taza | Diagnostico | Arreglos en orden (direccional) | Fuente |
|---|---|---|---|
| Agrio / acido punzante / salado / a pasto (grassy) / final corto, vacio | Sub-extraido (EY bajo) | 1) Moler **1-2 clicks mas fino** 2) **Subir temp 2-3 C** (hacia 94-96 C) 3) **Alargar tiempo** +15-30 s 4) **Mas agitacion** (un swirl/stir extra o vertidos mas altos) | Perger / Coffee Compass; Coffee On Cue; Barista Life; Wikipedia |
| Amargo / aspero (harsh) / astringente, seca la boca / hueco (hollow) sin cuerpo | Sobre-extraido (EY alto) | 1) Moler **1-2 clicks mas grueso** 2) **Bajar temp 2-3 C** 3) **Acortar tiempo** -15-30 s 4) **Menos agitacion** (sacar un swirl/stir, vertidos mas suaves) | Perger / Coffee Compass; Coffee On Cue; Barista Life; Wikipedia |
| Debil / aguado / fino, sin intensidad (pero limpio, no agrio) | Fuerza baja (TDS bajo) | **Apretar el ratio**: menos agua por dosis, ej **1:16 -> 1:15** (o 1:15 -> 1:14). Alternativa: subir la dosis de cafe | Coffee Compass / Barista Life; SCA chart |
| Muy fuerte / cargado / turbio (muddy), abruma | Fuerza alta (TDS alto) | **Aflojar el ratio**: mas agua por dosis, ej **1:15 -> 1:16**. Alternativa: bajar la dosis | Coffee Compass / Barista Life; SCA chart |

Casos combinados (cuando hay dos sintomas):
- Agrio Y debil: primero moler mas fino (extraccion) y luego apretar ratio si sigue debil.
- Amargo Y muy fuerte: aflojar ratio y moler mas grueso a la vez.
- Se pueden combinar palancas finas, ej "moler un poco mas fino mientras acortas un poco el
  tiempo" para ajustar sin pasarte. (Coffee On Cue.)

## 4. Receta ancla (baseline): James Hoffmann Ultimate V60

Es el punto de partida por defecto. Cualquier ajuste de la seccion 3 se hace **desde aca**.

- **Dosis:** 30 g de cafe
- **Agua total:** 500 g
- **Ratio:** 1:16.7 aprox (60 g de cafe por litro de agua, formula de Hoffmann)
- **Molienda:** media-fina
- **Temperatura:** 100 C (agua recien hervida). Para tuestes oscuros, usar agua mas fria
  (bajar la temperatura) porque el tueste oscuro ya esta mas soluble y se sobre-extrae mas
  facil.
- **Bloom:** 60 g de agua. Vertido en espiral desde el centro hacia afuera para mojar todo
  el cafe; despues hacer un swirl (girar el brewer) hasta que la mezcla quede pareja, sin
  grumos. Bloom ~45 s.
- **Pours despues del bloom:**
  - 1er vertido: hasta **240 g** total (vertido del centro hacia afuera para mover el lecho,
    luego concentrico).
  - 2do vertido: hasta **500 g** total (es decir, agregar ~200 g; vertido al centro
    manteniendo el V60 lleno). Hoffmann busca terminar los vertidos cerca de 1:15.
- **Agitacion final:** revolver suave con cuchara en un sentido y luego al reves (sin formar
  remolino), y un swirl gentil 2-3 veces cuando ya drano lo suficiente, para emparejar el
  lecho.
- **Tiempo total objetivo:** ~3:30.

(Honest Coffee Guide - James Hoffmann V60. Nota: la fuente lista la receta a 1:16.7 / 60 g
por litro; el prompt la referencia como ~1:15. Tratar 1:15-1:16.7 como rango baseline y
apretar/aflojar desde ahi segun fuerza.)

## 5. Actualizaciones y advertencias (estado 2026)

Dos cosas cambiaron y conviene tenerlas presentes para no razonar con info vieja:

- **Cupping: el protocolo SCA 2004 quedo SUPERADO.** En noviembre 2024 la SCA adopto el
  Coffee Value Assessment (CVA): normas SCA-102 (preparacion y mecanica de cata), SCA-103
  (evaluacion descriptiva) y SCA-104 (evaluacion afectiva). El cambio de fondo: ya no hay un
  unico puntaje de cata, sino dos tareas separadas -> **descriptiva** (intensidad, escala de
  15 puntos, estilo CATA) y **afectiva** (calidad/preferencia, escala hedonica de 9 puntos).
  Mucho contenido viejo en la web todavia cita el protocolo 2004; tratarlo como historico.
  (Fuente: SCA, verificado.)
- **La "caja ideal" del Brewing Control Chart ya NO es dogma.** La investigacion de UC Davis
  (Guinard et al. 2023, peer-reviewed, >58.000 datos sensoriales) muestra que la linea
  vertical fuerte/debil por TDS puede confundir y que hay al menos 2 clusters de preferencia
  de consumidores: no existe un unico optimo universal. La franja **18-22% EY / 1.15-1.45%
  TDS sigue siendo un buen PUNTO DE PARTIDA, no un objetivo absoluto**. La SCA aun NO ratifico
  un chart nuevo oficial. (Fuentes: UC Davis Coffee Center; SCA, verificado.)

---

## Parte 2 - Info por cafe (se completa al cargar cada grano)

### Referencia general: perfil por metodo de proceso

Tendencias respaldadas por literatura peer-reviewed. OJO: son **tendencias, no leyes**; el
resultado real depende de variedad, origen, altitud, condiciones de secado y manejo de la
fermentacion. Sirven para anticipar el perfil de un grano antes de la cata.

| Proceso | Acidez | Dulzor | Cuerpo | Perfil tipico | Por que (mecanismo) |
|---|---|---|---|---|---|
| Lavado / washed | Alta, limpia | Medio | Mas liviano | Claridad, acidez brillante, "limpio" | Se quita pulpa+mucilago antes de secar -> menos azucar disponible -> menos furanos/Maillard; menos fermentacion |
| Natural / seco | Mas baja, redonda | Alto | Mas pesado | Frutado intenso, dulce, notas a vino/fermento (puede irse a "funky" si se maneja mal) | Se seca con la cereza entera -> fermentacion de azucares del mucilago -> mas azucares residuales, pirazinas y aldehidos |
| Honey / pulped natural | Media, redondeada | Alto/intenso | Medio | Intermedio washed-natural; dulzor intenso, mouthfeel complejo | Se quita pulpa pero queda parte del mucilago al secar -> glucosa+fructosa entre washed (min) y natural (max) |

- **Variantes honey** (de mas cerca de washed a mas cerca de natural): white/yellow honey =
  mas brillante y limpio; red/black honey = mas cuerpo y fermento. NOTA: la idea de "mas
  mucilago = mas dulce" como explicacion de las variantes NO esta bien respaldada (verificacion
  la descarto); la diferencia real pasa mas por tiempo/condicion de secado.
- **Matiz de azucar:** solo glucosa+fructosa varian por proceso; la sacarosa (>90% del azucar
  total) NO cambia con el proceso.

**Ajuste por proceso (orientativo — la evidencia da los perfiles, no recetas exactas):**
- Naturales/honey suelen extraer "mas facil" y pueden irse a amargo/fermento -> empezar un
  toque mas grueso o algo mas frio si aparece aspereza.
- Lavados, mas limpios y acidos, suelen tolerar (y pedir) un poco mas de extraccion para sacar
  dulzor: moler mas fino / subir temp si sale agrio.
- Regla intacta: diagnosticar el sabor (Coffee Compass) antes de mover palancas.

(Fuentes: Cao et al. 2023 Int. J. Food Sci. & Tech.; review J. Food Sci. Tech. 2022
PMC9376573; Frontiers in Microbiology 2019 PMC6863779; Coffee Science / Catimor Alto Inambari;
Perfect Daily Grind. Todas las generalizaciones son tendencias, no universales.)

### Cafes cargados

#### Monkaaba (La Cabra) -- Colombia, Pink Bourbon, Washed

- **Ficha:** roaster La Cabra; productor "Monkaaba farmers"; tostado 2026-05-22; 250 g.
- **Perfil esperado:** washed + Pink Bourbon -> taza limpia y floral, acidez citrica/jugosa,
  dulzor a panela/caramelo, notas a te o tropical; cuerpo medio-liviano. (Perfil tipico de
  variedad, confianza media; ajustar con las catas reales.)
- **Receta recomendada:** "V60 - Lance" (doble bloom, alta agitacion).
  - Ratio: **1:15 a 1:16** (empezar 1:15).
  - Temperatura: **93 C** (washed claro tolera/pide algo mas de extraccion para el dulzor).
  - Molienda: **media-fina, ~80** en tu molino (mismo punto que venis usando; ajustar de a 1 click).
  - Razon: es delicado y limpio -> extraer bien para el dulzor sin pasarse (la sobre-extraccion
    lo pone astringente y mata lo floral).
- **Diagnostico rapido (Coffee Compass):** agrio/plano -> mas fino o +temp; astringente/amargo
  -> mas grueso o -temp. Mover una palanca por vez.
- **Catas y ajustes:** (se completa con cada brew; volcar cata_inicial y last_tweak.)

_Los proximos cafes se agregan abajo con el mismo formato (ficha, perfil esperado, receta
recomendada con molienda+temp, diagnostico, catas)._

## Parte 3 - Perfil de gustos del usuario (se construye con las catas)

_Placeholder: aca se acumula que sabores prefiere y evita el dueno, y sus sesgos de ajuste.
Vacio hasta las primeras catas._

---

## Fuentes

Lista curada y verificada (verificacion adversarial multi-agente, mayoria por fuentes
primarias y voto unanime). **[G] = gratis, [P] = pago.** Actualizado 2026-06-14.

### Estandares e instituciones
- **[G] SCA - Coffee Value Assessment (CVA), normas SCA-102/103/104 (2024):**
  https://sca.coffee/cva-102 — Respalda: Specialty Coffee Association. Preparacion y mecanica
  de cata + evaluacion descriptiva y afectiva. **Reemplaza al protocolo de cupping 2004.**
  Dosis de cata 8.25 g/150 mL; molienda 70-75% pasa malla US 20 (~850 um).
- **[G] SCA - Coffee Taster's Flavor Wheel:**
  https://sca.coffee/research/coffee-tasters-flavor-wheel — Rueda de vocabulario sensorial
  (1995, rediseno 2016 con WCR). Base cientifica = WCR Sensory Lexicon.
- **[G] World Coffee Research - Sensory Lexicon:**
  https://worldcoffeeresearch.org/resources/sensory-lexicon — 110 atributos definidos con
  referencias de intensidad. Hecho en Kansas State University (lab de Edgar Chambers IV).
- **[G] World Coffee Research - Arabica Variety Catalog:**
  https://worldcoffeeresearch.org/resources/coffee-varieties-catalog — Catalogo de variedades.
- **[G] SCA / E.E. Lockhart - Brewing Control Chart (origen):**
  https://sca.coffee/sca-news/25/issue-13/towards-a-new-brewing-chart — TDS x extraccion x
  ratio; nace del trabajo de Lockhart (MIT, paper 1957). Ver caveat en Parte 1 sec 5: la
  "caja ideal" esta hoy cuestionada.

### Ciencia de extraccion (peer-reviewed)
- **[G abstract / P paper] UC Davis Coffee Center - Guinard et al. 2023** (Journal of Food
  Science, doi:10.1111/1750-3841.16531):
  https://coffeecenter.ucdavis.edu/news/uc-davis-coffee-center-contributes-research-new-brewing-control-chart
  — >58.000 datos sensoriales; cuestiona la caja clasica; propone charts nuevos (no oficiales).
  Formula clave: **EY% = masa de cafe liquido x TDS% / dosis**.
- **[G] Moroney et al. 2019** (PLOS ONE, open access, doi:10.1371/journal.pone.0219906):
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0219906 — Fisica del
  pour-over: lechos conicos (V60) extraen menos uniforme que cilindricos; molienda fina ->
  ~5 puntos de variacion de EY en el lecho.

### Baristas y autores reconocidos
- **[G] James Hoffmann - Ultimate V60** (Honest Coffee Guide):
  https://honestcoffeeguide.com/brew-recipes/james-hoffmann-v60/ — 30 g cafe : 500 g agua
  (1:16.7, "60 g/L"); bloom 60 g (2:1); vertidos acumulados 60/300/500 g; terminar drawdown
  ~3:30. Hoffmann = Campeon Mundial Barista 2007.
- **[P libro] James Hoffmann - The World Atlas of Coffee** (ISBN 9781784724290 UK Mitchell
  Beazley / 9780228100942 Firefly) — referencia de origenes, variedades y procesos.
- **[G] Matt Perger / Barista Hustle - The Coffee Compass:**
  https://www.baristahustle.com/coffee-compass/ — Diagnostico de extraccion: agrio/falta dulzor
  = sub-extraido; amargo/astringente = sobre-extraido. Tool gratis; Barista Hustle ademas vende
  cursos [P]. Perger = Campeon Mundial Brewers Cup 2012. (Nota: amargo Y agrio a la vez =
  extraccion despareja/canalizacion, no un solo eje.)
- **[G] Tim Wendelboe - guia pour-over/filtro:**
  https://timwendelboe.no/pages/how-to-brew-pourover-and-filter-coffee — 65 g/L (~1:15.4).
  Ex Campeon Mundial Barista.
- **[P] Scott Rao - libros:** https://scottrao.com — The Professional Barista's Handbook ($45),
  The Coffee Roaster's Companion ($45), Everything But Espresso ($35, filtro/no-espresso).
- **Lance Hedrick** - 2do en US Brewers Cup 2020 (Onyx Coffee Lab); fuerte en YouTube para
  pour-over de alta extraccion. (URL exacta de su receta y credencial AeroPress: sin verificar.)

### Cata y proceso (peer-reviewed, sostienen Parte 2)
- **[G] Cao et al. 2023** (Int. J. Food Sci. & Tech. 58(3):1007):
  https://academic.oup.com/ijfst/article/58/3/1007/7807986 — perfiles por proceso; azucares.
- **[G] Review J. Food Sci. Tech. 2022** (PMC9376573):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9376573/ — washed vs natural, mecanismos.
- **[G] Frontiers in Microbiology 2019** (PMC6863779):
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6863779/ — fermentacion larga -> mas frutado/acido.

### Secundarias utiles (usar con criterio)
- Coffee extraction (Wikipedia): https://en.wikipedia.org/wiki/Coffee_extraction — resumen de
  TDS/EY/BCC.
- Coffee Compass method (Coffee On Cue): https://www.coffeeoncue.com.au/blogs/how-to-make-coffee/coffee-compass-method-improve-filter-brewing-quality
- V60 Coffee Compass Troubleshooting (Barista Life): https://baristalife.co/blogs/blog/v60-coffee-compass-guide
- Matt Perger, "Coffee Extraction and How to Taste It" (Medium): https://medium.com/@mattperger/coffee-extraction-and-how-to-taste-it-4e06f8abb755
- Perfect Daily Grind - Washed/Natural/Honey 101: https://perfectdailygrind.com/2016/07/washed-natural-honey-coffee-processing-101/ — util, pero algunas generalizaciones flojas.
- SCA Brewing Research: https://sca.coffee/brewing-research

### No usar (descartado en verificacion)
- "The Physics of Filter Coffee" de Scott Rao: **NO existe** tal recurso (descartado, voto 1-2).
  Su contenido de filtro esta en "Everything But Espresso".
