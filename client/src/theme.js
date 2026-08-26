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
// per Elo's explicit request.
//
// The border/glow itself (2026-08-25, final pass) is NOT part of this
// inline string -- Elo supplied the exact CSS technique he wanted (a real
// mask-composite gradient border plus a top-focused glow), and pseudo-
// elements (::before/::after) can't be expressed through this codebase's
// inline `css()` helper, only through a real class. That class is
// `CARD_CLASS` (defined here, implemented in index.css as `.elo-panel-glow`)
// -- every CARD consumer must add `className={CARD_CLASS}` alongside this
// style string for the border/glow to actually render. This inline string
// only carries what a plain inline style CAN express: the interior fill
// (a faint top-lit gradient wash, left as-is per Elo's explicit "don't
// alter the background, only the border/glow treatment"), a transparent
// placeholder border (keeps the box-model identical to when a real 1px
// border was set here, so nothing shifts by a pixel now that the visible
// border moved to the pseudo-element), border-radius, and position:relative
// (required so the pseudo-elements, which are position:absolute, anchor to
// this box and not some further-out ancestor).
export const CARD_CLASS = 'elo-panel-glow';

export const CARD =
  'position:relative;background:linear-gradient(to bottom, oklch(0.19 0.06 236), oklch(0.145 0.055 240) 55%);' +
  'border:1px solid transparent;border-radius:14px;';
