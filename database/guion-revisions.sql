-- Private, immutable recovery copies for Guión. Current text is never changed here.
create schema if not exists kairos_private;
revoke all on schema kairos_private from public, anon, authenticated;
create table if not exists public.kairos_document_revisions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 document_id text not null,
 source_updated_at timestamptz not null,
 archived_at timestamptz not null default clock_timestamp(),
 data jsonb not null,
 fingerprint text generated always as (md5(data::text)) stored,
 html_length integer generated always as (length(coalesce(data->>'html',''))) stored,
 unique(user_id,document_id,source_updated_at,fingerprint)
);
alter table public.kairos_document_revisions enable row level security;
revoke all on public.kairos_document_revisions from public,anon,authenticated;
grant select on public.kairos_document_revisions to authenticated;
grant all on public.kairos_document_revisions to service_role;
create policy "Read own document recovery versions" on public.kairos_document_revisions
 for select to authenticated using ((select auth.uid()) = user_id);
create index kairos_document_revisions_owner_recent
 on public.kairos_document_revisions(user_id,document_id,source_updated_at desc,archived_at desc);
create or replace function kairos_private.preserve_guion_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.document_id <> 'disociados-editable-fiel-v1' then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if (select auth.uid()) is not null and (select auth.uid()) <> old.user_id then
  raise exception 'Document owner mismatch' using errcode='42501';
 end if;
 if tg_op='UPDATE' and old.data is not distinct from new.data then return new; end if;
 -- Even old editor tabs cannot silently replace a nonempty manuscript with ''.
 if tg_op='UPDATE' and length(coalesce(old.data->>'html',''))>0
    and (jsonb_typeof(new.data->'html') is distinct from 'string'
         or coalesce(new.data->>'html','') !~ '[^[:space:]]') then
  raise exception 'Empty manuscript replacement blocked; use document recovery versions'
   using errcode='23514';
 end if;
 insert into public.kairos_document_revisions(user_id,document_id,source_updated_at,data)
 values(old.user_id,old.document_id,old.updated_at,old.data)
 on conflict(user_id,document_id,source_updated_at,fingerprint) do nothing;
 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function kairos_private.preserve_guion_revision() from public,anon,authenticated;
create trigger preserve_guion_revision before update or delete on public.kairos_documents
 for each row execute function kairos_private.preserve_guion_revision();
-- Seed a recovery checkpoint without updating the current document or publication.
insert into public.kairos_document_revisions(user_id,document_id,source_updated_at,data)
 select user_id,document_id,updated_at,data from public.kairos_documents
 where document_id='disociados-editable-fiel-v1'
 on conflict(user_id,document_id,source_updated_at,fingerprint) do nothing;
