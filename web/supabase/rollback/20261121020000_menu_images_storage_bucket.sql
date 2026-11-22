-- Rollback: 20261121020000_menu_images_storage_bucket.sql
begin;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
      drop policy if exists "Public menu-images view" on storage.objects;
      drop policy if exists "Authenticated menu-images insert" on storage.objects;
      drop policy if exists "Authenticated menu-images update" on storage.objects;
      drop policy if exists "Authenticated menu-images delete" on storage.objects;
    end if;

    delete from storage.buckets where id = 'menu-images';
  end if;
end $$;

commit;
