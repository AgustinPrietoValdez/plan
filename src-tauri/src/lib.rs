use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

// ── Android JVM globals (set once in setup, then safe to use from any thread) ─

// JavaVM is Send + Sync; safe in OnceLock static.
#[cfg(target_os = "android")]
static ANDROID_JVM: OnceLock<jni::JavaVM> = OnceLock::new();

// GlobalRef is Send but !Sync; Mutex<GlobalRef> is Sync since GlobalRef: Send.
// We only ever read the ref (never mutate GlobalRef itself), so locking is just
// to satisfy the type system — it's never contended.
#[cfg(target_os = "android")]
static ANDROID_ACT: OnceLock<Mutex<jni::objects::GlobalRef>> = OnceLock::new();

// ── Android JNI helpers ──────────────────────────────────────────────────────

#[cfg(target_os = "android")]
fn jni_void(method: &str) -> Result<(), String> {
    use jni::objects::JValue;
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    env.call_method(&*act, method, "()V", &[] as &[JValue])
        .map_err(|e| format!("{method}: {e}"))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn jni_bool(method: &str) -> Result<bool, String> {
    use jni::objects::JValue;
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    env.call_method(&*act, method, "()Z", &[] as &[JValue])
        .map_err(|e| format!("{method}: {e}"))
        .map(|r| r.z().unwrap_or(false))
}

#[cfg(target_os = "android")]
fn jni_int(method: &str) -> Result<i32, String> {
    use jni::objects::JValue;
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    env.call_method(&*act, method, "()I", &[] as &[JValue])
        .map_err(|e| format!("{method}: {e}"))
        .map(|r| r.i().unwrap_or(-1))
}

#[cfg(target_os = "android")]
fn jni_str(method: &str) -> Result<String, String> {
    use jni::objects::{JString, JValue};
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    let result = env
        .call_method(&*act, method, "()Ljava/lang/String;", &[] as &[JValue])
        .map_err(|e| format!("{method}: {e}"))?;
    let jobj = result.l().map_err(|e| format!("{e}"))?;
    if jobj.is_null() {
        return Ok(String::new());
    }
    let jstr: JString = jobj.into();
    let s = env.get_string(&jstr).map_err(|e| format!("{e}"))?;
    Ok(s.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
fn jni_bool_s(method: &str, arg: &str) -> Result<bool, String> {
    use jni::objects::JValue;
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    let jarg = env.new_string(arg).map_err(|e| format!("{e}"))?;
    env.call_method(&*act, method, "(Ljava/lang/String;)Z", &[JValue::Object(&jarg)])
        .map_err(|e| format!("{method}: {e}"))
        .map(|r| r.z().unwrap_or(false))
}

#[cfg(target_os = "android")]
fn jni_bool_ss(method: &str, arg1: &str, arg2: &str) -> Result<bool, String> {
    use jni::objects::JValue;
    let vm = ANDROID_JVM.get().ok_or("JVM not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| format!("{e}"))?;
    let act = ANDROID_ACT.get().ok_or("Activity not initialized")?.lock().unwrap();
    let jarg1 = env.new_string(arg1).map_err(|e| format!("{e}"))?;
    let jarg2 = env.new_string(arg2).map_err(|e| format!("{e}"))?;
    env.call_method(
        &*act,
        method,
        "(Ljava/lang/String;Ljava/lang/String;)Z",
        &[JValue::Object(&jarg1), JValue::Object(&jarg2)],
    )
    .map_err(|e| format!("{method}: {e}"))
    .map(|r| r.z().unwrap_or(false))
}

// ── Android JNI init ──────────────────────────────────────────────────────────
//
// We cannot use ndk_context::android_context() from tokio worker threads (panics)
// nor from Tauri's setup hook (runs on an unnamed non-JNI thread — also panics).
//
// Fix: two-step init that never touches ndk_context:
//   1. JNI_OnLoad — called by the JVM when our .so is loaded (always on main thread).
//      Stores the JavaVM.
//   2. nativeInit — called by MainActivity.onCreate (also main thread, after the VM
//      is available). Stores a GlobalRef to the Activity so helpers can call methods.

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn JNI_OnLoad(
    vm: *mut jni::sys::JavaVM,
    _reserved: *mut std::ffi::c_void,
) -> jni::sys::jint {
    if let Ok(jvm) = jni::JavaVM::from_raw(vm) {
        ANDROID_JVM.set(jvm).ok();
    }
    jni::sys::JNI_VERSION_1_6
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_agusp_calendarapp_MainActivity_nativeInit(
    _raw_env: *mut jni::sys::JNIEnv,
    raw_this: jni::sys::jobject,
) {
    if raw_this.is_null() { return; }
    let vm = match ANDROID_JVM.get() {
        Some(v) => v,
        None => return,
    };
    // attach_current_thread_permanently: if the thread is already attached (it is —
    // we're in a JNI callback), returns env without scheduling DetachCurrentThread.
    let mut env = match vm.attach_current_thread_permanently() {
        Ok(e) => e,
        Err(_) => return,
    };
    let this = jni::objects::JObject::from_raw(raw_this);
    let gref = match env.new_global_ref(&this) {
        Ok(g) => g,
        Err(_) => return,
    };
    ANDROID_ACT.set(Mutex::new(gref)).ok();
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn request_or_open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "android")]
    jni_void("requestNotificationsOrOpenSettings")?;
    Ok(())
}

#[tauri::command]
async fn schedule_event_notification(payload: String) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    return jni_bool_s("scheduleEventNotification", &payload);
    #[cfg(not(target_os = "android"))]
    {
        let _ = payload;
        Ok(false) // desktop usa el plugin de notificaciones, no la via nativa
    }
}

#[tauri::command]
async fn cancel_event_notification(id: String) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    return jni_bool_s("cancelEventNotification", &id);
    #[cfg(not(target_os = "android"))]
    {
        let _ = id;
        Ok(false)
    }
}

#[tauri::command]
async fn ble_check_permissions() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    return jni_bool("bleCheckPermissions");
    #[cfg(not(target_os = "android"))]
    Ok(true)
}

