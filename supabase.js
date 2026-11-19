// Supabase REST client using fetch only (no SDK, no build step).
import { getConfig } from './config.js';

let session = null;

const SESSION_KEY = 'gdtp.session.v1';

try {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) session = JSON.parse(raw);
} catch (_) { session = null; }

export function getSession() {
  return session;
}

export function setSession(value) {
  session = value;
  try {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  } catch (_) { /* noop */ }
}

export function isConfigured() {
  return !!getConfig();
}

function headers() {
  const cfg = getConfig();
  const h = {
    'apikey': cfg.anonKey,
    'Content-Type': 'application/json',
  };
  if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
  return h;
}

async function request(path, options = {}) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Configuration manquante');
  const res = await fetch(`${cfg.url}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const message = data?.msg || data?.message || data?.error_description || `Erreur ${res.status}`;
    throw new Error(String(message).slice(0, 200));
  }
  return data;
}

export async function signUp(email, password) {
  const data = await request('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data?.access_token) setSession({ access_token: data.access_token, user: data.user });
  return data;
}

export async function signIn(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setSession({ access_token: data.access_token, user: data.user });
  return session;
}

export async function signOut() {
  if (session) {
    try { await request('/auth/v1/logout', { method: 'POST' }); } catch (_) { /* noop */ }
  }
  setSession(null);
}

export async function fetchTasks() {
  const rows = await request('/rest/v1/tasks?select=*&order=created_at.desc', { method: 'GET' });
  return rows || [];
}

export async function insertTask(task) {
  const rows = await request('/rest/v1/tasks', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(task),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateTask(id, patch) {
  const rows = await request(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteTask(id) {
  await request(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteDoneTasks() {
  await request('/rest/v1/tasks?done=eq.true', { method: 'DELETE' });
}

export async function classifyText(text) {
  return request('/functions/v1/classify-task', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function userEmail() {
  return session?.user?.email || '';
}
