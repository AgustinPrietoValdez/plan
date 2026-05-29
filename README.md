# Plan

> Tu organización personal: calendario + tareas + hábitos + finanzas + planificación de comidas anti-desperdicio. **Offline-first**, sincronización en tiempo real, desktop (Windows) y mobile (Android).

Plan es una app que junta en un solo lugar lo que normalmente vive disperso entre tu calendario, tu lista del súper, tu app de gastos y un cuaderno. Funciona sin conexión y sincroniza cuando vuelve internet.

## Features

- **Calendario** — vistas Día / Semana / Mes / Proyecto / Recurring, drag-and-drop entre días, atajos de teclado.
- **Tareas** — proyectos, categorías, prioridad, duración estimada y real ("cuánto tardaste?"), recurrencia (diaria / semanal / mensual), subtareas, notas.
- **Hábitos** — tareas marcadas como hábito acumulan rachas en una vista propia.
- **Finanzas** — gastos con recurrencia + categorías + presupuestos mensuales, metas de ahorro con contribuciones, ingresos.
- **Compras + planificación de comidas** — el módulo más nuevo:
  - **Ingredientes** con varias presentaciones (1 L, 2 L, etc.) y precios.
  - **Recetas** con ingredientes, pasos ordenados y porciones.
  - **Lista de la compra** que elige automáticamente la combinación de presentaciones con menor desperdicio.
  - **Plan semanal** por pool de comidas.
  - **Inventario por lotes** con vencimientos. Cada compra es un lote; las recetas descuentan FIFO por urgencia.
  - **Sugerencias anti-desperdicio**: "Te conviene cocinar X" cuando hay lotes por vencer, con el ingrediente sugerido también incluido en la notificación de vencimiento.
  - **Notificaciones push** en el celu: vencimientos + recordatorios de horarios de comida (Android, fix raíz del bug del plugin v2.3.3).
- **Offline-first** — todo se guarda local instantáneamente, sincroniza en background, funciona sin internet.
- **Sync en tiempo real** — abrí la app en otra compu o en el celu y los cambios aparecen al instante.

## Descargar

La última release de Windows y Android está en la página de [Releases](../../releases/latest).

- Windows: `Plan_X.Y.Z_x64-setup.exe` (NSIS, ~10 MB).
- Android: `Plan-X.Y.Z-android.apk` (debug build firmado con el debug keystore por ahora).

Guía de instalación paso a paso en [INSTALL.md](INSTALL.md).

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| Estado | Zustand (UI) + TanStack Query (server cache) |
| Estilos | CSS modules (sin Tailwind) |
| Desktop | Tauri 2 (Rust + WebView2) |
| Mobile | Tauri 2 Android |
| Local DB | SQLite vía `tauri-plugin-sql` |
| Backend | Supabase (Postgres + RLS + Realtime + Auth) |
| Notificaciones | `tauri-plugin-notification` v2.3.3 + workaround Android (ver abajo) |
| Drag & drop | `@dnd-kit` |

## Buildear desde el código

### Requisitos

- Node 20+
- Rust toolchain (`rustup install stable`)
- Windows: WebView2 (incluido en Windows 11; el instalador lo baja si falta)
- Android (opcional): JDK 21, Android SDK + NDK r28+, `ANDROID_HOME` y `NDK_HOME` configurados

### Setup

```bash
git clone https://github.com/<user>/plan.git
cd plan
npm install
cp .env.example .env.local   # llenar SUPABASE_URL + SUPABASE_ANON_KEY
```

