-- Run after database/guion-revisions.sql inside a transaction that will ROLLBACK.
do $$
declare
 owner_id uuid := '58c60587-9559-4747-a7bc-a90d36147caa';
 old_row public.kairos_documents%rowtype;
 test_data jsonb;
 original_hash text;
begin
 select * into strict old_row from public.kairos_documents where user_id=owner_id and document_id='disociados-editable-fiel-v1';
 original_hash := md5(old_row.data::text);
 -- First save archives the original; second save archives the previous edit.
 test_data := old_row.data || '{"__regression_test":1}'::jsonb;
 update public.kairos_documents set data=test_data,updated_at=clock_timestamp() where user_id=owner_id and document_id=old_row.document_id;
 if not exists(select 1 from public.kairos_document_revisions where user_id=owner_id and document_id=old_row.document_id and fingerprint=original_hash) then raise exception 'Original snapshot missing';end if;
 update public.kairos_documents set data=test_data || '{"__regression_test":2}'::jsonb,updated_at=clock_timestamp() where user_id=owner_id and document_id=old_row.document_id;
 if not exists(select 1 from public.kairos_document_revisions where user_id=owner_id and document_id=old_row.document_id and data=test_data) then raise exception 'Prior confirmed save missing';end if;
 begin
  update public.kairos_documents set data=jsonb_set(data,'{html}','""'::jsonb) where user_id=owner_id and document_id=old_row.document_id;
  raise exception 'Empty overwrite should have failed';
 exception when check_violation then null;
 end;
 begin
  update public.kairos_documents set data=jsonb_set(data,'{html}',to_jsonb(E'\n\t'::text)) where user_id=owner_id and document_id=old_row.document_id;
  raise exception 'Whitespace overwrite should have failed';
 exception when check_violation then null;end;
 if not exists(select 1 from public.kairos_documents where user_id=owner_id and document_id=old_row.document_id and length(data->>'html')>0) then raise exception 'Empty overwrite changed the live row';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','58c60587-9559-4747-a7bc-a90d36147caa',true);
do $$begin
 if not exists(select 1 from public.kairos_document_revisions where document_id='disociados-editable-fiel-v1') then raise exception 'Owner cannot read revisions';end if;
 -- Trigger must work for authenticated saves despite no INSERT grant on history.
 update public.kairos_documents set data=data || '{"__regression_test":3}'::jsonb,updated_at=clock_timestamp() where document_id='disociados-editable-fiel-v1';
 begin
  insert into public.kairos_document_revisions(user_id,document_id,source_updated_at,data) values(auth.uid(),'forged',now(),'{}');
  raise exception 'Client forged immutable history';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
do $$begin
 if exists(select 1 from public.kairos_document_revisions) then raise exception 'Other user can read private history';end if;
end $$;
reset role;
set local role anon;
do $$begin
 begin
  perform count(*) from public.kairos_document_revisions;
  raise exception 'Anonymous history read allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
