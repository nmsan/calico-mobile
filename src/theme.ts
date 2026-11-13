/**
 * Calico brand tokens, taken from the brand artwork: a white ground, a black serif
 * wordmark and the shell's rust / terracotta / sand petals.
 * Brand colours carry identity and focus. Status colours (owed, low, ok) carry meaning only.
 */
export const colors = {
  paper: '#FAF8F5', // screen background
  surface: '#FFFFFF', // cards, sheets, bars
  line: '#ECE5DC', // borders and dividers
  pressed: '#F4EEE6', // pressed rows

  ink: '#17130F', // text, primary buttons (wordmark black)
  ink2: '#4A423B', // secondary text
  muted: '#857A70', // captions, placeholders
  faint: '#B9AEA3', // disabled icons, chevrons

  rust: '#9B3F22', // active tab, links, accents
  terra: '#C95F37', // highlights
  sand: '#E1CEB1',
  shell: '#F7EEE2', // secondary buttons, segmented track, avatars

  owed: '#B3261E',
  owedBg: '#FBEAE8',
  low: '#9A5800',
  lowBg: '#FDF0DC',
  ok: '#2E6B45',
  okBg: '#E5F1E8',

  scrim: 'rgba(23, 19, 15, 0.45)',
};

export const fonts = {
  /** Young Serif, loaded in App.tsx. Used for titles and hero numbers. */
  serif: 'YoungSerif',
};

export const radius = { sm: 10, md: 12, lg: 16, pill: 999 };

export const space = { gutter: 16 };
