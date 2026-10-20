select json_build_object('buckets',(select count(*) from storage.buckets),'objects',(select count(*) from storage.objects),
 'seqs',(select json_object_agg(schemaname||'.'||sequencename, last_value order by schemaname, sequencename) from pg_sequences where schemaname in ('public','auth')));
