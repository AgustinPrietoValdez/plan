# Feature Plan — Pantalla "Automatizaciones" (local-only)

> Estado: **PLAN (sin código todavía)**. Decidido 2026-05-31. Sync: **local-only** (no Supabase).
> Objetivo: una pantalla nueva donde el usuario define/lista **automatizaciones** (opcionalmente por
> proyecto) — ej. "buscar mails" — para más adelante poder ejecutarlas. MVP = definir/listar/editar;
> la **ejecución** se cablea en una fase posterior.

## Contexto / decisiones
- **Local-only:** se guarda solo en SQLite (`calendar.db`), NO se sincroniza a Supabase ni a otros
  dispositivos. Implicación clave en el repo: los métodos de Automation **NO** llaman a `enqueue(...)`
  (a diferencia de tasks/projects/categories). Así nunca tocan el outbox ni el sync.
- **App compilada:** para ver la pantalla hay que rebuildear (`npm run tauri dev` para probar, o
  `npm run tauri build` + reinstalar). No alcanza con guardar archivos.

## 1) Modelo de datos
Nueva entidad (diseñada para soportar la ejecución futura sin otra migración):
```ts
// types/index.ts
export interface Automation {
  id: string;
  projectId: string | null;        // null = global (no atada a un proyecto)
  name: string;
  kind: string;                    // "email-search" | "custom" | ... (extensible)
  config: Record<string, unknown>; // params JSON (guardado como TEXT)
  trigger: "manual" | "scheduled"; // para la fase de ejecución; default "manual"
  schedule: string | null;         // cron/desc para "scheduled" (fase futura)
  enabled: boolean;
  notes: string;
  lastRunAt: string | null;        // se setea cuando se ejecute (fase futura)
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;                 // se mantiene por consistencia aunque sea local-only
}
```

## 2) Migración SQLite
Crear `src-tauri/migrations/0014_automations.sql`:
```sql
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  config TEXT NOT NULL DEFAULT '{}',
  trigger TEXT NOT NULL DEFAULT 'manual',
  schedule TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS automations_user_idx ON automations(user_id);
```
Registrar en `src-tauri/src/lib.rs` (vec `migrations`, después de la 0013):
```rust
Migration { version: 14, description: "automations",
            sql: include_str!("../migrations/0014_automations.sql"), kind: MigrationKind::Up },
```

## 3) Repo (local-only — SIN enqueue)
- `lib/repo/types.ts`: agregar `AutomationCreate` y al interface `Repo` los métodos
  `listAutomations`, `createAutomation`, `patchAutomation`, `deleteAutomation`.
- `lib/repo/local.ts`: implementar siguiendo el patrón de **categories** (ver `createCategory`/
  `patchCategory`/`deleteCategory`, líneas ~401-468) PERO **sin** la llamada `enqueue(...)`.
  Agregar `interface DbAutomationRow` + `fromDbAutomation` (parsear `config` con `parseJson`,
  booleans con `boolFromDb`). Usar `requireUserId()` para el `user_id`, `newId()`, `now()`.
  `deleteAutomation` = soft-delete (set `deleted_at`), igual que el resto, sin enqueue.
- NO agregar "automations" a la lista de entidades de `enqueue()` ni a `sync.ts` (queda fuera del sync).

## 4) Queries (TanStack Query)
En `lib/queries.ts`, siguiendo el patrón existente:
- `useAutomations()` → `useQuery({ queryKey: ["automations"], queryFn: () => repo.listAutomations() })`.
- `useCreateAutomation()`, `usePatchAutomation()`, `useDeleteAutomation()` → `useMutation` que
  invalidan `["automations"]` en `onSuccess`.

## 5) Store / navegación
- `lib/store.ts`: agregar `"automations"` al union `View`.
- `components/Sidebar.tsx`: nuevo `nav-item` (ej. después de "Compras") con un icono (agregar uno a
  `components/icons.tsx`, ej. `IBolt`/`IZap`) y `onClick={() => setView("automations")}` +
  `className={view === "automations" ? "active" : ""}`.
- `App.tsx`: `import { AutomationsView }` y agregar `{view === "automations" && <AutomationsView />}`
  junto a los otros. (No agregar a `isTaskView` — no usa el inbox strip.) Opcional: shortcut tecla "8".

## 6) Vista nueva `components/AutomationsView.tsx`
Vista full (estilo `BudgetView`/`HabitsView`), con:
- Header + botón "Nueva automatización".
- Lista de automatizaciones (de `useAutomations`), opcionalmente agrupadas/filtradas por proyecto
  (reusar `projects` de `useProjects`; mostrar el nombre del proyecto o "Global").
- Por fila: nombre, `kind` (badge), proyecto, **toggle enabled** (patchAutomation), botones editar/borrar.
- Editor inline o modal (estilo `ProjectManager`/`CategoryManager`) con campos: name, project (select),
  kind (select con presets `email-search`/`custom` + libre), config (textarea JSON con validación),
  trigger (manual/scheduled), schedule (si scheduled), enabled, notes.
- Estado vacío: explica qué es una automatización + CTA.

## 7) Build / verificación
- Dev: `cd calendar-app && npm run tauri dev` → abre ventana de prueba; navegar a Automatizaciones,
  crear/editar/borrar, cerrar y reabrir para confirmar que persiste (SQLite local).
- Prod: `npm run tauri build` + reinstalar el `.exe`/instalador.
- Verificar el dato directo: `SELECT * FROM automations` en `%APPDATA%/com.agusp.calendarapp/calendar.db`.

## 8) Fase futura — EJECUCIÓN (fuera de este MVP)
Cuando se quiera que las automatizaciones HAGAN algo:
- Un agente/script local lee `automations WHERE enabled=1` (y por `kind`) y ejecuta la lógica.
  Ej. `kind="email-search"`: usar el conector Gmail (MCP) o un script para buscar mails según `config`
  (query, etiquetas, etc.) y reportar. Encaja con la base on-demand del job-search
  (`job-search/plan-import/` + preferencia "local, sin nube").
- `trigger="scheduled"` + `schedule`: dispararlas desde la base on-demand o un launcher local
  (NO en la nube — preferencia del usuario). `lastRunAt` registra la última corrida.
- Per-project: filtrar por `projectId` para correr solo las de un proyecto.

## Resumen de archivos a tocar (al ejecutar)
NUEVOS: `src-tauri/migrations/0014_automations.sql`, `src/components/AutomationsView.tsx`.
EDITAR: `src-tauri/src/lib.rs`, `src/types/index.ts`, `src/lib/repo/types.ts`, `src/lib/repo/local.ts`,
`src/lib/queries.ts`, `src/lib/store.ts`, `src/components/Sidebar.tsx`, `src/components/icons.tsx`, `src/App.tsx`.
