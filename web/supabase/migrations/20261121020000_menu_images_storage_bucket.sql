-- Migration: 20261121020000_menu_images_storage_bucket.sql
-- Setup public bucket for menu images in Supabase Storage if storage schema exists
begin;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'menu-images',
      'menu-images',
      true,
      5242880, -- 5MB
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update set
      public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    -- Setup storage policies if storage.objects exists
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
      -- Public read policy
      drop policy if exists "Public menu-images view" on storage.objects;
      create policy "Public menu-images view"
        on storage.objects for select
        using (bucket_id = 'menu-images');

      -- Authenticated insert policy
      drop policy if exists "Authenticated menu-images insert" on storage.objects;
      create policy "Authenticated menu-images insert"
        on storage.objects for insert
        to authenticated
        with check (bucket_id = 'menu-images');

      -- Authenticated update policy
      drop policy if exists "Authenticated menu-images update" on storage.objects;
      create policy "Authenticated menu-images update"
        on storage.objects for update
        to authenticated
        using (bucket_id = 'menu-images');

      -- Authenticated delete policy
      drop policy if exists "Authenticated menu-images delete" on storage.objects;
      create policy "Authenticated menu-images delete"
        on storage.objects for delete
        to authenticated
        using (bucket_id = 'menu-images');
    end if;
  end if;
end $$;

commit;
