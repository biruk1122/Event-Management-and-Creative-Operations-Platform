-- Preserve the existing user-role foreign keys while changing the member label.
UPDATE roles SET name = 'Department Member', updated_at = CURRENT_TIMESTAMP
WHERE name = 'Team Member'
  AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Department Member');

-- Remove only unassigned obsolete system roles. Never delete accounts in a migration.
DELETE FROM roles r
WHERE r.is_system = TRUE AND r.name IN ('Management/Administrator', 'Talent Manager')
  AND NOT EXISTS (SELECT 1 FROM user_role_assignments a WHERE a.role_id = r.id);

UPDATE departments SET name = 'Manager / Event & Office Manager', updated_at = CURRENT_TIMESTAMP
WHERE name = 'Event Management'
  AND NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Manager / Event & Office Manager');

INSERT INTO departments (name, updated_at)
VALUES ('Production', CURRENT_TIMESTAMP), ('Marketing', CURRENT_TIMESTAMP),
       ('Promotion', CURRENT_TIMESTAMP), ('Manager / Event & Office Manager', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;
