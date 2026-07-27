/** Réglage de thème exposé à l'intégration, dans la langue de l'interface. */
export type ThemePref = 'auto' | 'clair' | 'sombre';

const DEFAULT_ACCENT = '#2b4a78';

/** Le thème effectif : l'attribut posé sur `<html>` prime sur le système. */
export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Fige le thème au chargement ; `auto` laisse le système décider. */
export function applyThemePref(pref: ThemePref): void {
  if (pref === 'clair') document.documentElement.setAttribute('data-theme', 'light');
  else if (pref === 'sombre') document.documentElement.setAttribute('data-theme', 'dark');
}

export function toggleTheme(): void {
  document.documentElement.setAttribute('data-theme', isDark() ? 'light' : 'dark');
}

/**
 * Applique la couleur d'accent choisie. En sombre, elle est éclaircie : la
 * teinte de marque telle quelle n'y passe pas le contraste sur fond d'encre.
 */
export function applyAccent(accent: string | undefined): void {
  const root = document.documentElement;

  if (!accent || accent.toLowerCase() === DEFAULT_ACCENT) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--on-accent');
    return;
  }

  if (isDark()) {
    root.style.setProperty('--accent', `color-mix(in oklab, ${accent} 42%, #EEEAE0)`);
    root.style.setProperty('--on-accent', '#12130F');
  } else {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--on-accent', '#FFFDF8');
  }
}
