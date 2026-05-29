-- Compras module A5+: inventory becomes per-presentation lots (each unit a row
-- with its own remaining quantity + expiry), instead of one total per ingredient.

alter table public.inventory
  add column if not exists presentation_id uuid references public.ingredient_presentations(id) on delete set null;
