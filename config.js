// Public Supabase config, stored locally on each device.
// The anon key is public by design; row-level security protects the data.
const KEY = 'gdtp.supabase.config.v1';

export function getConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg.url || !cfg.anonKey) return null;
    return { url: cfg.url.replace(/\/$/, ''), anonKey: cfg.anonKey };
  } catch (_) {
    return null;
  }
}

export function setConfig(url, anonKey) {
  const cfg = {
    url: String(url || '').trim().replace(/\/$/, ''),
    anonKey: String(anonKey || '').trim(),
  };
  localStorage.setItem(KEY, JSON.stringify(cfg));
  return cfg;
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}
