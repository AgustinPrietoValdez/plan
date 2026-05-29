# Instalar Plan

Plan es una app de escritorio para Windows. Esta guía te lleva paso a paso desde la descarga hasta tu primera tarea.

## 1. Descargar

Pedile a quien te mandó la app **el archivo `Plan_0.1.0_x64-setup.exe`** (o un link para bajarlo desde Drive / OneDrive / Dropbox / WhatsApp). Pesa unos 10–15 MB.

## 2. Instalar

1. Doble click en `Plan_0.1.0_x64-setup.exe`.
2. **Windows va a mostrar una pantalla azul** que dice *"Windows protegió tu PC"* (Microsoft Defender SmartScreen). Esto pasa porque el instalador no está firmado por una empresa registrada — es normal en apps personales.
   - Click en **"Más información"**.
   - Después click en **"Ejecutar de todas formas"**.
3. Seguí los pasos del instalador. Por defecto se instala en `C:\Program Files\Plan\`.
4. Plan aparece en el menú de inicio. Buscá "Plan" para abrirlo.

> Si el instalador te dice que falta **WebView2**, te lo descarga e instala automáticamente. Es un componente de Microsoft Edge, lo más probable es que ya lo tengas si estás en Windows 10 actualizado o Windows 11.

## 3. Crear cuenta

Al abrir Plan vas a ver una pantalla con tabs **Sign in / Sign up**.

1. Click en **Sign up**.
2. Poné tu email y una contraseña (mínimo 6 caracteres).
3. Click en **"Create account"**.
4. **Si te pide confirmar el email**, abrí tu casilla y hacé click en el link que te llegó. Después volvé a Plan y poné las credenciales en **Sign in**.

(Alternativa: tocá **"Send magic link"** abajo de todo — te llega un mail con un link que te loguea sin password.)

## 4. Primer uso

Plan crea automáticamente **7 categorías por default** (Design, Engineering, Marketing, Personal, Admin, Health, Learning). Podés renombrarlas, cambiarles el color o agregar nuevas desde el `+` al lado del header "Categories" en el sidebar.

### Atajos de teclado

| Tecla | Acción |
|-------|--------|
| `N` | Nueva tarea |
| `T` | Ir a hoy |
| `1` / `2` / `3` | Vista Día / Semana / Mes |
| `4` | Vista Proyecto |
| `5` | Vista Recurring (tareas que se repiten) |
| `Ctrl + ←` / `Ctrl + →` | Período anterior / siguiente |
| `Esc` | Cerrar modal |

### Cosas que podés hacer

- **Arrastrar tareas** del inbox al calendario y entre días para reagendarlas
- **Drop en el strip del inbox** para sacar una tarea del calendario
- **Click en el checkbox** de una tarea → te pregunta cuánto tardaste realmente (Faster / On estimate / Slower o custom)
- **Click en una tarea** → editor para cambiar título, proyecto, categoría, prioridad, duración, recurrencia, notas, subtareas
- **Toggle "Repeats"** en el editor → daily / weekly (con días específicos) / monthly (día del mes). Cuando completás una tarea recurring, la próxima ocurrencia se crea automáticamente
- **Vista Project (`4`)** → click en un proyecto del sidebar para ver todas sus tareas agrupadas por estado
- **Vista Recurring (`5`)** → todas tus tareas que se repiten en un solo lugar, con opción de pausar la cadena

## 5. Sincronización

Plan funciona **offline**. Lo que escribas se guarda localmente al instante. Cuando hay internet, sincroniza con el servidor automáticamente.

- **Punto verde** abajo del sidebar (al lado de tu email) = todo sincronizado
- **Punto indigo pulsando** = sincronizando
- **Punto gris** = sin internet (los cambios quedan en cola)
- **Punto rojo** = error de sync (probá refrescar)

Si abrís Plan en otra computadora con la misma cuenta, **vas a ver los mismos datos** y los cambios aparecen en tiempo real entre dispositivos.

## 6. Cerrar sesión

Click en **"Sign out"** abajo del sidebar.

---

## Si algo falla

- **No abre / pantalla blanca**: cerrá la app, esperá 5 seg, abrila de nuevo. Si persiste, desinstalá desde Panel de Control y reinstalá.
- **No me deja crear cuenta / loguearme**: necesitás internet la primera vez.
- **Veo tareas que no son mías**: cerrá sesión y volvé a entrar con tu cuenta.
- **Otra cosa rara**: pasame screenshot a quien te mandó la app.

## Privacidad

- Tus tareas se guardan en tu computadora (SQLite local) y en un servidor en la nube (Supabase) **scoped a tu cuenta** — solo vos podés leer tus datos.
- No hay tracking, analytics ni publicidad.
