use tauri_plugin_sql::{Migration, MigrationKind};

/// On Android, calls MainActivity.requestNotificationsOrOpenSettings() which
/// triggers the proper ActivityResultLauncher registered in onCreate (the
/// upstream tauri-plugin-notification's launcher is bound too late and throws
/// "lateinit not initialized"). Falls back to opening the app's notification
/// settings page when the OS has silenced the prompt.
#[tauri::command]
fn request_or_open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use jni::objects::{JObject, JValue};
        use jni::JavaVM;

        // SAFETY: ndk_context is provided by the Tauri Android runtime; the
        // JavaVM and Activity raw pointers are valid for the app lifetime.
        let ctx = ndk_context::android_context();
        let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| format!("JavaVM::from_raw: {e}"))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("attach_current_thread: {e}"))?;
        let activity = unsafe { JObject::from_raw(ctx.context().cast()) };

        // The "default" Tauri activity is com.agusp.calendarapp.MainActivity,
        // which exposes `requestNotificationsOrOpenSettings(): Unit`.
        env.call_method(
            &activity,
            "requestNotificationsOrOpenSettings",
            "()V",
            &[] as &[JValue],
        )
        .map_err(|e| format!("call_method: {e}"))?;
    }
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:calendar.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![request_or_open_notification_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
