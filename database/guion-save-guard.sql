-- Preserve the current document and automatic saves; do not create recovery copies.
create schema if not exists kairos_private;
revoke all on schema kairos_private from public,anon,authenticated;
create or replace function kairos_private.guard_guion_content()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.document_id='disociados-editable-fiel-v1'
    and length(coalesce(old.data->>'html',''))>0
    and (jsonb_typeof(new.data->'html') is distinct from 'string'
         or coalesce(new.data->>'html','') !~ '[^[:space:]]') then
  raise exception 'Empty manuscript replacement blocked' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function kairos_private.guard_guion_content() from public,anon,authenticated;
drop trigger if exists preserve_guion_revision on public.kairos_documents;
drop trigger if exists guard_guion_content on public.kairos_documents;
create trigger guard_guion_content before update on public.kairos_documents
 for each row execute function kairos_private.guard_guion_content();
drop function if exists kairos_private.preserve_guion_revision();
drop table if exists public.kairos_document_revisions;
-- Remove only recovery copies created during the prior repair.
delete from public.kairos_documents
 where user_id='58c60587-9559-4747-a7bc-a90d36147caa'
 and document_id in (
  'disociados-editable-fiel-v1-backup-20261102-before-restore',
  'disociados-recovery-20261102-before-scope-fix',
  'disociados-empty-20261102-before-scope-fix'
 );
