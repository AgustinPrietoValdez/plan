# Changelog

All notable changes to **Plan** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.5] - 2026-05-29

### Fixed
- **Las notificaciones legítimas no se programaban después del sweep de 0.7.4**.
  Verificado con `dumpsys alarm`: tras cancelar las legacy, el AlarmManager
  quedaba sin alarms pendientes para el app, así que los recordatorios de
  horario de comida nunca disparaban. Tres fixes defensivos combinados:
  1. Esperar a que `useComprasSettings` resuelva (`.isSuccess`) antes de
     decidir si hay que cancelar o schedulear. Sin eso, en el primer render
     mobile `settings.data` es `undefined`, el hook va al branch
     "no enabled → cancelAll() → return", y si el user cierra la app antes
     de que settings sincronice de Supabase, nada se programa nunca.
  2. Usar `invoke("plugin:notification|is_permission_granted")` directo en
     lugar del helper JS del plugin, que lee `window.Notification.permission`
     primero y en Android WebView puede devolver `'denied'` aunque el OS
     sí concedió el permiso real.
  3. Cambiar el `for` con `await` secuencial por `Promise.all`. Si Android
     freezea el proceso al medio (porque el user volvió a la home), los
     await pendientes pueden no completar todos los slots; en paralelo es
     más probable que el dispatch al plugin Rust llegue antes.

## [0.7.4] - 2026-05-29

### Fixed
- **Spam de notificaciones (Android) — fix raíz #3 (la real)**. Diagnosticado
  con `dumpsys alarm`: el celu tenía 4 alarms del `AlarmManager` con
  `repeatInterval` chico (la de ~5 min causaba el spam) registradas desde
  la 0.7.0, que usaba `Schedule.at(date, repeating=true)` y eso terminaba
  en `alarmManager.setRepeating(RTC, date, date - now, pi)`. Como `date ≈ now`,
  el interval quedaba minúsculo. Esos `PendingIntent`s del sistema persisten
  cross-reinstall y NO están en el storage interno del plugin, así que
  `cancelAll()` no los veía. Fix: barrer explícitamente los IDs 1-100 con
  `invoke("plugin:notification|cancel", { notifications: range })` al inicio
  de `schedule()`. Quien actualice de <0.7.4 va a tener un primer arranque
  con `schedule()` que limpia las legacy y queda con un set sano.

## [0.7.3] - 2026-05-29

### Fixed
- **Spam de notificaciones (Android) — fix raíz #2**. La 0.7.2 cambió el
  `sendNotification` JS por `invoke("plugin:notification|notify", ...)`
  directo, lo cual sí llegaba al plugin Rust. Pero el `Schedule.interval(...)`
  / `Schedule.at(...)` del JS devuelven `{at, interval, every}` con dos de
  los campos en `undefined`. El bridge IPC de Tauri convierte esos
  `undefined` en `null`, y el deserializer de serde para el enum
  externally-tagged `Schedule` rechaza el payload (porque ve más de una
  variante "presente"). Resultado: `schedule` quedaba en `None` y el plugin
  Android lo trataba como **notificación instantánea** — el mismo síntoma
  spam que en 0.7.0/0.7.1/0.7.2 pero por otra razón.
- Fix: filtrar las claves nullish del objeto `schedule` antes de invocar
  (`Object.fromEntries(Object.entries(s).filter(([, v]) => v != null))`).
  Diagnóstico vía agente de research sobre el plugin Rust.

## [0.7.2] - 2026-05-29

### Fixed
- **Spam de notificaciones (Android)** — el plugin `@tauri-apps/plugin-notification`
  v2.3.3 implementa la función JS `sendNotification(...)` con `new
  window.Notification(...)` del browser, que **ignora el campo `schedule`** y
  dispara la notificación al instante. Cada vez que el effect del hook
  `useComprasNotifications` re-corría (sync de realtime, cambio de inventario,
  etc.), se mostraban 4 + N notificaciones de golpe. Pensábamos que el cambio
  de `Schedule.at` → `Schedule.interval` lo había arreglado en 0.7.0, pero el
  problema raíz era otro: la función JS nunca llegaba al plugin Rust.
- Fix: invocar `invoke("plugin:notification|notify", { options })` directamente,
  que sí pasa por `Notification.kt` → `AlarmManager.setExact(...)` con el
  `nextTrigger` calculado del `DateMatch`. Aplicado a las 3 llamadas
  (horarios de comida, alertas de vencimiento, "Notificaciones activadas").

