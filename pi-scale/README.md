# pi-scale (Fase 1 + Fase 2)

Servicio standalone para Raspberry Pi que se conecta por BLE a la balanza
BOOKOO Themis Ultra, detecta un brew de punta a punta (usando el timer
propio de la balanza en modo automatico) y lo sube a Supabase como una fila
de `brew_sessions` sin grano/receta asignados (eso lo hace la Fase 3, un
popup en la app de escritorio).

## Como funciona

- `packet.py` — decodifica los paquetes de 20 bytes de la caracteristica
  `0xFF11` (mismo layout que `src/lib/ble.ts`).
- `scale_ble.py` — escanea, conecta y se re-conecta solo (backoff 2s..30s).
  Una desconexion es el caso normal (la balanza se apaga sola), no un error.
- `detector.py` — maquina de estados IDLE -> BREWING -> guardado:
  - **Inicio:** cuando el `timer_ms` propio de la balanza pasa de 0 a
    corriendo (asi arranca el modo automatico: tare+start en un solo golpe)
    Y se confirma agua real (flow > 0.4 g/s) dentro de los 3s siguientes.
    Si el timer arranca sin agua real, se descarta como falsa alarma.
  - **Fin:** el peso cae >=50g respecto al pico Y por debajo del 60% del
    pico, sostenido 3 lecturas — se levanto el dripper/filtro. Misma logica
    que usa la app (`BrewView.tsx`).
  - Si nunca se alcanza un pico real en ~2 min, o pasan ~15 min, se
    descarta (brew fantasma). Si se desconecta a mitad de un brew real
    (con pico >=50g), se guarda igual con lo capturado hasta ahi.
- `config.py` — lee `SUPABASE_URL`/`SUPABASE_ANON_KEY` de variables de
  entorno (mismo par que usa la app en `.env.local`, ver `.env.example`).
- `login.py` — script interactivo (correr UNA vez a mano): pide email y
  password de tu cuenta de Supabase, guarda el access+refresh token en
  `~/.config/plan-scale/session.json` (permisos 600).
- `sb.py` — carga esa sesion, la refresca proactivamente antes de que
  expire (y persiste el token rotado — Supabase invalida el anterior en
  cada refresh), e inserta en `brew_sessions`. Usa tu sesion de usuario
  normal, NO la service_role key: si la Pi se pierde/compromete, solo se
  puede tocar tus propias filas (mismo alcance que ya tenes).
- `uploader.py` — arma la fila (`recipe_id`/`bean_id` en null, `dose_grams`
  en 0 — la Pi no sabe que grano ni cuanto dosificaste) y maneja el spool
  offline: si falla la subida, la guarda en `captures/pending/` y la
  reintenta cada 5 min.
- `main.py` — conecta todo: guarda copia local en `captures/` + intenta
  subir cada brew terminado.

## Setup en la Raspberry Pi

```bash
sudo apt install python3-venv bluetooth
cd pi-scale
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Usuario debe estar en el grupo `bluetooth` (o correr con permisos para
usar BlueZ via D-Bus):

```bash
sudo usermod -aG bluetooth $USER   # requiere reloguear
```

**Gotcha especifico de este setup (Debian 13 "trixie" puro en Pi 3, sin
Raspberry Pi OS):** sin el paquete `pi-bluetooth` (no disponible sin el
repo de Raspberry Pi), el Bluetooth por UART del Pi 3 puede fallar con
`hci0: command 0x0c14 tx timeout` / `hci0` queda `DOWN` con MAC
`00:00:00:00:00:00` (`hciconfig -a` lo muestra) y `bluetoothctl show` dice
"No default controller available" — el escalado de frecuencia del core
rompe el timing del UART que comparte con Bluetooth. Fix: agregar
`core_freq=250` a `/boot/firmware/config.txt` y `sudo reboot`. Verificado
2026-07-08: con esto `hci0` levanta con MAC real y el servicio conecta
solo tras el boot.

### Credenciales de Supabase

```bash
cp .env.example .env
# completar SUPABASE_URL y SUPABASE_ANON_KEY con los mismos valores que
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY del .env.local de la app
```

Para correr manualmente hay que cargar ese `.env` en el shell (systemd lo
lee solo via `EnvironmentFile=`, ver mas abajo):

```bash
set -a; source .env; set +a
```

### Login (una sola vez, o cuando se invalide la sesion)

```bash
source venv/bin/activate
set -a; source .env; set +a
python login.py
```

Pide email + password de tu cuenta de Supabase (la misma con la que entras
a la app) y guarda la sesion. Volver a correrlo si el servicio loguea
"Sesion de Supabase perdida" (password cambiado, revocacion manual, o la
Pi apagada tanto tiempo que el refresh token expiro — a confirmar cuanto
es eso en la practica).

## Correr manualmente (bench test)

```bash
source venv/bin/activate
set -a; source .env; set +a
python main.py
```

Dejarlo corriendo y hacer un brew real con la balanza en modo automatico,
sin tocar nada mas. En la consola deberia verse: conexion, y al terminar
una linea `brew: <id> (...) uploaded=True local=brew_<timestamp>.json`.
Confirmar en el Table Editor de Supabase que aparecio la fila en
`brew_sessions` con `recipe_id`/`bean_id` null y un array de `datapoints`
razonable.

**Casos negativos a probar tambien** (ya verificados en Fase 1, repetir
para confirmar que la subida no los rompe):
- Poner/sacar una taza o los granos de la balanza sin brewear -> no debe
  guardar ni subir nada.
- Cortar el bluetooth o alejar la balanza a mitad de un brew -> si ya
  habia un pico real, debe guardarse y subirse igual (`end_reason:
  "disconnected"`).

**Caso de red caida:** cortar el WiFi/ethernet de la Pi, hacer un brew,
confirmar que loguea `uploaded=False` y aparece un archivo en
`captures/pending/`. Restaurar la red y esperar ~5 min (o reiniciar
`main.py`) — el archivo debe desaparecer de `pending/` y la fila aparecer
en Supabase.

Parar con Ctrl+C (loguea "detenido" limpio, no un traceback).

## Instalar como servicio (systemd)

```bash
sudo cp plan-scale.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now plan-scale
```

`plan-scale.service` asume usuario `prieto` y el repo en
`/home/prieto/Documents/pi-scale` (ajustar `User=`/rutas si cambia).
Reinicia solo (`Restart=always`) ante cualquier caida, y arranca despues
de que Bluetooth y la red esten listos.

**Ver logs:**
```bash
journalctl -u plan-scale -f       # en vivo
journalctl -u plan-scale --since today
```

**Parar / reiniciar:**
```bash
sudo systemctl stop plan-scale
sudo systemctl restart plan-scale
```

## Que falta (Fase 3)

Popup en la app de escritorio: al sincronizar, si aparece una sesion con
`recipe_id`/`bean_id` en null, preguntar a que grano/receta (y dosis)
corresponde ese brew.
