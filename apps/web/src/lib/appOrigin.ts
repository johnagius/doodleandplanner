/** The origin + base path the app is served from, without a trailing slash. */
export function appOrigin(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}`;
}
