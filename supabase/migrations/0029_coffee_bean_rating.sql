-- Issue #10: puntaje (1-10) + tags de sabor por grano, cargados al marcar
-- el grano como terminado. Alimenta el perfil de gustos de la Fase 7b del
-- asistente de cafe (issue #11) mas adelante.

alter table public.coffee_beans
  add column rating integer check (rating >= 1 and rating <= 10),
  add column flavor_tags jsonb not null default '[]'::jsonb;
