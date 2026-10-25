begin;
set local lock_timeout='5s';
-- Existing order deductions do not always assign updated_at. Make every stock
-- change participate in optimistic locking, including deductions/restorations.
create function public.touch_ingredient_stock_version() returns trigger
language plpgsql set search_path='' as $$
begin
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger touch_ingredient_stock_version before update on public.ingredients
  for each row when (new.stock_quantity is distinct from old.stock_quantity)
  execute function public.touch_ingredient_stock_version();
commit;
