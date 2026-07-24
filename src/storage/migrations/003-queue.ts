// Append-only after release: change suggestion rules by adding a migration that
// replaces the trigger, then update the queue parity contract in the same change.
export const queueMigration = {
  version: 3,
  sql: `
    ALTER TABLE core_messages ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array');

    UPDATE core_messages
    SET tags_json = (
      SELECT json_group_array(tag)
      FROM (
        SELECT 'explanation' AS tag, 1 AS position
        WHERE length(core_messages.text) >= 140
          OR lower(core_messages.text) LIKE '% because %'
          OR lower(core_messages.text) LIKE '% therefore %'
          OR lower(core_messages.text) LIKE '%this means%'
        UNION ALL
        SELECT 'question', 2 WHERE instr(core_messages.text, '?') > 0
        UNION ALL
        SELECT 'disagreement', 3
        WHERE lower(core_messages.text) LIKE '%i don''t think%'
          OR lower(core_messages.text) LIKE '%i do not think%'
          OR lower(core_messages.text) LIKE '%not convinced%'
          OR lower(core_messages.text) LIKE '%disagree%'
          OR lower(core_messages.text) LIKE '%however%'
        UNION ALL
        SELECT 'request', 4
        WHERE lower(core_messages.text) LIKE '%please%'
          OR lower(core_messages.text) LIKE '%can you%'
          OR lower(core_messages.text) LIKE '%could you%'
          OR lower(core_messages.text) LIKE '%would you%'
        UNION ALL
        SELECT 'link', 5
        WHERE lower(core_messages.text) LIKE '%http://%'
          OR lower(core_messages.text) LIKE '%https://%'
          OR EXISTS (
            SELECT 1 FROM json_each(core_messages.materials_json)
            WHERE json_extract(value, '$.kind') = 'link'
          )
        UNION ALL
        SELECT 'evidence', 6
        WHERE lower(core_messages.text) LIKE '%screenshot%'
          OR lower(core_messages.text) LIKE '% image%'
          OR EXISTS (
            SELECT 1 FROM json_each(core_messages.materials_json)
            WHERE json_extract(value, '$.kind') = 'image'
              AND json_extract(value, '$.role') IN ('evidence', 'reference')
          )
        ORDER BY position
      )
    );

    CREATE TRIGGER core_messages_suggest_tags_after_insert
    AFTER INSERT ON core_messages
    BEGIN
      UPDATE core_messages
      SET tags_json = (
        SELECT json_group_array(tag)
        FROM (
          SELECT 'explanation' AS tag, 1 AS position
          WHERE length(NEW.text) >= 140
            OR lower(NEW.text) LIKE '% because %'
            OR lower(NEW.text) LIKE '% therefore %'
            OR lower(NEW.text) LIKE '%this means%'
          UNION ALL
          SELECT 'question', 2 WHERE instr(NEW.text, '?') > 0
          UNION ALL
          SELECT 'disagreement', 3
          WHERE lower(NEW.text) LIKE '%i don''t think%'
            OR lower(NEW.text) LIKE '%i do not think%'
            OR lower(NEW.text) LIKE '%not convinced%'
            OR lower(NEW.text) LIKE '%disagree%'
            OR lower(NEW.text) LIKE '%however%'
          UNION ALL
          SELECT 'request', 4
          WHERE lower(NEW.text) LIKE '%please%'
            OR lower(NEW.text) LIKE '%can you%'
            OR lower(NEW.text) LIKE '%could you%'
            OR lower(NEW.text) LIKE '%would you%'
          UNION ALL
          SELECT 'link', 5
          WHERE lower(NEW.text) LIKE '%http://%'
            OR lower(NEW.text) LIKE '%https://%'
            OR EXISTS (
              SELECT 1 FROM json_each(NEW.materials_json)
              WHERE json_extract(value, '$.kind') = 'link'
            )
          UNION ALL
          SELECT 'evidence', 6
          WHERE lower(NEW.text) LIKE '%screenshot%'
            OR lower(NEW.text) LIKE '% image%'
            OR EXISTS (
              SELECT 1 FROM json_each(NEW.materials_json)
              WHERE json_extract(value, '$.kind') = 'image'
                AND json_extract(value, '$.role') IN ('evidence', 'reference')
            )
          ORDER BY position
        )
      )
      WHERE id = NEW.id;
    END;
  `,
} as const;
