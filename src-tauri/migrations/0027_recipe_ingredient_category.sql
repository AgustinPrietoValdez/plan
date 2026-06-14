ALTER TABLE recipe_ingredients ADD COLUMN category_id TEXT REFERENCES ingredient_categories(id);
