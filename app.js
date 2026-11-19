import { getConfig, setConfig, clearConfig } from './config.js';
import * as api from './supabase.js';
import { Voice } from './voice.js';

const $ = (id) => document.getElementById(id);
const voice = new Voice();

let tasks = [];
let filter = { status: 'all', priority: 'all', category: 'all', query: '' };
let editingId = null;
let authMode = 'login';
let deferredInstall = null;
let toastTimer = null;
let pendingTranscript = '';

const PRIORITIES = {
  high: { label: 'Haute', color: 'var(--danger)' },
  medium: { label: 'Moyenne', color: 'var(--warn)' },
  low: { label: 'Basse', color: 'var(--ok)' },
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) node.append(child);
  return node;
}

function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3600);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

function dueInfo(task) {
  if (!task.due) return null;
  if (task.due < todayISO()) return { cls: 'due-late', label: `En retard · ${formatDate(task.due)}` };
  if (task.due === todayISO()) return { cls: 'due-soon', label: "Aujourd'hui" };
  return { cls: '', label: formatDate(task.due) };
}

function showScreen(name) {
  $('setup-screen').hidden = name !== 'setup';
  $('auth-screen').hidden = name !== 'auth';
  $('main-app').hidden = name !== 'app';
}

function showView(name) {
  $('view-assistant').hidden = name !== 'assistant';
  $('view-tasks').hidden = name !== 'tasks';
  $('tab-assistant').setAttribute('aria-pressed', name === 'assistant' ? 'true' : 'false');
  $('tab-tasks').setAttribute('aria-pressed', name === 'tasks' ? 'true' : 'false');
}

const TASKS_CACHE_KEY = 'gdtp.tasks.cache.v1';

function loadCachedTasks() {
  try {
    const raw = localStorage.getItem(TASKS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function cacheTasks(list) {
  try { localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(list)); } catch (_) { /* noop */ }
}

async function boot() {
  if (!getConfig()) { showScreen('setup'); return; }
  if (!api.getSession()) { showScreen('auth'); return; }

  tasks = loadCachedTasks();
  $('user-label').textContent = api.userEmail() || 'Assistant vocal';
  showScreen('app');
  render();

  try {
    tasks = await api.fetchTasks();
    cacheTasks(tasks);
    $('user-label').textContent = api.userEmail() || 'Assistant vocal';
    render();
  } catch (_) {
    toast('Hors ligne — affichage des tâches enregistrées.');
  }
}

$('setup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const url = $('setup-url').value.trim();
  const key = $('setup-key').value.trim();
  if (!/^https:\/\/[^\s]+\.supabase\.co$/i.test(url)) {
    toast("L'URL doit ressembler à https://xxxx.supabase.co");
    return;
  }
  if (!key) { toast('Colle la clé publique (anon key).'); return; }
  setConfig(url, key);
  showScreen('auth');
  toast('Projet enregistré sur cet appareil.');
});

$('auth-reset').addEventListener('click', () => {
  clearConfig();
  api.setSession(null);
  $('setup-url').value = '';
  $('setup-key').value = '';
  showScreen('setup');
});

$('auth-toggle').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  $('auth-submit').textContent = authMode === 'login' ? 'Se connecter' : 'Créer le compte';
  $('auth-subtitle').textContent = authMode === 'login'
    ? 'Connecte-toi pour retrouver tes tâches sur tous tes appareils.'
    : 'Un compte suffit pour ton téléphone et ton PC.';
});

$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  $('auth-submit').disabled = true;
  try {
    if (authMode === 'signup') await api.signUp(email, password);
    else await api.signIn(email, password);
    tasks = await api.fetchTasks();
    $('user-label').textContent = api.userEmail();
    showScreen('app');
    render();
    toast(authMode === 'signup' ? 'Compte créé.' : 'Connecté.');
  } catch (err) {
    toast(err.message || 'Connexion impossible.');
  } finally {
    $('auth-submit').disabled = false;
  }
});

$('logout-btn').addEventListener('click', async () => {
  await api.signOut();
  tasks = [];
  showScreen('auth');
});

function addMessage(role, text, reason = '') {
  const bubble = el('div', { class: 'msg-bubble', text });
  const parts = [el('div', { class: 'msg-label', text: role === 'user' ? 'Toi' : 'Assistant' }), bubble];
  if (reason) parts.push(el('div', { class: 'msg-reason', text: reason }));
  const msg = el('div', { class: `msg msg-${role}` }, parts);
  $('chat').append(msg);
  $('chat').scrollTop = $('chat').scrollHeight;
}

function setAssistantStatus(text, state = '') {
  $('assistant-status').textContent = text;
  $('assistant-dot').className = `status-dot ${state}`;
}

