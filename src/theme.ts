// Leser fargene fra CSS-variablene, så lerretene følger lyst og mørkt tema.

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function isDark(): boolean {
  return darkQuery.matches;
}

export function onThemeChange(fn: () => void): void {
  darkQuery.addEventListener('change', fn);
}
