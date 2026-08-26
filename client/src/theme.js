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
// per Elo's explicit request. Rebuilt directly against a real screenshot of
// the target UI (2026-08-25). Elo's own correction after the first
// screenshot-matched attempt: the top-to-bottom fade he wants lives in the
// SILHOUETTE -- the glowing outline/border itself -- not primarily in the
// box's interior fill. So the interior gradient here is now just a subtle
// assist (kept faint so the panel doesn't look flat), while the outer glow
// hugging the border is the part that's deliberately asymmetric: bright and
// tight right at the top edge, tapering to almost nothing by the bottom
// edge -- built from two box-shadow layers (a small-blur, brighter one with
// a slight negative y-offset concentrated above/at the top, and a
// wider-blur, much lower-opacity one with a positive y-offset that reads as
// falloff rather than a second glow source), plus a bright inset top edge
// line vs. a dark inset bottom edge line reinforcing the same direction on
// the border's own bevel. Corner radius stays rounded (14px) since
// box-shadow (unlike border-image) follows border-radius correctly.
export const CARD =
  'background:linear-gradient(to bottom, oklch(0.19 0.06 236), oklch(0.145 0.055 240) 55%);' +
  'border:1px solid oklch(0.55 0.14 231 / 0.9);border-radius:14px;box-shadow:' +
  '0 -1px 9px oklch(0.62 0.15 231 / 0.45), 0 5px 16px oklch(0.55 0.14 231 / 0.07), ' +
  'inset 0 1px 0 oklch(0.68 0.14 230 / 0.4), inset 0 -1px 0 oklch(0.03 0 0 / 0.5);';
