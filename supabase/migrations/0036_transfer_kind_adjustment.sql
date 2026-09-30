-- Ajuste de saldo invisible: editar el "saldo actual" de una cuenta crea un
-- account_transfer kind='adjustment' con una sola pata (la otra en null), porque
-- el saldo pasó a ser DERIVADO del ledger (ver src/lib/accountBalance.ts).
-- Hay que aplicarla ANTES de instalar la versión que crea ajustes, o el push rebota.

alter table public.account_transfers drop constraint if exists account_transfers_kind_check;
alter table public.account_transfers
  add constraint account_transfers_kind_check
  check (kind in ('transfer', 'savings', 'investment', 'adjustment'));
