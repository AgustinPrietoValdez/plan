# Plan app - USER

Lo que necesito saber para operar mi app Plan en el dia a dia.

## Dia a dia: que falta arreglar

Cada problema/pendiente tiene su issue en GitHub (`AgustinPrietoValdez/plan`). Esta tabla es el
espejo; la fuente de verdad es el issue.

Proyecto **Type = Product**: yo diseño y decido, Claude implementa todo. Mi trabajo en esta
tabla es priorizar y dar el diseño; el codigo lo hace Claude cuando se lo pido.

| Issue | Problema | Estado | Que me toca a mi |
|-------|----------|--------|------------------|
| [#1](https://github.com/AgustinPrietoValdez/plan/issues/1) | Pantalla Automatizaciones: implementar MVP (spec en `AUTOMATIONS_FEATURE_PLAN.md`) | ABIERTO | Aprobar el diseño de la spec y decir "dale" |
| [#2](https://github.com/AgustinPrietoValdez/plan/issues/2) | `plan_cli.py` vivia en cargo_bot_ws | CERRADO 2026-06-06 | Nada (movido a `tools/` de este repo; queda el riesgo menor de duplicar `taskToWire`, se testea si pega) |
| [#3](https://github.com/AgustinPrietoValdez/plan/issues/3) | Escribir desde el CLI sin cerrar la app | IMPLEMENTADO, falta verificar | Rebuild (`npm run tauri dev`), probar `plan_cli.py check` con la app abierta, y si anda cerrar el issue con comentario |

## Como marcar un issue como resuelto (asi Claude se entera)

1. Cerrar el issue **con un comentario corto de como quedo**:
   ```powershell
   gh issue close <N> -R AgustinPrietoValdez/plan -c "Resuelto: <que hiciste>"
   ```
   (o desde la web: comentar + Close issue)
2. **No toques la tabla de arriba**: Claude la sincroniza. Al "levantar" el proyecto (o el dia),
   Claude corre `gh issue list -R AgustinPrietoValdez/plan --state all` y actualiza esta tabla
   y su `AI.md` con lo que cambio. El comentario de cierre es lo que le cuenta el COMO.
3. Problema nuevo: crealo vos (`gh issue create -R AgustinPrietoValdez/plan -t "..." -b "..."`)
   o pedile a Claude; despues entra a la tabla en la proxima sincronizacion.

## Comandos rapidos (tareas desde la terminal)

CLI multi-proyecto: `C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py`

```powershell
# Board del dia (todos los proyectos, solo titulos)
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py show --today

# Todas las pendientes / un proyecto puntual
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py show
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py show -p CARGO_BOT

# Detalle de una tarea (subtareas + notas)
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py task "tuning"

# Marcar progreso
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py check "tuning" 0
python C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py complete "tuning"
```

Scripts de import/automatizacion (job-search): `C:\Users\agusp\job-search\plan-import\`
(`read_tasks.py` es solo lectura; el resto escribe).

## Reglas de oro

1. **Ya NO hace falta cerrar la app para escribir desde el CLI** (desde 2026-06-06, issue #3):
   el CLI espera el lock (`busy_timeout`) y la app detecta cambios externos
   (`PRAGMA data_version`) y refetchea la UI + drena el outbox sola en ~3s.
   ⚠️ Vale recien con la app REBUILDEADA (`npm run tauri dev`); con un build viejo,
   seguir cerrandola. Los scripts de `plan-import/` viejos siguen pidiendo app cerrada
   hasta que se les agregue busy_timeout.
2. Los scripts que escriben hacen backup primero y replican el patron outbox (la app
   sincroniza como si lo hubiera tocado yo).
3. Notas y subtareas en ASCII (sin tildes ni guiones largos).

## Frases que entiende Claude

- **"levanta el dia"** -> resumen de las tareas de HOY de todos los proyectos, solo titulos.
- **"levanta <proyecto>"** -> arranque de ese proyecto (lee su guia de Obsidian + su AI.md).

## Donde vive cada cosa

| Cosa | Path |
|------|------|
| App (source) | `C:\Users\agusp\Documentos\Organization_App\calendar-app` |
| DB | `%APPDATA%\com.agusp.calendarapp\calendar.db` |
| CLI de tareas | `C:\Users\agusp\Documentos\Organization_App\calendar-app\tools\plan_cli.py` |
| Scripts import | `C:\Users\agusp\job-search\plan-import\` |
| Guia Obsidian | `Documentos\Notas\Guides\Plan_app_guide.md` |
| Notas de Claude | `AI.md` (junto a este archivo, no va a git) |
