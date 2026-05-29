# Changelog

All notable changes to **Plan** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
