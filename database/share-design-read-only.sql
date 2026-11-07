CREATE TABLE public.design_publication (
 id text PRIMARY KEY CHECK (id='design'),
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.design_publication ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_publication FROM anon, authenticated;
GRANT SELECT ON public.design_publication TO anon, authenticated;
CREATE POLICY "Read shared design" ON public.design_publication FOR SELECT TO anon, authenticated USING (id='design');
CREATE OR REPLACE FUNCTION kairos_private.sync_design_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NEW.document_id <> 'ceo-borrador-v1' OR NEW.user_id::text <> '58c60587-9559-4747-a7bc-a90d36147caa' THEN RETURN NEW; END IF;
 snapshot := CASE WHEN NEW.data->>'publicationMode'='creation' AND jsonb_typeof(NEW.data->'creationDraft')='object' THEN NEW.data->'creationDraft' ELSE NEW.data END;
 IF jsonb_typeof(snapshot->'html')='string' AND length(snapshot->>'html')>0 THEN
  INSERT INTO public.design_publication(id,data,updated_at)
  VALUES ('design',jsonb_build_object('format','kairos-disociados-document','version',2,
  'html',snapshot->>'html','coverTitle',snapshot->>'coverTitle','coverSynopsis',snapshot->>'coverSynopsis',
  'titleSpacing',snapshot->'titleSpacing','chapterSpacing',snapshot->'chapterSpacing','textSpacing',snapshot->'textSpacing',
  'editorialRevision',snapshot->'editorialRevision','publishedMigration',snapshot->'publishedMigration'),clock_timestamp())
  ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION kairos_private.sync_design_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_design_publication AFTER INSERT OR UPDATE OF data ON public.kairos_documents
FOR EACH ROW EXECUTE FUNCTION kairos_private.sync_design_publication();
UPDATE public.kairos_documents SET data=data WHERE document_id='ceo-borrador-v1' AND user_id::text='58c60587-9559-4747-a7bc-a90d36147caa';