### Added
- **Sugerencias anti-desperdicio "Te conviene cocinar"** — feature #1 de Fase C:
  cuando hay lotes en inventario que vencen dentro de los próximos 5 días,
  sugiere recetas propias (sin IA, pura lógica) que usen esos ingredientes,
  rankeadas por cobertura (qué % de la receta se cubre con lo por vencer) y
  urgencia. Se muestra como banner ámbar arriba del Dashboard Inicio (desktop),
  como sección al tope del listado de Recetas (mobile), y se incluye en el
  cuerpo de las notificaciones de vencimiento ("Podés cocinar X").

## [0.7.1] - 2026-05-28

### Added
- Compras dashboard "Te conviene cocinar": sugiere recetas propias que usan
  ingredientes con lotes por vencer (sin IA, pura lógica). Disponible en el
  Dashboard de desktop, en la pestaña Recetas del celular, y en el cuerpo de
  las notificaciones de vencimiento.

### Fixed
- **Android — permisos de notificación**: workaround root-cause del bug del
  plugin `@tauri-apps/plugin-notification` v2.3.3 (su `requestPermissionsLauncher`
  se inicializa tarde y rompe). `MainActivity.kt` ahora registra su propio
  `ActivityResultLauncher` antes de `super.onCreate`, auto-pide permiso en el
  primer arranque (Android 13+), y expone `requestNotificationsOrOpenSettings()`
  para reintentos con fallback a `Settings.ACTION_APP_NOTIFICATION_SETTINGS`.
  JS lo invoca vía un comando Rust nuevo (`request_or_open_notification_settings`,
  usa `jni` + `ndk-context`).

### Changed
- Pase de pulido UI del módulo Compras: pills con color saturado, tabs como
  segmented control, cards del Dashboard Inicio clickeables (Plan, Lista, Por
  vencer, Inventario), cada una con su tono propio.

## [0.7.0] - 2026-05-27

### Added
- **Compras Fase B — notificaciones push**:
  - Recordatorio diario "¿qué vas a comer?" en cada horario de comida (desayuno,
    almuerzo, merienda, cena) configurable desde Ajustes.
  - Alerta de vencimiento por lote con `expiryWarnDays` de antelación.
- Ajustes sincronizados (`compras_settings`): cotización DKK por USD, horarios
  de comida, días de antelación, on/off de notificaciones. La pantalla de
  Ajustes solo está en desktop — el celu es view+entry.

### Fixed
- Spam de notificaciones diario: `Schedule.at(date, repeating=true)` no se
  comporta como "daily at HH:MM" en Android. Cambiado a
  `Schedule.interval({ hour, minute, second: 0 }, true)`, que dispara una vez
  por día a la hora exacta. Cancelación con `cancelAll()` antes de reprogramar.

## [0.6.0] - 2026-05-26

### Added
- Dashboard Inicio del módulo Compras con 4 cards (Plan, Lista, Por vencer,
  Inventario), de un pantallazo lo de la semana.
- Mobile parity completa: carga de ítems por ingrediente+presentación (no más
  texto libre), tildar comprado suma al stock, recetas paso a paso, registrar
  "Comí esto" con porciones hechas/comidas + slot.

## [0.5.0] - 2026-05-20

### Added
- **Compras Fase A — manual end-to-end**:
  - Ingredientes con dimensión (peso/volumen/conteo) + varias presentaciones
    (tamaño, etiqueta, precio en kr).
  - Recetas con porciones, tipo (desayuno/merienda o almuerzo/cena), ingredientes
    con cantidades en unidad base, pasos ordenados.
  - Lista de la compra mejorada (FAB + quick-add desde ingredientes guardados),
    listas guardadas reutilizables.
  - Plan semanal por pool de porciones objetivo.
  - Inventario por **lotes** (cada compra es un lote con su vencimiento).
  - Registro de comidas con descuento FIFO del inventario por vencimiento.
- Cálculo de menor desperdicio al armar la lista desde recetas o plan.
- Conversión a USD desde DKK (cotización manual en localStorage).

## [0.4.0] - 2026-05-13

### Added
- Lista de la compra básica en Android (`shopping_items`), offline-first.

## [0.3.0] - 2026-05-06

### Added
- Módulo Budget en desktop: categorías, gastos con recurrencia, presupuestos
  mensuales, metas de ahorro con contribuciones por mes, ingresos.

## [0.2.0] - 2026-04-22

### Added
- Hábitos (`isHabit` en tareas + tabla `habit_logs`), vista Recurring.
- Drag-and-drop entre días, tildar tarea pregunta "cuánto tardaste".

## [0.1.0] - 2026-04-01

### Added
- Primera versión: calendario con vistas Día/Semana/Mes/Proyecto, tareas con
  prioridad/proyecto/categoría/duración/recurrencia/notas/subtareas, sync
  offline-first (SQLite local + outbox + Supabase realtime), autenticación
  email + magic link.
