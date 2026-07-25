-- BSK Phase 2 — checkup templates.
--
-- Mirrors the original CheckupTemplate: gender-specific form layouts used to
-- pre-fill the checkup screen (Phase 3). The field layout is a JSON array
-- (matches the original's serialized `fields`); `gender` selects which template
-- applies to a patient (obstetrics/gynecology vs general). Admin-managed.

CREATE TABLE IF NOT EXISTS bsk.checkup_templates (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL,
  title      text,                                    -- printed report title
  gender     text        NOT NULL DEFAULT 'any'
               CHECK (gender IN ('any', 'male', 'female', 'other')),
  photo_num  integer     NOT NULL DEFAULT 0 CHECK (photo_num >= 0),
  fields     jsonb       NOT NULL DEFAULT '[]'::jsonb, -- ordered [{ "label": "..." }]
  deleted    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bsk.checkup_templates IS
  'Checkup form templates. `gender` picks the applicable template per patient; '
  '`fields` is an ordered JSON layout used to pre-fill the Phase 3 checkup form.';

ALTER TABLE bsk.checkup_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_templates' AND policyname='checkup_templates_select_enrolled') THEN
    CREATE POLICY checkup_templates_select_enrolled ON bsk.checkup_templates FOR SELECT USING (bsk.current_role() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_templates' AND policyname='checkup_templates_insert_admin') THEN
    CREATE POLICY checkup_templates_insert_admin ON bsk.checkup_templates FOR INSERT WITH CHECK (bsk.current_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='bsk' AND tablename='checkup_templates' AND policyname='checkup_templates_update_admin') THEN
    CREATE POLICY checkup_templates_update_admin ON bsk.checkup_templates FOR UPDATE
      USING (bsk.current_role() = 'admin') WITH CHECK (bsk.current_role() = 'admin');
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON bsk.checkup_templates TO authenticated;
