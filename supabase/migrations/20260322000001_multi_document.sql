-- supabase/migrations/20260322000001_multi_document.sql

CREATE TABLE study_set_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_set_id        uuid REFERENCES study_sets(id) ON DELETE CASCADE NOT NULL,
  file_name           text NOT NULL,
  file_type           text NOT NULL,
  extracted_text_path text NOT NULL,
  uploaded_at         timestamptz DEFAULT now()
);

ALTER TABLE study_set_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns study_set_documents" ON study_set_documents
  USING  (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()))
  WITH CHECK (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()));

-- Make legacy single-doc columns nullable
ALTER TABLE study_sets ALTER COLUMN file_name        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN file_type        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN extracted_text_path DROP NOT NULL;

-- Backfill existing study sets into study_set_documents
INSERT INTO study_set_documents (study_set_id, file_name, file_type, extracted_text_path)
SELECT id, file_name, file_type, extracted_text_path
FROM study_sets
WHERE extracted_text_path IS NOT NULL;
