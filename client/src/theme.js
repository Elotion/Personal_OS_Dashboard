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

// Shared "decently sized box" container -- HOME's cards, CRM's category
// groups, BRAIN's entity cards, JOURNAL's entries, HEALTH's panels, etc.
// Deliberately NOT used by small interactive chrome (tab switchers, toggle
// pills, individual task/habit rows -- those keep their own inline styles),
// per Elo's explicit request (2026-08-25): a subtle silhouette/contrast
// tune against the page background, in this app's own existing blue, not a
// new color. Background deepened slightly relative to the page
// (oklch(0.12 0.06 240)) for a touch more separation; border shifted a
// little richer/more saturated for a sharper edge; the bevel highlight
// (the two inset shadows already in GLOW_SOFT) bumped slightly stronger for
// more of a "raised glass panel" read. Kept deliberately restrained -- Elo's
// own word was "subtle" twice in the same sentence.
export const CARD =
  'background:oklch(0.155 0.075 238);border:1px solid oklch(0.62 0.19 210);border-radius:14px;box-shadow:' +
  '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035), ' +
  'inset 1px 1px 0 oklch(0.95 0.02 200 / 0.1), inset -1px -1px 0 oklch(0.05 0 0 / 0.35);';
