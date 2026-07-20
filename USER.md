# Plan app - USER

Lo que necesito saber para operar mi app Plan en el dia a dia.

## Dia a dia: que falta arreglar

Cada problema/pendiente tiene su issue en GitHub (`AgustinPrietoValdez/plan`). Esta tabla es el
espejo; la fuente de verdad es el issue.

Proyecto **Type = Product**: yo diseño y decido, Claude implementa todo. Mi trabajo en esta
tabla es priorizar y dar el diseño; el codigo lo hace Claude cuando se lo pido.

| Issue | Problema | Estado | Que me toca a mi |
|-------|----------|--------|------------------|
| [#1](https://github.com/AgustinPrietoValdez/plan/issues/1) | Pantalla Automatizaciones: implementar MVP (spec en `AUTOMATIONS_FEATURE_PLAN.md`) | CERRADO 2026-06-10 | Nada (AutomationsView + tabla `automations`, migration 0020; commit en main) |
| [#2](https://github.com/AgustinPrietoValdez/plan/issues/2) | `plan_cli.py` vivia en cargo_bot_ws | CERRADO 2026-06-06 | Nada (movido a `tools/` de este repo; queda el riesgo menor de duplicar `taskToWire`, se testea si pega) |
| [#3](https://github.com/AgustinPrietoValdez/plan/issues/3) | Escribir desde el CLI sin cerrar la app | CERRADO 2026-06-06 | Nada (CLI con busy_timeout + app detecta data_version y refetchea sola) |
| [#4](https://github.com/AgustinPrietoValdez/plan/issues/4) | Habitos no se atrasan: un dia saltado lapsa, no queda leftover rojo | CERRADO 2026-06-09 | Nada (commit 35cc7e5) |
| [#5](https://github.com/AgustinPrietoValdez/plan/issues/5) | Fase 1 implementada: Home dashboard + navegacion por areas | CERRADO 2026-06-10 | Nada (aprobado y verificado en vivo; commit c379243) |
| [#6](https://github.com/AgustinPrietoValdez/plan/issues/6) | Fase 2a: Eventos (CalendarEvent) | CERRADO 2026-06-10 | Nada (verificado y aprobado; commit 5a86aaf) |
| [#7](https://github.com/AgustinPrietoValdez/plan/issues/7) | Fase 3: Presupuesto - rediseno layout, gastos inline, ahorros por % | CERRADO 2026-06-10 | Nada (verificado y aprobado; commit 3973db4) |
| [#8](https://github.com/AgustinPrietoValdez/plan/issues/8) | Fase 4: Compras - default lista, generacion semanal, categorias ingredientes | CERRADO 2026-06-10 | Nada (tab inicio eliminado + categorias de ingredientes; recetas genericas DIFERIDO) |
| [#9](https://github.com/AgustinPrietoValdez/plan/issues/9) | Telemetria cafe: sincronizar brew_datapoints phone->compu + rebuild desktop | CERRADO 2026-07-04 | Nada |
| [#10](https://github.com/AgustinPrietoValdez/plan/issues/10) | Cafe 6c: ranking/review de granos | CERRADO 2026-07-05 | Nada |
| [#11](https://github.com/AgustinPrietoValdez/plan/issues/11) | Fase 7: Asistente de Cafe (Claude grounded + perfil + recomendaciones) | ABIERTO | Arquitectura ya decidida (corre en terminal, no API); prereq 6c ya cerrado. Falta arrancar 7a: armar la GUIA viva. Decir "dale" cuando quieras que empiece |
| [#12](https://github.com/AgustinPrietoValdez/plan/issues/12) | Notificaciones: avisos nativos para Eventos con hora (desktop + Android) | CERRADO 2026-07-04 | Nada |
| [#13](https://github.com/AgustinPrietoValdez/plan/issues/13) | Tracker de Proyectos: entidad con hitos/estado + scaffolding de guia Obsidian al crear | CERRADO 2026-07-04 | Nada |
| [#14](https://github.com/AgustinPrietoValdez/plan/issues/14) | Recetas genericas: slot de ingrediente por categoria (Compras/lista) | CERRADO 2026-07-04 | Nada |
| [#15](https://github.com/AgustinPrietoValdez/plan/issues/15)-[#17](https://github.com/AgustinPrietoValdez/plan/issues/17) | Brew: rediseno pantalla + dosis + flows raros | CERRADO 2026-06-16 | Nada |
| [#18](https://github.com/AgustinPrietoValdez/plan/issues/18) | Brew Historial: receta aparece DOBLE | CERRADO 2026-07-04 | Nada |
| [#19](https://github.com/AgustinPrietoValdez/plan/issues/19) | Home: card de Cafe muestra granos terminados | CERRADO 2026-07-04 | Nada |
| [#20](https://github.com/AgustinPrietoValdez/plan/issues/20) | Plan semanal/Listas: no se ven en el celu | CERRADO 2026-07-04 | Nada |
| [#22](https://github.com/AgustinPrietoValdez/plan/issues/22) | Manejo de errores: mutaciones fire-and-forget sin feedback visible en el resto de la app | CERRADO 2026-07-12 | Nada (commit f1bd659) |
| [#23](https://github.com/AgustinPrietoValdez/plan/issues/23) | Bugs del barrido general (Finanzas/Compras/Cafe): 8 casos, afectan logica financiera/stock | ABIERTO | **Revisar los 8 casos y decidir** cuales priorizar/como resolver cada uno (son decisiones de producto) |
| [#24](https://github.com/AgustinPrietoValdez/plan/issues/24) | Pi brew capture: brews no aparecen en la app (sospecha: sesion de Supabase muerta en el Pi) | ABIERTO | **Verificar en el Pi real** (journalctl, session.json, si hace falta `python login.py` de nuevo) - el fix de logging de este commit es solo observabilidad, no repara la sesion muerta si ya esta muerta |

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

Scripts de import/automatizacion (job-search): `C:\Users\agusp\Documentos\job-search\plan-import\`
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
| Scripts import | `C:\Users\agusp\Documentos\job-search\plan-import\` |
| Guia Obsidian | `Documentos\Notas\Guides\Plan_app_guide.md` |
| Notas de Claude | `AI.md` (junto a este archivo, no va a git) |
