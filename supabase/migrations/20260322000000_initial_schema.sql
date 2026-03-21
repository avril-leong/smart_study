-- Extensions
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- subjects
CREATE TABLE subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#00c9ff',
  created_at timestamptz DEFAULT now()
);

-- study_sets
CREATE TABLE study_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users NOT NULL,
  subject_id          uuid REFERENCES subjects(id) ON DELETE SET NULL,
  name                text NOT NULL,
  file_name           text NOT NULL,
  file_type           text NOT NULL,
  extracted_text_path text NOT NULL,
  generation_status   text NOT NULL DEFAULT 'pending'
                      CHECK (generation_status IN ('pending','processing','done','error')),
  last_studied_at     timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON study_sets
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- questions
CREATE TABLE questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_set_id   uuid REFERENCES study_sets(id) ON DELETE CASCADE NOT NULL,
  type           text NOT NULL CHECK (type IN ('mcq','short_answer')),
  question_text  text NOT NULL,
  options        jsonb,
  correct_answer text NOT NULL,
  created_at     timestamptz DEFAULT now()
);

-- question_state (current SM-2 state, one row per user+question)
CREATE TABLE question_state (
  user_id     uuid REFERENCES auth.users NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  ease_factor float NOT NULL DEFAULT 2.5,
  interval    int NOT NULL DEFAULT 1,
  repetitions int NOT NULL DEFAULT 0,
  next_review timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- answer_log (append-only history)
CREATE TABLE answer_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  answer_given text NOT NULL,
  is_correct  boolean NOT NULL,
  answered_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns subjects"       ON subjects      USING (user_id = auth.uid());
CREATE POLICY "user owns study_sets"     ON study_sets    USING (user_id = auth.uid());
CREATE POLICY "user accesses own questions" ON questions
  USING (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()));
CREATE POLICY "user owns question_state" ON question_state USING (user_id = auth.uid());
CREATE POLICY "user owns answer_log"     ON answer_log    USING (user_id = auth.uid());

-- Storage bucket policy (run after creating 'study-files' bucket in dashboard)
CREATE POLICY "users access own files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'study-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RPC: get next question due for review (SM-2 scheduling)
CREATE OR REPLACE FUNCTION get_next_question_due(p_study_set_id uuid, p_user_id uuid)
RETURNS SETOF public.questions AS $$
  SELECT q.* FROM public.questions q
  JOIN public.question_state qs ON qs.question_id = q.id AND qs.user_id = p_user_id
  WHERE q.study_set_id = p_study_set_id AND qs.next_review <= now()
  ORDER BY qs.next_review ASC LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';