#[tauri::command]
async fn ble_request_permissions() -> Result<(), String> {
    #[cfg(target_os = "android")]
    jni_void("bleRequestPermissions")?;
    Ok(())
}

#[tauri::command]
async fn ble_start_scan(app: tauri::AppHandle, timeout_ms: u64) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let started = jni_bool("bleStartScan")?;
        if !started {
            return Err("bleStartScan returned false — Bluetooth off or permissions missing".into());
        }

        tauri::async_runtime::spawn(async move {
            let iters = (timeout_ms as f64 / 500.0).ceil() as u64;
            for _ in 0..iters {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                let err_code = match jni_int("bleGetScanError") {
                    Ok(v) => v,
                    Err(_) => break,
                };
                if err_code != 0 {
                    let _ = app.emit("ble-scan-update", format!("{{\"scanError\":{err_code}}}"));
                    break;
                }

                match jni_str("bleGetScanResults") {
                    Ok(s) if s.is_empty() => {}
                    Ok(s) => { let _ = app.emit("ble-scan-update", s); }
                    Err(_) => break,
                }
            }
            let _ = jni_void("bleStopScan");
        });
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Err("BLE only available on Android".into())
}

#[tauri::command]
async fn ble_connect_and_subscribe(
    app: tauri::AppHandle,
    address: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        const WEIGHT_NOTIFY: &str = "0000ff11-0000-1000-8000-00805f9b34fb";

        let ok = jni_bool_s("bleConnect", &address)?;
        if !ok {
            return Err("bleConnect failed".into());
        }

        // Wait up to 10 s for GATT to be ready.
        // jni_int uses the global statics — safe from any thread including tokio workers.
        let connected = 'wait: {
            for _ in 0..50 {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                match jni_int("bleIsConnected")? {
                    2 => break 'wait true,
                    -1 => break 'wait false,
                    _ => {}
                }
            }
            false
        };
        if !connected {
            return Err("BLE connection timed out or failed".into());
        }

        let subscribed = jni_bool_s("bleSubscribe", WEIGHT_NOTIFY)?;
        if !subscribed {
            return Err("bleSubscribe failed — characteristic not found".into());
        }

        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;

                let status = jni_int("bleIsConnected").unwrap_or(-1);
                if status == -1 {
                    let _ = app.emit("ble-disconnected", ());
                    break;
                }
                if status != 2 {
                    break;
                }

                loop {
                    match jni_str("bleGetNotification") {
                        Ok(s) if s.is_empty() => break,
                        Ok(s) => { let _ = app.emit("ble-notification", s); }
                        Err(_) => break,
                    }
                }
            }
        });

        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Err("BLE only available on Android".into())
}

