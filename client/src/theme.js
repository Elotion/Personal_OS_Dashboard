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
// ARCHITECTURAL REWRITE (2026-08-25), root cause finally identified. Every
// prior pass (percentage-based interior gradients, screen blend mode, tighter
// vs. looser fade points) was still fundamentally the wrong shape of effect:
// a gradient FILL whose depth is a percentage of the box's own height is
// mathematically guaranteed to look deeper on a tall box (CALENDAR, HABITS)
// than a short one (OPERATOR) even with identical color stops, because "20%
// of 700px" and "20% of 150px" are different numbers of pixels. Elo named
// this precisely: "the glow shade are not supposed to be different or
// proportional to the size of the boxes." The reference isn't a shading
// effect at all -- it's an edge-lighting effect: a dark panel with an
// illuminated TOP RIM and a shallow bloom immediately below it, both a
// FIXED PIXEL depth regardless of the panel's height. Rebuilt as three
// independent layers instead of one gradient trying to do everything:
//   A. BASE BORDER -- a plain, uniform, subtle 1px border (this string).
//      No gradient, no directionality -- the top/side/bottom brightness
//      difference comes entirely from layers B and C stacking ON TOP of
//      this at the top edge only, not from this border itself varying.
//   B. TOP RIM -- a bright, thin (1px) horizontal line exactly at the top
//      edge (`.elo-panel-glow::before` in index.css), gradiented
//      left-to-right (brighter center, dimmer at the rounded corners) with
//      a small box-shadow bloom immediately around it.
//   C. TOP BLOOM -- a soft glow extending exactly 28px down from the top
//      edge (`.elo-panel-glow::after`), using gradient stops in PX, not %
//      -- e.g. `rgba(...) 8px, rgba(...) 18px, transparent 28px` -- which
//      is the actual mechanism that makes this height-independent. A
//      600px-tall card and a 150px-tall card both get exactly a 28px glow,
//      not a proportional one.
// CARD_CLASS (`elo-panel-glow`, defined here) carries layers B and C in
// index.css, since pseudo-elements can't be expressed through this
// codebase's inline `css()` helper -- every CARD consumer must pair
// `className={CARD_CLASS}` with this style string. Interior background
// stays a single flat dark color -- the "almost entirely dark" panel
// interior Elo asked for -- with no vertical gradient of any kind on it;
// all the glow lives in the fixed-depth pseudo-element layers instead.
export const CARD_CLASS = 'elo-panel-glow';

export const CARD =
  'position:relative;background:oklch(0.145 0.055 240);' +
  'border:1px solid rgba(20,125,185,0.42);border-radius:14px;' +
  'box-shadow:inset 0 1px 0 rgba(110,210,255,0.10);';
