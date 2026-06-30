-- Add 'duocolor' to the style check constraint
ALTER TABLE icons DROP CONSTRAINT IF EXISTS icons_style_check;
ALTER TABLE icons ADD CONSTRAINT icons_style_check
  CHECK (style IN ('line', 'filled', 'duotone', 'duocolor'));
