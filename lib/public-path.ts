/**
 * Prefix a public/ URL with the GitHub Pages basePath.
 * NEXT_PUBLIC_BASE_PATH is inlined at build time (empty in local dev).
 */
export function publicPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
