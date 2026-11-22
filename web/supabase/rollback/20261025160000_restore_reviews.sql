-- Restore the audited empty table. Run as postgres; do not overwrite a table.
-- This is a manual rollback, not a forward migration or a reset of history.
begin;
create table public.reviews (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  rating integer not null,
  comment text,
  created_at timestamp with time zone not null default now(),
  constraint reviews_pkey primary key (id),
  constraint reviews_order_id_key unique (order_id),
  constraint reviews_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade,
  constraint reviews_rating_check check (rating >= 1 and rating <= 5)
);
alter table public.reviews owner to postgres;
alter table public.reviews enable row level security;
revoke all on table public.reviews from public, anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.reviews to anon, authenticated, service_role;
-- Original table had no policies, triggers or Realtime publication membership.
commit;
