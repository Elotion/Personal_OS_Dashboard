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
// The interior fill IS part of this inline string. First attempt
// (2026-08-25) fit a gradient directly to median-row-brightness pixel
// samples from the reference image, fading to transparent by ~50% height --
// but Elo looked at the two side by side and called it out immediately:
// "the blue color is very different... it's not really glowing blue, it's
// just plain blue, and it's too much shade all the way down to the center
// of the box, which is not what I want." Two real, separate problems with
// that first attempt, diagnosed by comparing a live screenshot against the
// reference crops directly:
//   1. Reach: fading to transparent at 50% is genuinely where the
//      reference's brightness curve flattens out, but the visual EFFECT of
//      a normal alpha-blended overlay stays perceptible at much lower
//      alphas than the raw brightness numbers suggested -- so matching the
//      measured curve exactly still read as "shade reaching too far down."
//      Tightened to fully transparent by ~22% instead of ~50%.
//   2. Quality: plain alpha-blending a color onto a dark background just
//      produces a darker, desaturated version of that color -- it reads as
//      tinted paint, not light. A real glow needs to look additive/
//      luminous. Fixed with `background-blend-mode: screen` on this layer,
//      which composites it against the base color the way overlapping
//      light (not overlapping paint) behaves -- same peak color reads
//      noticeably more vibrant/"lit" at the same alpha.
// Border ring is unaffected by this -- that's still the pixel-measured
// `.elo-panel-glow::before`/`::after` treatment in index.css.
export const CARD_CLASS = 'elo-panel-glow';

export const CARD =
  'position:relative;background:' +
  'linear-gradient(to bottom, rgba(90,195,255,0.85) 0%, rgba(40,150,210,0.3) 3%, ' +
  'rgba(15,80,130,0.08) 7%, rgba(0,0,0,0) 13%), ' +
  'oklch(0.145 0.055 240);' +
  'background-blend-mode:screen,normal;' +
  'border:1px solid transparent;border-radius:14px;';