#[tauri::command]
async fn ble_send_command(data: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        const COMMAND_WRITE: &str = "0000ff12-0000-1000-8000-00805f9b34fb";
        let data_json = format!(
            "[{}]",
            data.iter()
                .map(|b| b.to_string())
                .collect::<Vec<_>>()
                .join(",")
        );
        let ok = jni_bool_ss("bleWriteJson", COMMAND_WRITE, &data_json)?;
        if !ok {
            return Err("bleWriteJson failed".into());
        }
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Err("BLE only available on Android".into())
}

#[tauri::command]
async fn ble_disconnect() -> Result<(), String> {
    #[cfg(target_os = "android")]
    jni_void("bleDisconnect")?;
    Ok(())
}

#[tauri::command]
async fn kettle_connect_and_subscribe(
    app: tauri::AppHandle,
    address: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        const KETTLE_NOTIFY: &str = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

        let ok = jni_bool_s("kettleConnect", &address)?;
        if !ok {
            return Err("kettleConnect failed".into());
        }

        let connected = 'wait: {
            for _ in 0..50 {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                match jni_int("kettleIsConnected")? {
                    2 => break 'wait true,
                    -1 => break 'wait false,
                    _ => {}
                }
            }
            false
        };
        if !connected {
            return Err("Kettle connection timed out or failed".into());
        }

        let subscribed = jni_bool_s("kettleSubscribe", KETTLE_NOTIFY)?;
        if !subscribed {
            return Err("kettleSubscribe failed — characteristic not found".into());
        }

        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;

                let status = jni_int("kettleIsConnected").unwrap_or(-1);
                if status == -1 {
                    let _ = app.emit("kettle-disconnected", ());
                    break;
                }
                if status != 2 { break; }

                loop {
                    match jni_str("kettleGetNotification") {
                        Ok(s) if s.is_empty() => break,
                        Ok(s) => { let _ = app.emit("kettle-notification", s); }
                        Err(_) => break,
                    }
                }
            }
        });

        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Err("BLE only available on Android".into())
}

#[tauri::command]
async fn kettle_set_temp(temp: i32) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        const KETTLE_WRITE: &str = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
        let temp_str = temp.to_string();
        let ok = jni_bool_ss("kettleWriteAscii", KETTLE_WRITE, &temp_str)?;
        if !ok {
            return Err("kettleWriteAscii failed".into());
        }
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Ok(())
}

#[tauri::command]
async fn kettle_disconnect() -> Result<(), String> {
    #[cfg(target_os = "android")]
    jni_void("kettleDisconnect")?;
    Ok(())
}

