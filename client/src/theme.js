export const ENTITY_META = {
  UCLA: '🎓', HEMS: '🚀', WORK: '💼', FINANCE: '💰',
  HEALTH: '❤️', LEARNING: '📚', PERSONAL: '👤',
};

export const ENTITY_OPTIONS = Object.keys(ENTITY_META);

export const TF_COLOR = {
  'TODAY': 'oklch(0.62 0.2 235)',
  'THIS WEEK': 'oklch(0.86 0.17 195)',
  'THIS MONTH': 'oklch(0.8 0.19 200)',
  'SOMEDAY': 'oklch(0.5 0.025 228)',
};

export const TF_ORDER = ['TODAY', 'THIS WEEK', 'THIS MONTH', 'SOMEDAY'];

export const GOLD = 'oklch(0.86 0.17 195)';

export const GLOW_SOFT =
  '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035), inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3)';

export const GLOW_MED =
  '0 0 19px oklch(0.8 0.19 200 / 0.09), 0 0 38px oklch(0.62 0.2 235 / 0.06), inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3)';

export const GLOW_STRONG =
  '0 0 24px oklch(0.8 0.19 200 / 0.19), 0 0 48px oklch(0.62 0.2 235 / 0.11), inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3)';

export const CARD =
  'background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:14px;box-shadow:' + GLOW_SOFT + ';';
