/* Single source of truth for property-group colors.
 * The matching CSS classes live in styles.css (.color-brown etc.) — keep both in sync. */
export const GROUP_COLORS: Record<string, string> = {
  brown: '#8b5a3c',
  'light-blue': '#63b8d5',
  pink: '#cf5b9d',
  orange: '#e98a32',
  red: '#c9423b',
  yellow: '#e0bd3d',
  green: '#438d64',
  'dark-blue': '#315b92',
  railroad: '#5b625e',
  utility: '#b08a45'
};

/* Accent used for non-street spaces in board browsers/navigators. */
export const SPACE_FALLBACK_COLOR = '#b08a45';

export const PLAYER_COLORS = ['#447760', '#b64c45', '#406a98', '#b38643', '#785782', '#39433e'] as const;
