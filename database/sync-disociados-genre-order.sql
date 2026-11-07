CREATE OR REPLACE FUNCTION public.sync_disociados_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
 if new.user_id::text = '58c60587-9559-4747-a7bc-a90d36147caa'
    and new.document_id = 'disociados-editable-fiel-v1'
    and jsonb_typeof(new.data->'html') = 'string'
    and length(new.data->>'html') > 0 then
  insert into public.disociados_publication(id,data,updated_at)
  values ('disociados', jsonb_build_object(
   'html',new.data->>'html',
   'coverTitle',new.data->>'coverTitle',
   'coverSynopsis',new.data->>'coverSynopsis',
   'titleSpacing',new.data->'titleSpacing',
   'chapterSpacing',new.data->'chapterSpacing',
   'textSpacing',new.data->'textSpacing',
   'genreTabOrder',new.data->'genreTabOrder'
  ), clock_timestamp())
  on conflict(id) do update set data=excluded.data,updated_at=excluded.updated_at;
 end if;
 return new;
end;
$function$;
UPDATE public.disociados_publication p
SET data=jsonb_set(p.data,'{genreTabOrder}',d.data->'genreTabOrder'),updated_at=clock_timestamp()
FROM public.kairos_documents d
WHERE p.id='disociados' AND d.document_id='disociados-editable-fiel-v1'
AND d.user_id::text='58c60587-9559-4747-a7bc-a90d36147caa'
AND jsonb_typeof(d.data->'genreTabOrder')='array';