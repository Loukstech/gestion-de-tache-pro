// Les liens publics WorkBuddy exigent le sharecode sur chaque requête.
// Sans lui, le proxy répond 403 avant même d'atteindre le middleware IA.
export function aiUrl(path) {
  if (typeof window === 'undefined') return path
  const code = new URLSearchParams(window.location.search).get('sharecode')
  return code ? `${path}?sharecode=${encodeURIComponent(code)}` : path
}
