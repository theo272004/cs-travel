/**
 * theme.js
 * =============================================================================
 * PROPOSITO:
 *   Gestion del tema claro/oscuro de toda la app. El tema se guarda en
 *   localStorage y se aplica como atributo data-theme en <html>, de modo que
 *   los overrides CSS [data-theme="dark"] tomen efecto en cualquier pantalla.
 * =============================================================================
 */

const STORAGE_KEY = 'cs_travel_theme';

/** Devuelve el tema guardado ('dark' | 'light'); por defecto 'light'. */
export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

/** Aplica el tema al documento (atributo en <html>). */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

/** Alterna el tema, lo guarda y lo aplica. Devuelve el tema resultante. */
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

/** Inicializa el tema al cargar la app. */
export function initTheme() {
  applyTheme(getTheme());
}
