begin read only;
select jsonb_build_object(
  'extension',(select jsonb_agg(to_jsonb(e)) from (select extname,extversion from pg_extension where extname='pg_cron') e),
  'job',(select jsonb_agg(to_jsonb(j)) from (select jobid,jobname,schedule,active from cron.job where jobname='smart-order-ingredient-stock-reset') j),
  'runs',(select jsonb_agg(to_jsonb(r)) from (select status,start_time,end_time,return_message from cron.job_run_details
    where jobid in (select jobid from cron.job where jobname='smart-order-ingredient-stock-reset') order by start_time desc limit 3) r),
  'defaults',(select jsonb_build_object('carry_forward',count(*) filter(where reset_every_days is null),
    'scheduled',count(*) filter(where reset_every_days is not null)) from public.ingredients)
) as verification;
commit;
