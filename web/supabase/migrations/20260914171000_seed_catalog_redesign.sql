begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Capture and verify the exact rows under locks before replacing audited demo data.
-- The private backup is not exposed to PostgREST or authenticated/anon clients.
create schema if not exists catalog_backup;
revoke all on schema catalog_backup from public,anon,authenticated;
create table catalog_backup.before_redesign (
  table_name text primary key, rows jsonb not null, captured_at timestamptz not null default now()
);
revoke all on catalog_backup.before_redesign from public,anon,authenticated;
lock table public.categories,public.menus,public.ingredients,public.menu_option_groups,
  public.menu_options,public.menu_ingredients,public.menu_option_ingredients,public.orders,
  public.order_items,public.order_item_options,public.order_ingredient_usages,public.payments,
  public.dining_sessions,public.restaurant_tables in share row exclusive mode;
do $$ declare t text; begin
  foreach t in array array['categories','menus','ingredients','menu_option_groups','menu_options',
    'menu_ingredients','menu_option_ingredients','orders','order_items','order_item_options',
    'order_ingredient_usages','payments','dining_sessions','restaurant_tables'] loop
    execute format('insert into catalog_backup.before_redesign(table_name,rows) select %L,coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t,t);
  end loop;
end $$;

do $$ begin
  if exists(select 1 from public.menus m join (values (1,'ข้าวกะเพรา'),(2,'ข้าวผัดไก่'),(3,'ชาเย็น'),(4,'น้ำเปล่า'),(5,'ไอศกรีมวานิลลา'),(6,'ข้าวผัดพริกไก่'),(7,'ข้าวไข่เจียว'),(8,'ข้าวเนื้อแดง'),(9,'ข้าวต้มยำ')) expected(id,name) on expected.id=m.id
    where m.name is distinct from expected.name) then raise exception 'DEMO_MENU_IDENTITY_CHANGED'; end if;
end $$;

alter table public.menus add column catalog_key text unique;
-- Preserve referenced names, recipes, prices and ingredient balances for old orders.
-- Scope cleanup to the nine demo menu IDs inspected before this migration.
delete from public.menus m where m.id between 1 and 9
  and not exists(select 1 from public.order_items oi where oi.menu_id=m.id)
  and not exists(select 1 from public.order_item_options oi join public.menu_options o on o.id=oi.menu_option_id where o.menu_id=m.id);
update public.menus set is_available=false where id between 1 and 9;
delete from public.ingredients i where i.id between 1 and 11
  and not exists(select 1 from public.menu_ingredients r where r.ingredient_id=i.id)
  and not exists(select 1 from public.menu_option_ingredients r where r.ingredient_id=i.id)
  and not exists(select 1 from public.addon_ingredients r where r.ingredient_id=i.id)
  and not exists(select 1 from public.order_ingredient_usages u where u.ingredient_id=i.id);
delete from public.categories c where c.id between 1 and 3
  and not exists(select 1 from public.menus m where m.category_id=c.id);

insert into public.categories(name,description)
select name,'เมนูชุดใหม่' from (values('อาหารจานเดียว'),('กับข้าว')) x(name)
where not exists(select 1 from public.categories c where c.name=x.name);

-- New stock starts at zero. Retained ingredients keep their exact previous balances.
do $$ declare r record; v_unit text; begin
  for r in select * from (values
    ('ข้าวสวย','กรัม','ข้าวและเส้น'),('เนื้อไก่','กรัม','เนื้อสัตว์'),('เนื้อวัว','กรัม','เนื้อสัตว์'),
    ('กุ้ง','กรัม','เนื้อสัตว์'),('ปลาหมึก','กรัม','เนื้อสัตว์'),('ไข่ไก่','ฟอง','ไข่และผลิตภัณฑ์นม'),
    ('ใบกะเพรา','กรัม','ผัก'),('พริก','กรัม','ผัก'),('กระเทียม','กรัม','ผัก'),('หอมหัวใหญ่','กรัม','ผัก'),
    ('ตะไคร้','กรัม','ผัก'),('ข่า','กรัม','ผัก'),('มะนาว','กรัม','ผัก'),('ขมิ้น','กรัม','ผัก')
  ) x(name,unit,category) loop
    select unit into v_unit from public.ingredients where name=r.name;
    if found and v_unit <> r.unit then raise exception 'INGREDIENT_UNIT_MISMATCH: %',r.name; end if;
    insert into public.ingredients(name,unit,stock_quantity,minimum_stock,category_id)
      select r.name,r.unit,0,case when r.unit='ฟอง' then 5 else 100 end,c.id
      from public.ingredient_categories c where c.name=r.category
      on conflict(name) do nothing;
    if not exists(select 1 from public.ingredients where name=r.name) then raise exception 'INGREDIENT_CATEGORY_MISSING'; end if;
  end loop;
end $$;

-- Initial editable prices: mains 50, side dishes 80; protein +0/+10/+20.
do $$ declare r record; v_menu bigint; v_group bigint; v_option bigint; v_addon bigint; p record; a record; v_category bigint; begin
  for a in select * from (values
    ('ไข่ดาว',10,'ไข่ไก่',1),('ไข่เจียว',10,'ไข่ไก่',1),
    ('เพิ่มข้าว',10,'ข้าวสวย',100),('เพิ่มเนื้อ',20,'เนื้อวัว',100)
  ) x(name,price,ingredient,quantity) loop
    insert into public.addons(name,additional_price,is_available,max_quantity)
      values(a.name,a.price,true,3) returning id into v_addon;
    insert into public.addon_ingredients select v_addon,id,a.quantity from public.ingredients where name=a.ingredient;
  end loop;
  for r in select * from (values
    ('rice-basil','ข้าวกะเพรา','อาหารจานเดียว','basil'),
    ('rice-chilli','ข้าวผัดพริก','อาหารจานเดียว','chilli'),
    ('rice-tomyum','ข้าวต้มยำ','อาหารจานเดียว','tomyum'),
    ('rice-garlic','ข้าวทอดกระเทียม','อาหารจานเดียว','garlic'),
    ('fried-rice','ข้าวผัด','อาหารจานเดียว','fried'),
    ('rice-turmeric','ข้าวทอดขมิ้น','อาหารจานเดียว','turmeric'),
    ('basil','กะเพรา','กับข้าว','basil'),('chilli','ผัดพริก','กับข้าว','chilli'),
    ('tomyum','ต้มยำ','กับข้าว','tomyum'),('garlic','ทอดกระเทียม','กับข้าว','garlic'),
    ('turmeric','ทอดขมิ้น','กับข้าว','turmeric')
  ) x(key,name,category,recipe) loop
    select id into strict v_category from public.categories where name=r.category;
    insert into public.menus(name,category_id,price,is_available,catalog_key)
      values(r.name,v_category,case when r.category='อาหารจานเดียว' then 50 else 80 end,true,r.key) returning id into v_menu;
    if r.category='อาหารจานเดียว' then
      insert into public.menu_ingredients select v_menu,id,200 from public.ingredients where name='ข้าวสวย';
    end if;
    insert into public.menu_ingredients(menu_id,ingredient_id,quantity_required)
    select v_menu,i.id,x.qty from (values
      ('basil','ใบกะเพรา',20),('basil','พริก',10),('basil','กระเทียม',10),
      ('chilli','พริก',15),('chilli','กระเทียม',10),('chilli','หอมหัวใหญ่',30),
      ('tomyum','ตะไคร้',20),('tomyum','ข่า',10),('tomyum','มะนาว',20),('tomyum','พริก',10),
      ('garlic','กระเทียม',20),('fried','ไข่ไก่',1),('fried','หอมหัวใหญ่',30),('fried','กระเทียม',10),
      ('turmeric','ขมิ้น',15),('turmeric','กระเทียม',10)
    ) x(recipe,ingredient,qty) join public.ingredients i on i.name=x.ingredient where x.recipe=r.recipe;
    insert into public.menu_option_groups(menu_id,name,kind,selection_type,is_required,min_select,max_select,max_total_quantity,display_order,is_active)
      values(v_menu,'ตัวเลือกเนื้อสัตว์','meat','single',true,1,1,1,0,true) returning id into v_group;
    for p in select * from (values('ไก่',0),('เนื้อ',10),('ทะเล',20)) x(name,price) loop
      insert into public.menu_options(menu_id,group_id,name,additional_price,max_quantity,is_available,sort_order)
        values(v_menu,v_group,p.name,p.price,1,true,p.price) returning id into v_option;
      insert into public.menu_option_ingredients(menu_option_id,ingredient_id,quantity_required)
        select v_option,i.id,x.qty from (values('ไก่','เนื้อไก่',150),('เนื้อ','เนื้อวัว',150),('ทะเล','กุ้ง',80),('ทะเล','ปลาหมึก',80)) x(protein,ingredient,qty)
        join public.ingredients i on i.name=x.ingredient where x.protein=p.name;
    end loop;
    insert into public.menu_option_groups(menu_id,name,kind,selection_type,is_required,min_select,max_select,max_total_quantity,display_order,is_active)
      values(v_menu,'ตัวเลือกเสริม','addon','multiple',false,0,4,12,100,true) returning id into v_group;
    insert into public.menu_options(menu_id,group_id,addon_id,name,additional_price,max_quantity,is_available,sort_order)
      select v_menu,v_group,id,'addon:'||id,0,3,true,0 from public.addons
      where name in ('ไข่ดาว','ไข่เจียว','เพิ่มข้าว','เพิ่มเนื้อ')
        and (r.recipe <> 'tomyum' or name in ('เพิ่มข้าว','เพิ่มเนื้อ'));
  end loop;
end $$;

-- Abort the entire migration if any history, session, table or retained stock changed.
do $$ declare t text; actual jsonb; expected jsonb; begin
  foreach t in array array['orders','order_items','order_item_options','order_ingredient_usages','payments','dining_sessions','restaurant_tables'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t) into actual;
    select rows into expected from catalog_backup.before_redesign where table_name=t;
    if actual is distinct from expected then raise exception 'HISTORY_CHANGED: %',t; end if;
  end loop;
  if exists(select 1 from public.ingredients i join catalog_backup.before_redesign b on b.table_name='ingredients'
    cross join lateral jsonb_array_elements(b.rows) old where (old->>'id')::bigint=i.id and to_jsonb(i) is distinct from old)
    then raise exception 'RETAINED_INGREDIENT_CHANGED'; end if;
  if (select count(*) from public.menus where catalog_key is not null) <> 11 then raise exception 'CATALOG_COUNT_INVALID'; end if;
end $$;
commit;