Necesitás un proyecto Supabase propio. Crear uno en [supabase.com](https://supabase.com), copiar la URL y el anon key al `.env.local`, y correr las migraciones:

```bash
# por cada archivo en supabase/migrations/, en orden:
SUPABASE_PROJECT_REF=<tu-project-ref> \
SUPABASE_ACCESS_TOKEN=sbp_xxx \
node scripts/run-migration.mjs supabase/migrations/0001_initial.sql
```

(Se ejecutan en orden 0001 → 0015. El PAT lo generás en https://supabase.com/dashboard/account/tokens, revocá después de usar.)

### Correr en dev

```bash
npm run tauri dev
```

El primer build de Rust tarda ~10 min; los siguientes ~30 s.

### Build de release

```bash
# Desktop (Windows)
npm run tauri build
# binarios en src-tauri/target/release/bundle/{nsis,msi}/

# Android
npx tauri android build --apk --debug --target aarch64
# binario en src-tauri/gen/android/app/build/outputs/apk/universal/debug/
```

### Type check

```bash
npx tsc --noEmit
```

## Arquitectura

### Offline-first

Cada entidad sigue el mismo patrón:

1. **Repo local** (`src/lib/repo/local.ts`) — wrapper sobre la conexión SQLite.
2. **Outbox** — cambios locales se encolan en una tabla aparte hasta que se sincronizan al server.
3. **Sync loop** (`src/lib/sync.ts`) — pull de cambios remotos por `updated_at > last_pulled`, push del outbox.
4. **Realtime** (`src/lib/realtime.ts`) — suscripción Supabase Realtime; cambios remotos llegan en vivo y se mergean.
5. **TanStack Query hooks** (`src/lib/queries.ts`) — UI lee de acá; invalida cuando cambia la DB local.

Schema y RLS en `supabase/migrations/`. Migraciones SQLite en `src-tauri/migrations/`. Las dos se mantienen sincronizadas (Postgres ↔ SQLite, bool → INTEGER, JSON → TEXT, etc.).

### Fix Android notifications

El plugin `@tauri-apps/plugin-notification` v2.3.3 tiene un bug: su `requestPermissionsLauncher` se inicializa después de que la activity esté en estado RESUMED, lo cual viola la regla de `registerForActivityResult` y hace que `requestPermission()` falle. El fix está en [`src-tauri/gen/android/app/src/main/java/com/agusp/calendarapp/MainActivity.kt`](src-tauri/gen/android/app/src/main/java/com/agusp/calendarapp/MainActivity.kt): registramos nuestro propio `ActivityResultLauncher` antes de `super.onCreate`, exponemos `requestNotificationsOrOpenSettings()` y lo llamamos desde Rust vía JNI (`request_or_open_notification_settings` en `src-tauri/src/lib.rs`).

## Roadmap

Estado actual: **v0.7.5** — Compras Fase A + B + sugerencias anti-desperdicio. Spam de notificaciones Android arreglado (sweep de las legacy del 0.7.0 que registraban `setRepeating` con interval chiquito). Pendiente: las notificaciones legítimas todavía no se programan en el `AlarmManager` después del sweep — debugging requiere build especial con WebView debugging habilitado.

Próximos hitos (Fase C, ver [CHANGELOG.md](CHANGELOG.md) para el histórico):
- [ ] Cotización USD/DKK en vivo (en vez de manual).
- [ ] Tickets de supermercado (OCR de precios desde foto).
- [ ] Scraping de ofertas de supermercados + alertas.
- [ ] IA: plan semanal automático anti-desperdicio.
- [ ] IA: generación de recetas nuevas.
- [ ] CI/CD: GitHub Actions para builds de release automáticos (desktop + Android).
- [ ] Firma del APK release con keystore propio (hoy solo debug-signed).

## Plataformas

- **Windows desktop** — primario, donde vive toda la administración (cargar ingredientes, armar recetas, ajustes).
- **Android** — secundario, viewer + entry only. El celu carga tareas, tilda la lista, sigue recetas paso a paso, registra comidas, recibe notificaciones. No tiene pantalla de Ajustes — todo se setea en la compu y sincroniza.
- **iOS** — no prioritario por ahora.

## Licencia

[MIT](LICENSE) — uso libre, sin garantías.