async function sendToAssistant(text) {
  const clean = text.trim();
  if (!clean) return;
  addMessage('user', clean);
  $('assistant-input').value = '';
  setAssistantStatus("L'assistant réfléchit…", 'busy');
  try {
    const result = await api.classifyText(clean);
    const inserted = await api.insertTask({
      title: result.title,
      notes: result.notes || '',
      priority: result.priority || 'medium',
      category: result.category || 'Divers',
      due: result.due || null,
      done: false,
      ai_reasoning: result.reasoning || '',
    });
    tasks.unshift(inserted);
    render();
    addMessage('assistant', result.reply || 'Tâche enregistrée.', result.reasoning ? `Raisonnement : ${result.reasoning}` : '');
    voice.speak(result.reply || 'Tâche enregistrée.');
    setAssistantStatus(`Tâche classée dans ${result.category || 'Divers'}`);
  } catch (err) {
    addMessage('assistant', `Je n'ai pas pu enregistrer : ${err.message}`);
    setAssistantStatus('Erreur — réessaie');
  }
}

$('assistant-form').addEventListener('submit', (event) => {
  event.preventDefault();
  voice.stopListening();
  sendToAssistant($('assistant-input').value);
});

$('mic-btn').addEventListener('click', () => {
  if (voice.listening) {
    voice.stopListening();
    if (pendingTranscript.trim()) sendToAssistant(pendingTranscript);
    pendingTranscript = '';
    return;
  }
  voice.stopSpeaking();
  pendingTranscript = '';
  setAssistantStatus("Je t'écoute… parle maintenant", 'listening');
  $('mic-btn').classList.add('active');
  voice.start(
    (text, final) => {
      pendingTranscript = text;
      $('assistant-input').value = text;
      if (final) setAssistantStatus('Compris. Envoi…', 'busy');
    },
    () => {
      $('mic-btn').classList.remove('active');
      if (pendingTranscript.trim()) sendToAssistant(pendingTranscript);
      else setAssistantStatus('Parle ou écris une tâche');
      pendingTranscript = '';
    },
    (error) => {
      $('mic-btn').classList.remove('active');
      toast(error);
      setAssistantStatus('Micro indisponible — écris ta tâche');
    }
  );
});

$('tab-assistant').addEventListener('click', () => showView('assistant'));
$('tab-tasks').addEventListener('click', () => showView('tasks'));

