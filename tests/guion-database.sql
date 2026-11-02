-- Run inside BEGIN / ROLLBACK. Never commit test edits.
do $$
declare owner_id uuid := '58c60587-9559-4747-a7bc-a90d36147caa';
begin
 begin
  update public.kairos_documents set data=jsonb_set(data,'{html}','""'::jsonb)
   where user_id=owner_id and document_id='disociados-editable-fiel-v1';
  raise exception 'Empty overwrite should have failed';
 exception when check_violation then null;end;
 begin
  update public.kairos_documents set data=jsonb_set(data,'{html}',to_jsonb(E'\n\t'::text))
   where user_id=owner_id and document_id='disociados-editable-fiel-v1';
  raise exception 'Whitespace overwrite should have failed';
 exception when check_violation then null;end;
 if to_regclass('public.kairos_document_revisions') is not null then raise exception 'Recovery table still exists';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','58c60587-9559-4747-a7bc-a90d36147caa',true);
do $$begin
 update public.kairos_documents set data=data || '{"__save_regression":true}'::jsonb,updated_at=clock_timestamp()
  where document_id='disociados-editable-fiel-v1';
 if not found then raise exception 'Owner cannot save current document';end if;
end $$;
reset role;
