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
// The border ring/outer glow is NOT part of this inline string -- pseudo-
// elements (::before/::after) can't be expressed through this codebase's
// inline `css()` helper, only through a real class. That class is
// `CARD_CLASS` (defined here, implemented in index.css as `.elo-panel-glow`)
// -- every CARD consumer must add `className={CARD_CLASS}` alongside this
// style string for the border ring to actually render.
//
// The interior fill IS part of this inline string, and it was rebuilt
// (2026-08-25, same pixel-sampling pass as the border ring) after Elo
// pointed out the reference has a second, separate effect beyond the thin
// border line: "a little glow... glowing lights going under, like inside
// the box... very vibrant glow on the top... stringy blue going downward
// ... they don't have it anywhere on the side or at the bottom." That's a
// real, distinct thing from the border ring -- a genuinely bright cyan wash
// bleeding down from the TOP EDGE into the box interior, fully faded to the
// plain dark base color by roughly halfway down, with no equivalent glow
// bleeding in from the sides or bottom. Measured directly (median pixel
// brightness across rows at increasing depth into the OPERATOR box,
// filtered to ignore text/icons): interior brightness starts near the
// border's own peak color right at the top edge, decays fast through the
// first ~20% of the box height, and is fully flat at the dark floor color
// by ~48-50% -- the multi-stop gradient below is a direct fit to that
// measured curve, layered as a fading-to-transparent overlay on top of the
// plain base card color (so below ~50% height it's pixel-identical to the
// old flat background, and the glow is purely additive above that).
export const CARD_CLASS = 'elo-panel-glow';

export const CARD =
  'position:relative;background:' +
  'linear-gradient(to bottom, rgba(80,172,228,0.85) 0%, rgba(20,80,130,0.55) 6%, ' +
  'rgba(7,48,90,0.32) 16%, rgba(3,26,56,0.16) 32%, rgba(0,10,28,0) 50%), ' +
  'oklch(0.145 0.055 240);' +
  'border:1px solid transparent;border-radius:14px;';
