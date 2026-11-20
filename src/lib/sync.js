/**
 * Client Supabase public pour la synchronisation TaskVox Pro.
 * Seules l'URL du projet et la clé publishable sont utilisées : aucun secret
 * n'est embarqué dans l'application.
 */
const SUPABASE_URL = 'https://yslmrrfyeafnvdsmjvng.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_3HFlR8sIh5p41g_nkRs7qA_UQ1G10Tb'
const SESSION_KEY = 'taskvox.sync.session.v1'

const decodeJwt = (token) => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

export function getSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session?.access_token ? session : null
  } catch {
    return null
  }
}

function saveSession(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    email: data.user?.email || data.email || null,
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

function clearSession() {
  window.localStorage.removeItem(SESSION_KEY)
}

async function request(path, { method = 'GET', body, auth = true, prefer } = {}) {
  const session = getSession()
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }
  if (auth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  if (prefer) headers.Prefer = prefer

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const data = await response.json()
      detail = data.msg || data.message || data.error_description || data.error || ''
    } catch {
      /* réponse non JSON */
    }
    throw new Error(detail || `Erreur Supabase (${response.status})`)
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return null
  return response.json()
}

async function ensureToken() {
  const session = getSession()
  if (!session) throw new Error('Connexion requise.')
  if (session.expires_at && session.expires_at > Date.now() + 60_000) return session

  const data = await request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    auth: false,
    body: { refresh_token: session.refresh_token },
  })
  return saveSession({ ...data, email: session.email })
}

function userIdFrom(session) {
  return decodeJwt(session.access_token).sub
}

export async function signIn(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    auth: false,
    body: { email, password },
  })
  return saveSession(data)
}

export async function signUp(email, password) {
  const data = await request('/auth/v1/signup', {
    method: 'POST',
    auth: false,
    body: { email, password },
  })
  if (data?.access_token) return saveSession(data)
  return signIn(email, password)
}

export async function signOut() {
  try {
    await request('/auth/v1/logout', { method: 'POST' })
  } catch {
    /* déconnexion locale même si le réseau est indisponible */
  }
  clearSession()
}

export async function pullTasks() {
  const session = await ensureToken()
  const userId = userIdFrom(session)
  if (!userId) throw new Error('Session invalide. Reconnecte-toi.')
  const rows = await request(`/rest/v1/taskvox_sync?select=tasks,updated_at&user_id=eq.${encodeURIComponent(userId)}`)
  return rows?.[0] || null
}

export async function pushTasks(tasks) {
  const session = await ensureToken()
  const userId = userIdFrom(session)
  if (!userId) throw new Error('Session invalide. Reconnecte-toi.')
  const updatedAt = new Date().toISOString()
  await request('/rest/v1/taskvox_sync', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ user_id: userId, tasks, updated_at: updatedAt }],
  })
  return updatedAt
}

export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