function visibleTasks() {
  const q = filter.query.trim().toLocaleLowerCase('fr');
  return tasks.filter((t) => {
    if (filter.status === 'active' && t.done) return false;
    if (filter.status === 'done' && !t.done) return false;
    if (filter.priority !== 'all' && t.priority !== filter.priority) return false;
    if (filter.category !== 'all' && (t.category || '') !== filter.category) return false;
    if (q && !(t.title + ' ' + (t.notes || '') + ' ' + (t.category || '')).toLocaleLowerCase('fr').includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const weight = { high: 0, medium: 1, low: 2 };
    const wp = (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1);
    if (wp) return wp;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

function chip(label, pressed, onClick) {
  return el('button', { class: 'chip', type: 'button', 'aria-pressed': pressed ? 'true' : 'false', text: label, onclick: onClick });
}

function renderFilters() {
  $('priority-filters').replaceChildren(
    chip('Toutes', filter.priority === 'all', () => setFilter('priority', 'all')),
    ...Object.entries(PRIORITIES).map(([id, p]) => chip(p.label, filter.priority === id, () => setFilter('priority', id)))
  );
  const cats = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('category-filters').replaceChildren(
    chip('Toutes', filter.category === 'all', () => setFilter('category', 'all')),
    ...cats.map((c) => chip(c, filter.category === c, () => setFilter('category', c)))
  );
  $('category-options').replaceChildren(...cats.map((c) => el('option', { value: c })));
  const statuses = [['all', 'Toutes'], ['active', 'À faire'], ['done', 'Terminées']];
  $('mobile-status-filters').replaceChildren(
    ...statuses.map(([id, label]) => chip(label, filter.status === id, () => setFilter('status', id)))
  );
}

function setFilter(key, value) { filter[key] = value; render(); }

function taskNode(task) {
  const prio = PRIORITIES[task.priority] || PRIORITIES.medium;
  const check = el('button', { class: 'check', type: 'button', text: task.done ? '✓' : '', 'aria-label': task.done ? 'Rouvrir' : 'Terminer', onclick: () => toggleTask(task) });
  const body = el('div', { class: 'task-body' }, [el('p', { class: 'task-title', text: task.title })]);
  if (task.notes) body.append(el('p', { class: 'task-notes', text: task.notes }));
  const meta = el('div', { class: 'task-meta' }, [el('span', { class: 'tag', text: prio.label })]);
  if (task.category) meta.append(el('span', { class: 'tag', text: task.category }));
  const due = dueInfo(task);
  if (due) meta.append(el('span', { class: `tag ${due.cls}`, text: due.label }));
  if (task.ai_reasoning) meta.append(el('span', { class: 'tag', text: 'IA' }));
  body.append(meta);
  const pencil = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pencil.setAttribute('viewBox', '0 0 24 24'); pencil.setAttribute('width', '16'); pencil.setAttribute('height', '16');
  pencil.setAttribute('fill', 'none'); pencil.setAttribute('stroke', 'currentColor'); pencil.setAttribute('stroke-width', '2');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z');
  pencil.append(path);
  const actions = el('div', { class: 'task-actions' }, [el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Modifier', onclick: () => openDialog(task) }, [pencil])]);
  return el('li', { class: `task${task.done ? ' is-done' : ''}`, style: `--prio:${prio.color}` }, [check, body, actions]);
}

function render() {
  cacheTasks(tasks);
  const list = visibleTasks();
  $('task-list').replaceChildren(...list.map(taskNode));
  const done = tasks.filter((t) => t.done).length;
  $('stat-active').textContent = String(tasks.length - done);
  $('stat-done').textContent = String(done);
  $('stat-late').textContent = String(tasks.filter((t) => !t.done && t.due && t.due < todayISO()).length);
  $('list-title').textContent = { all: 'Toutes les tâches', active: 'À faire', done: 'Terminées' }[filter.status];
  $('clear-done').hidden = done === 0;
  $('empty-state').hidden = list.length > 0;
  if (!list.length) $('empty-message').textContent = 'Aucune tâche à afficher.';
  renderFilters();
}

async function toggleTask(task) {
  const done = !task.done;
  try {
    const updated = await api.updateTask(task.id, { done, completed_at: done ? new Date().toISOString() : null });
    Object.assign(task, updated || { done });
    render();
  } catch (err) { toast(err.message); }
}

function openDialog(task = null) {
  editingId = task?.id || null;
  $('dialog-title').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
  $('f-title').value = task?.title || '';
  $('f-notes').value = task?.notes || '';
  $('f-priority').value = task?.priority || 'medium';
  $('f-due').value = task?.due || '';
  $('f-category').value = task?.category || '';
  $('delete-task').hidden = !task;
  $('task-dialog').showModal();
}

$('dialog-close').addEventListener('click', () => $('task-dialog').close());
$('cancel-task').addEventListener('click', () => $('task-dialog').close());
$('task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const patch = {
    title: $('f-title').value.trim(),
    notes: $('f-notes').value,
    priority: $('f-priority').value,
    due: $('f-due').value || null,
    category: $('f-category').value.trim(),
  };
  if (!patch.title) return;
  try {
    if (editingId) {
      const updated = await api.updateTask(editingId, patch);
      const t = tasks.find((x) => x.id === editingId);
      if (t) Object.assign(t, updated || patch);
    } else {
      const inserted = await api.insertTask({ ...patch, done: false, ai_reasoning: '' });
      tasks.unshift(inserted);
    }
    $('task-dialog').close();
    render();
  } catch (err) { toast(err.message); }
});

$('delete-task').addEventListener('click', async () => {
  if (!editingId || !confirm('Supprimer cette tâche ?')) return;
  try {
    await api.deleteTask(editingId);
    tasks = tasks.filter((t) => t.id !== editingId);
    $('task-dialog').close();
    render();
  } catch (err) { toast(err.message); }
});

$('clear-done').addEventListener('click', async () => {
  if (!confirm('Effacer toutes les tâches terminées ?')) return;
  try {
    await api.deleteDoneTasks();
    tasks = tasks.filter((t) => !t.done);
    render();
  } catch (err) { toast(err.message); }
});

$('search').addEventListener('input', (event) => { filter.query = event.target.value; render(); });

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('gdtp.theme', theme);
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f6fb' : '#0b1120';
}
$('theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

document.addEventListener('keydown', (event) => {
  if ($('task-dialog').open) return;
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (event.key === 'Escape' && voice.listening) { voice.stopListening(); return; }
  if (event.key === '/' && !typing && !$('main-app').hidden) { event.preventDefault(); showView('tasks'); $('search').focus(); }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstall = event;
  $('install-btn').hidden = false;
});
$('install-btn').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $('install-btn').hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

try {
  const saved = localStorage.getItem('gdtp.theme');
  applyTheme(saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
} catch (_) { applyTheme('dark'); }

if (!voice.canListen) $('compose-hint').textContent = 'Micro non disponible sur ce navigateur — écris ta tâche, la réponse vocale reste active.';

boot();
