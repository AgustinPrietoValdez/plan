-- Recurrence support: a task may carry a recurrence rule, and chained
-- instances link back to the first one via recurrence_parent_id.
-- Roll-forward model: only the current instance is materialized; completing
-- it creates the next one client-side.

alter table public.tasks
  add column recurrence jsonb,
  add column recurrence_parent_id uuid;

-- Find a chain's instances quickly (group by parent in the manage screen).
create index tasks_recurrence_parent_idx
  on public.tasks (user_id, recurrence_parent_id)
  where recurrence_parent_id is not null;

-- Find active chains (instances that still carry a rule and aren't deleted).
create index tasks_active_recurrence_idx
  on public.tasks (user_id)
  where recurrence is not null and deleted_at is null;
