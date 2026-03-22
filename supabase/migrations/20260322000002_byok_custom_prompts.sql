-- supabase/migrations/20260322000002_byok_custom_prompts.sql

-- New table: one row per user, stores BYOK key (encrypted) and prompt prefs
CREATE TABLE user_ai_settings (
  user_id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'deepseek'
                       CHECK (provider IN ('openai', 'deepseek', 'openrouter')),
  model                text NOT NULL DEFAULT 'deepseek-chat',
  encrypted_key        text,        -- AES-256-GCM ciphertext+authTag (hex); NULL = no BYOK
  key_iv               text,        -- 12-byte IV (hex); NULL when encrypted_key is NULL
  global_custom_prompt text,        -- user's global custom instruction; NULL = none
  base_prompt          text,        -- user's editable base prompt; NULL = use server default
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns ai settings" ON user_ai_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add per-study-set custom prompt to study_sets
ALTER TABLE study_sets ADD COLUMN custom_prompt text; -- NULL = use global default
