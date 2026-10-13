/** Supabase Edge Runtime exposes window as a global alias, without a DOM.
 * A real browser remains rejected even if it defines a Deno-shaped global.
 * This guard is defense in depth; JWT/consent/SQL grants are the authority boundary.
 */
export function isGarminBrowserRuntime() {
  return typeof window !== 'undefined' && (typeof document !== 'undefined' || typeof globalThis.Deno?.version?.deno !== 'string');
}
