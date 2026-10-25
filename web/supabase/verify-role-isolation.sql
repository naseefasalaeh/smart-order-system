-- Existing active profiles only. Never modify an order: NULL order IDs cannot
-- match a row. All JWT claim changes and temporary results roll back.
begin;
create temporary table role_verification(role text, result text);
do $$
declare shop_role text; actor uuid; expected text; actual text;
begin
  foreach shop_role in array array['admin','staff','kitchen_staff'] loop
    select id into actor from public.profiles where role=shop_role and is_active limit 1;
    if actor is null then raise exception 'Missing active testable role: %', shop_role; end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    begin
      perform public.advance_order_status(null,'confirmed','preparing');
      raise exception 'Unexpected success';
    exception when others then
      get stacked diagnostics actual = message_text;
      expected := case when shop_role='kitchen_staff' then 'ORDER_STATUS_CHANGED' else 'KITCHEN_ROLE_REQUIRED' end;
      if actual <> expected then raise exception '% advance: %',shop_role,actual; end if;
    end;
    begin
      perform public.serve_order(null);
      raise exception 'Unexpected success';
    exception when others then
      get stacked diagnostics actual = message_text;
      expected := case when shop_role='staff' then 'ORDER_NOT_FOUND' else 'STAFF_ROLE_REQUIRED' end;
      if actual <> expected then raise exception '% serve: %',shop_role,actual; end if;
    end;
    begin
      perform public.complete_order_payment(null,'cash');
      raise exception 'Unexpected success';
    exception when others then
      get stacked diagnostics actual = message_text;
      expected := case when shop_role='staff' then 'ORDER_NOT_SERVED' else 'STAFF_ROLE_REQUIRED' end;
      if actual <> expected then raise exception '% payment: %',shop_role,actual; end if;
    end;
    insert into role_verification values(shop_role,'PASS: role guards and allowed validation');
  end loop;
end $$;
select * from role_verification;
rollback;
