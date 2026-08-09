-- 1. Variantes "a granel": una presentacion puede ser un paquete de tamano fijo
--    (kind='package', como hasta ahora) o algo que se compra por peso/volumen
--    (kind='bulk', ej. salmon en la pescaderia).
--    En kind='bulk' `size` NO se lee nunca y `price` significa precio por unidad
--    base (por g / ml / u). Una sola formula sirve para los dos casos:
--      costo = price * (kind='bulk' ? base_quantity : size * count)
--    (el invariante se valida en TS; SQLite no permite agregar CHECK por ALTER)
ALTER TABLE ingredient_presentations ADD COLUMN kind TEXT NOT NULL DEFAULT 'package';

-- 2. Comercios (donde se compro). Tabla propia y no texto libre para que el
--    historial de precios se pueda agrupar y comparar por comercio.
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS merchants_user_idx ON merchants(user_id);
CREATE INDEX IF NOT EXISTS merchants_user_updated_idx ON merchants(user_id, updated_at);

ALTER TABLE expenses ADD COLUMN merchant_id TEXT;

-- 3. Lineas de gasto ligadas al catalogo de ingredientes.
--    Se preserva el invariante quantity * unit_price = total de la linea.
--    base_quantity = cantidad total adquirida en unidad base (g / ml / u), que es
--    lo que permite normalizar el precio: (quantity*unit_price)/base_quantity.
ALTER TABLE expense_line_items ADD COLUMN ingredient_id TEXT;
ALTER TABLE expense_line_items ADD COLUMN presentation_id TEXT;
ALTER TABLE expense_line_items ADD COLUMN base_quantity REAL NOT NULL DEFAULT 0;
--    default 0: una linea de un gasto cualquiera (Netflix, un restaurante) no
--    debe generar stock. La UI manda 1 explicitamente cuando hay ingrediente.
ALTER TABLE expense_line_items ADD COLUMN add_to_stock INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS eli_ingredient_idx ON expense_line_items(ingredient_id);

-- 4. Trazabilidad del lote creado desde una linea de gasto: sin esto, editar o
--    borrar la linea duplicaria o dejaria huerfano el stock.
ALTER TABLE inventory ADD COLUMN source_line_item_id TEXT;
CREATE INDEX IF NOT EXISTS inventory_source_line_idx ON inventory(source_line_item_id);

-- 5. Presupuestos por periodo. monthly_amount pasa a leerse como "monto por
--    periodo" (no se renombra la columna: romperia el wire de sync sin ganancia).
ALTER TABLE budgets ADD COLUMN period TEXT NOT NULL DEFAULT 'monthly';

-- 6. Un item de lista a granel necesita una cantidad real: shopping_items.quantity
--    es INTEGER y los dos editores la redondean, asi que 750 g no entra ahi.
ALTER TABLE shopping_items ADD COLUMN base_quantity REAL;

-- 7. La semana de la app pasa a ser sabado->viernes. Todas las week_start
--    existentes son lunes (ver 0039), asi que retroceden dos dias. El plan
--    semanal de comidas comparte ese mismo weekStart, va junto.
UPDATE shopping_items SET week_start = date(week_start, '-2 days');
UPDATE meal_plan_entries SET week_start = date(week_start, '-2 days');
