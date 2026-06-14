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

---

## Parte 2 - Info por cafe (se completa al cargar cada grano)

_Placeholder: aca se vuelca cada cafe cargado (origen, proceso, variedad, tueste, recetas
probadas y sus resultados). Vacio hasta el primer grano._

## Parte 3 - Perfil de gustos del usuario (se construye con las catas)

_Placeholder: aca se acumula que sabores prefiere y evita el dueno, y sus sesgos de ajuste.
Vacio hasta las primeras catas._

---

## Fuentes

- James Hoffmann Ultimate V60 (Honest Coffee Guide): https://honestcoffeeguide.com/brew-recipes/james-hoffmann-v60/
- Coffee extraction - fuerza, EY, Brewing Control Chart, rangos SCA (Wikipedia): https://en.wikipedia.org/wiki/Coffee_extraction
- SCA Brewing Research / Brewing Control Chart: https://sca.coffee/brewing-research
- Coffee Compass - metodo de diagnostico filtro (Coffee On Cue): https://www.coffeeoncue.com.au/blogs/how-to-make-coffee/coffee-compass-method-improve-filter-brewing-quality
- V60 Coffee Compass Troubleshooting (Barista Life): https://baristalife.co/blogs/blog/v60-coffee-compass-guide
- Matt Perger, "Coffee Extraction and How to Taste It" (Medium): https://medium.com/@mattperger/coffee-extraction-and-how-to-taste-it-4e06f8abb755

_Fuentes consultadas pero inaccesibles al momento de escribir: compelling.coffee/blog/brewed-coffee-compass (HTTP 500) y las lecciones de Barista Hustle sobre temperatura y molienda (HTTP 402, contenido de pago). El mapeo del Coffee Compass se reconstruyo con las fuentes accesibles arriba._