#[tauri::command]
fn scaffold_project_guide(
    vault_path: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    let dir = std::path::Path::new(&vault_path).join("Guides");
    if !dir.exists() {
        return Err("vault-not-found".into());
    }
    let path = dir.join(file_name);
    if path.exists() {
        return Err("guide-exists".into());
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Lanza una terminal con Claude Code para analizar un cafe (desktop/Windows).
/// Escribe el contexto del grano a un archivo temporal y abre una ventana de
/// PowerShell corriendo `claude` con un prompt que apunta a las guias + contexto + foto.
#[tauri::command]
fn launch_coffee_analysis(
    repo_path: String,
    context: String,
    photo_path: Option<String>,
) -> Result<(), String> {
    let tmp = std::env::temp_dir();

    // 1) contexto del grano -> archivo temporal (Claude lo lee por ruta absoluta)
    let ctx_path = tmp.join("plan-coffee-analysis.md");
    std::fs::write(&ctx_path, context.as_bytes()).map_err(|e| e.to_string())?;

    let photo_clause = match photo_path.as_deref() {
        Some(p) if !p.is_empty() => format!("La foto del grano esta en: {}", p),
        _ => "No se adjunto foto; pedile la foto del grano al usuario.".to_string(),
    };

    // 2) prompt para Claude (lo guardamos como here-string literal en un .ps1 -> sin lios de comillas)
    let prompt = format!(
        "Analisis de cafe (app Plan).\n\
         1) Lee COFFEE_GUIDE.md y CATA_GUIDE.md de este repo, y el contexto del grano en: {ctx}\n\
         2) {photo}\n\
         3) Deduci el nivel de tueste (de la foto si hay) y el perfil esperado.\n\
         4) Recomenda receta + molienda (Kingrinder K6, en clicks) + temperatura, con el porque.\n\
         5) Persisti la recomendacion en la app con tools/coffee_cli.py (patron outbox):\n\
            - ver recetas base:  python tools/coffee_cli.py recipes\n\
            - receta especifica del grano:  python tools/coffee_cli.py set-recipe \"<grano>\" \"<receta base>\" --ratio <r> --temp <c> --grind <clicks> [--steps '<json de pasos>']\n\
            - o un ajuste puntual:  python tools/coffee_cli.py set-tweak \"<grano>\" --grind <clicks> --temp <c> --dose <g> --water <g> --notes \"...\"\n\
         6) Actualiza COFFEE_GUIDE.md (Parte 2, ficha del grano) con lo aprendido.\n\
         Responde en espanol.",
        ctx = ctx_path.to_string_lossy(),
        photo = photo_clause,
    );

    // 3) launcher .ps1 con here-string single-quoted (literal, sin interpolacion)
    let ps1_path = tmp.join("plan-coffee-launch.ps1");
    let script = format!("claude @'\n{}\n'@\n", prompt);
    std::fs::write(&ps1_path, script).map_err(|e| e.to_string())?;

    // 4) abrir PowerShell visible, en el dir del repo. SIN -NoExit: cuando termina la
    //    sesion de claude, la ventana se cierra sola.
    // Nota: en el build debug (console-subsystem) CREATE_NEW_CONSOLE hereda los
    // handles de stdio del padre en vez de asignar unos nuevos, asi que la ventana
    // se abre vacia. Por eso se lanza via `cmd /C start` (que si asigna consola
    // propia a powershell) y se le pone CREATE_NO_WINDOW al cmd intermedio.
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "start", "", "powershell", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&ps1_path)
        .current_dir(&repo_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW (solo para el cmd wrapper)
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Lanza una terminal con Claude Code para responder una duda puntual sobre un
/// brew (Fase 7c, desktop/Windows). Mismo patron que launch_coffee_analysis,
/// pero el prompt parte de la queja del usuario en vez de armar una receta inicial.
#[tauri::command]
fn launch_coffee_question(
    repo_path: String,
    context: String,
    question: String,
) -> Result<(), String> {
    let tmp = std::env::temp_dir();

    // 1) contexto del grano (+ ultimo brew) -> archivo temporal
    let ctx_path = tmp.join("plan-coffee-question.md");
    std::fs::write(&ctx_path, context.as_bytes()).map_err(|e| e.to_string())?;

    // 2) prompt para Claude
    let prompt = format!(
        "Ajuste de cafe (app Plan).\n\
         El usuario preparo este cafe y no le gusto como salio: \"{question}\"\n\
         1) Lee COFFEE_GUIDE.md y CATA_GUIDE.md de este repo, y el contexto del grano + ultimo brew en: {ctx}\n\
         2) Proponer 1-3 cambios concretos de parametro (molienda / ratio / temperatura / perfil de vertido), con el porque.\n\
         3) Si corresponde, persisti el ajuste con tools/coffee_cli.py set-tweak (patron outbox):\n\
            python tools/coffee_cli.py set-tweak \"<grano>\" --grind <clicks> --temp <c> --dose <g> --water <g> --notes \"...\"\n\
         Responde en espanol.",
        ctx = ctx_path.to_string_lossy(),
    );

    // 3) launcher .ps1 con here-string single-quoted (literal, sin interpolacion)
    let ps1_path = tmp.join("plan-coffee-question-launch.ps1");
    let script = format!("claude @'\n{}\n'@\n", prompt);
    std::fs::write(&ps1_path, script).map_err(|e| e.to_string())?;

    // 4) abrir PowerShell visible, en el dir del repo (ver nota en launch_coffee_analysis
    //    sobre por que se usa `cmd /C start` en vez de CREATE_NEW_CONSOLE directo).
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "start", "", "powershell", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&ps1_path)
        .current_dir(&repo_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW (solo para el cmd wrapper)
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create local mirror tables + outbox + meta",
            sql: include_str!("../migrations/0001_local_mirror.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add budget tables: expense_categories, expenses, budgets",
            sql: include_str!("../migrations/0002_budget.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add savings_goals and savings_contributions",
            sql: include_str!("../migrations/0003_savings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add monthly incomes",
            sql: include_str!("../migrations/0004_incomes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add habit flag + habit_logs",
            sql: include_str!("../migrations/0005_habits.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add shopping_items",
            sql: include_str!("../migrations/0006_shopping.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add ingredients + ingredient_presentations",
            sql: include_str!("../migrations/0007_compras_ingredients.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add recipes + recipe_ingredients",
            sql: include_str!("../migrations/0008_compras_recipes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "shopping_items link columns + saved_lists",
            sql: include_str!("../migrations/0009_compras_lists.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add meal_plan_entries",
            sql: include_str!("../migrations/0010_compras_plan.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add inventory + meal_log",
            sql: include_str!("../migrations/0011_compras_inventory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "inventory presentation_id (lots)",
            sql: include_str!("../migrations/0012_inventory_lots.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add compras_settings",
            sql: include_str!("../migrations/0013_compras_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add events table",
            sql: include_str!("../migrations/0014_events.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add project_id and category_id to events",
            sql: include_str!("../migrations/0015_events_project_category.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "budget v2: expense name, savings percent allocation, expense line items",
            sql: include_str!("../migrations/0016_budget_v2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add ingredient_categories + category_id to ingredients",
            sql: include_str!("../migrations/0017_ingredient_category.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "ingredient_categories table (idempotent fallback)",
            sql: include_str!("../migrations/0018_ingredient_categories_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "rebuild ingredients table to ensure category_id column",
            sql: include_str!("../migrations/0019_ingredients_category_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "add automations table (local-only)",
            sql: include_str!("../migrations/0020_automations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "add coffee_beans and coffee_recipes",
            sql: include_str!("../migrations/0021_coffee.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "rebuild coffee_beans without order_threshold_grams",
            sql: include_str!("../migrations/0022_coffee_fix.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "add water_mode to coffee_recipes",
            sql: include_str!("../migrations/0023_coffee_water_mode.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "add brew_sessions and brew_datapoints (telemetry)",
            sql: include_str!("../migrations/0024_brew_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "add cata_inicial, nota_final, last_tweak to coffee_beans",
            sql: include_str!("../migrations/0025_coffee_cata.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "project tracker: objetivo, estado, milestones on projects",
            sql: include_str!("../migrations/0026_project_tracker.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "recipe_ingredients: add category_id (generic slots)",
            sql: include_str!("../migrations/0027_recipe_ingredient_category.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "brew_sessions: add datapoints JSON blob (telemetry sync)",
            sql: include_str!("../migrations/0028_brew_datapoints_blob.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "coffee_beans: add finished_at (cafe terminado / no tengo mas)",
            sql: include_str!("../migrations/0029_coffee_finished.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "coffee_recipes: add bean_id + base_recipe_id (receta especifica por grano)",
            sql: include_str!("../migrations/0030_coffee_recipe_bean.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "add accounts table (Finanzas: holdings / net worth)",
            sql: include_str!("../migrations/0031_accounts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "finanzas links: account_id on expenses/incomes, destination on goals, account_transfers",
            sql: include_str!("../migrations/0032_finanzas_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "finanzas_settings: base currency + DKK/EUR/ARS per USD, fetched daily",
            sql: include_str!("../migrations/0033_finanzas_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "savings_goals: active status + priority (bought before reaching target)",
            sql: include_str!("../migrations/0034_savings_goal_status.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "net_worth_snapshots: one row per user per month (Holdings chart)",
            sql: include_str!("../migrations/0035_net_worth_snapshots.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 36,
            description: "expenses: add goal_id (Registrar compra links an expense to a savings goal)",
            sql: include_str!("../migrations/0036_expenses_goal_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 37,
            description: "savings_goals: add purchase_account_id (separate from destination_account_id)",
            sql: include_str!("../migrations/0037_savings_goal_purchase_account.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 38,
            description: "expense_categories: add hidden_from_chart (toggle in Presupuesto's pie legend)",
            sql: include_str!("../migrations/0038_expense_category_hidden_from_chart.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 39,
            description: "shopping_items: add week_start (Listas pasa a ser por semana)",
            sql: include_str!("../migrations/0039_shopping_items_week.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 40,
            description: "coffee_beans: add rating (1-10) + flavor_tags (issue #10)",
            sql: include_str!("../migrations/0040_coffee_bean_rating.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 41,
            description: "coffee_beans: add initial_weight_grams (bag size at load/reactivate, for stock bar)",
            sql: include_str!("../migrations/0041_coffee_bean_initial_weight.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 42,
            description: "coffee_wishlist_items: café wishlist (name, roaster, process, price)",
            sql: include_str!("../migrations/0042_coffee_wishlist.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:calendar.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            request_or_open_notification_settings,
            ble_check_permissions,
            ble_request_permissions,
            ble_start_scan,
            ble_connect_and_subscribe,
            ble_send_command,
            ble_disconnect,
            kettle_connect_and_subscribe,
            kettle_set_temp,
            kettle_disconnect,
            scaffold_project_guide,
            launch_coffee_analysis,
            launch_coffee_question,
            schedule_event_notification,
            cancel_event_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
