begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Preserve the installed transaction bodies, locks, stock and audit behavior.
-- Fail closed if the expected guards changed, rather than silently skipping one.
do $$
declare signature text; definition text; previous_guard text; next_guard text;
begin
  foreach signature in array array[
    'public.advance_order_status(uuid,text,text)',
    'public.serve_order(uuid)',
    'public.complete_order_payment(uuid,text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if signature = 'public.advance_order_status(uuid,text,text)' then
      previous_guard := 'not in (''admin'', ''kitchen_staff'')';
      next_guard := '<> ''kitchen_staff''';
    else
      previous_guard := 'not in (''admin'',''staff'')';
      next_guard := '<> ''staff''';
    end if;
    if position(previous_guard in definition) = 0 then
      raise exception 'Expected role guard missing in %', signature;
    end if;
    execute replace(definition, previous_guard, next_guard);
  end loop;
end $$;
commit;
