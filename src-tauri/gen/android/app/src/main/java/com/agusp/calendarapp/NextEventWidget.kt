package com.agusp.calendarapp

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget de pantalla de inicio: "próximo evento".
 *
 * ARQUITECTURA (importante): un widget corre en el proceso del LAUNCHER. No hay
 * webview, ni React, ni TanStack Query, ni acceso razonable al SQLite de la app
 * (calendar.db está en WAL con un solo escritor). Por eso este provider NO
 * calcula nada: solo PINTA un snapshot que la app le dejó escrito.
 *
 * Flujo del dato:
 *   src/lib/useEventNotifications.ts  (calcula el próximo evento)
 *     -> invoke("update_widget_snapshot", { payload })      [Tauri command]
 *     -> src-tauri/src/lib.rs  jni_bool_s("updateWidgetSnapshot", ...)
 *     -> MainActivity.updateWidgetSnapshot(json)
 *     -> NextEventWidget.writeSnapshot(ctx, json)  [SharedPreferences] + refresh()
 *
 * Refresco (los tres caminos reales):
 *   1. Cuando la app escribe el snapshot (writeSnapshot llama refresh).
 *   2. Cuando dispara una alarma exacta de evento (EventAlarmReceiver.onReceive
 *      llama refresh) — reusamos las alarmas que la app YA programa; NO hay un
 *      sistema de alarmas paralelo.
 *   3. updatePeriodMillis del appwidget-provider = 30 min, que es el PISO que
 *      permite Android. Es solo red de seguridad.
 *
 * Por eso la UI muestra siempre la HORA del evento (dato absoluto, correcto aun
 * si el refresco llega tarde) y el "falta N" como línea secundaria: no se
 * promete una cuenta regresiva al minuto, Android en doze no la puede sostener.
 */
class NextEventWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        val views = buildViews(context)
        for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, views)
    }

    companion object {
        private const val PREFS = "plan_widget"
        private const val K_HAS_EVENT = "has_event"
        private const val K_EVENT_ID = "event_id"
        private const val K_TITLE = "title"
        private const val K_TIME_LABEL = "time_label"
        private const val K_DAY_LABEL = "day_label"
        private const val K_LOCATION = "location"
        private const val K_START_MS = "start_ms"

        /** Extras del PendingIntent del tap (los lee MainActivity). */
        const val EXTRA_FROM_WIDGET = "from_widget"
        const val EXTRA_OPEN_EVENT_ID = "open_event_id"

        /** requestCode fijo: hay un solo PendingIntent de tap a la vez, y
         *  FLAG_UPDATE_CURRENT le reemplaza los extras cuando cambia el evento. */
        private const val RC_TAP = 0x7710

        /**
         * Guarda el snapshot que mandó la app y repinta.
         *
         * json esperado (lo arma useEventNotifications.ts):
         *   { "hasEvent": false }
         *   { "hasEvent": true, "eventId": "<uuid>", "title": "Dentista",
         *     "dayLabel": "Hoy", "timeLabel": "14:30", "location": "Clínica",
         *     "startMs": 1750000000000 }
         *
         * Las etiquetas de día/hora vienen YA formateadas desde JS a propósito:
         * el formato y el idioma son de la app, y Kotlin no debe duplicar ni el
         * calendario ni la localización.
         */
        fun writeSnapshot(context: Context, json: String): Boolean {
            val app = context.applicationContext
            return try {
                val o = JSONObject(json)
                val has = o.optBoolean("hasEvent", false)
                val ed = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                ed.putBoolean(K_HAS_EVENT, has)
                if (has) {
                    ed.putString(K_EVENT_ID, o.optString("eventId", ""))
                    ed.putString(K_TITLE, o.optString("title", ""))
                    ed.putString(K_DAY_LABEL, o.optString("dayLabel", ""))
                    ed.putString(K_TIME_LABEL, o.optString("timeLabel", ""))
                    ed.putString(K_LOCATION, o.optString("location", ""))
                    ed.putLong(K_START_MS, o.optLong("startMs", 0L))
                } else {
                    ed.remove(K_EVENT_ID)
                    ed.remove(K_TITLE)
                    ed.remove(K_DAY_LABEL)
                    ed.remove(K_TIME_LABEL)
                    ed.remove(K_LOCATION)
                    ed.remove(K_START_MS)
                }
                ed.apply()
                refresh(app)
                true
            } catch (e: Exception) {
                false
            }
        }

        /** Repinta todas las instancias del widget desde el snapshot guardado. */
        fun refresh(context: Context) {
            val app = context.applicationContext
            try {
                val mgr = AppWidgetManager.getInstance(app) ?: return
                val ids = mgr.getAppWidgetIds(ComponentName(app, NextEventWidget::class.java))
                if (ids == null || ids.isEmpty()) return
                val views = buildViews(app)
                for (id in ids) mgr.updateAppWidget(id, views)
            } catch (e: Exception) {
                /* el launcher puede no tener el widget instalado; no es un error */
            }
        }

        private fun buildViews(context: Context): RemoteViews {
            val app = context.applicationContext
            val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val views = RemoteViews(app.packageName, R.layout.widget_next_event)

            val hasEvent = p.getBoolean(K_HAS_EVENT, false)
            val eventId = p.getString(K_EVENT_ID, "") ?: ""

            if (hasEvent && eventId.isNotEmpty()) {
                val title = p.getString(K_TITLE, "") ?: ""
                val dayLabel = p.getString(K_DAY_LABEL, "") ?: ""
                val timeLabel = p.getString(K_TIME_LABEL, "") ?: ""
                val location = p.getString(K_LOCATION, "") ?: ""
                val startMs = p.getLong(K_START_MS, 0L)

                // Línea 1: SIEMPRE el dato absoluto ("Hoy · 14:30"). No caduca
                // aunque el refresco llegue tarde.
                val whenLine = when {
                    dayLabel.isEmpty() -> timeLabel
                    timeLabel.isEmpty() -> dayLabel
                    else -> "$dayLabel · $timeLabel"
                }
                // Línea 3: lo relativo (puede quedar viejo) + lugar.
                val rel = if (startMs > 0L) relativeLabel(startMs, System.currentTimeMillis()) else ""
                val subLine = when {
                    rel.isNotEmpty() && location.isNotEmpty() -> "$rel · $location"
                    rel.isNotEmpty() -> rel
                    else -> location
                }

                views.setViewVisibility(R.id.widget_state_event, View.VISIBLE)
                views.setViewVisibility(R.id.widget_state_empty, View.GONE)
                views.setTextViewText(R.id.widget_when, whenLine)
                views.setTextViewText(
                    R.id.widget_title,
                    if (title.isEmpty()) app.getString(R.string.widget_untitled_event) else title,
                )
                views.setTextViewText(R.id.widget_sub, subLine)
                views.setViewVisibility(
                    R.id.widget_sub,
                    if (subLine.isEmpty()) View.GONE else View.VISIBLE,
                )
                views.setOnClickPendingIntent(R.id.widget_root, tapIntent(app, eventId))
            } else {
                views.setViewVisibility(R.id.widget_state_event, View.GONE)
                views.setViewVisibility(R.id.widget_state_empty, View.VISIBLE)
                views.setOnClickPendingIntent(R.id.widget_root, tapIntent(app, null))
            }
            return views
        }

        /** Tap: abre MainActivity. Con evento manda su id; sin evento, nada
         *  (MainActivity lo traduce a la ruta del tab Plan). */
        private fun tapIntent(context: Context, eventId: String?): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(EXTRA_FROM_WIDGET, true)
                if (eventId != null && eventId.isNotEmpty()) {
                    putExtra(EXTRA_OPEN_EVENT_ID, eventId)
                }
            }
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags = flags or PendingIntent.FLAG_IMMUTABLE
            }
            return PendingIntent.getActivity(context, RC_TAP, intent, flags)
        }

        /**
         * "falta N" en texto. Solo una duración: sin calendario ni locale, así
         * que no duplica lógica del frontend. Si el evento ya empezó (o el
         * refresco llegó tarde) degrada a "ahora" en vez de mostrar negativos.
         */
        private fun relativeLabel(startMs: Long, nowMs: Long): String {
            val diff = startMs - nowMs
            if (diff <= 60_000L) return "ahora"
            val mins = diff / 60_000L
            if (mins < 60L) return "en $mins min"
            val hours = mins / 60L
            val remMin = mins % 60L
            if (hours < 24L) {
                return if (remMin == 0L) "en $hours h" else "en $hours h $remMin min"
            }
            val days = hours / 24L
            return if (days == 1L) "en 1 día" else "en $days días"
        }
    }
}
