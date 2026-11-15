// RUSTLINE DEPOT — the look plan, in one place.
// Dusk at an industrial container yard: cold slate and steel, hazard amber as the one
// accent, rust orange for the enemy team, signal teal for the player's team. The same
// names are the CSS custom properties in index.html, so HUD and world never disagree.
export const PALETTE = {
  canvas: '#171a1f',
  surface: '#20242b',
  hairline: '#313842',
  ink: '#ece7db',
  muted: '#9aa3ab',
  accent: '#f5a623',
  rust: '#d95f2b',
  teal: '#2ec4a6',
  danger: '#e5484d',
  sky: '#232a33',
};

export function shade(name) {
  return PALETTE[name];
}
