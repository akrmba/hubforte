ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS status text;

UPDATE tenants
SET status = CASE
  WHEN suspended = true THEN 'suspended'
  ELSE 'active'
END
WHERE status IS NULL
   OR status NOT IN ('active', 'suspended');

ALTER TABLE tenants
ALTER COLUMN status SET DEFAULT 'active';

UPDATE tenants
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE tenants
ALTER COLUMN status SET NOT NULL;
