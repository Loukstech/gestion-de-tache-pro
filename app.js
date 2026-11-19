(() => {
  'use strict';

  const STORAGE_KEY = 'gdtp.tasks.v1';
  const THEME_KEY = 'gdtp.theme';
  const PRIORITIES = {
    high: { label: 'Haute', color: 'var(--danger)' },
    medium: { label: 'Moyenne', color: 'var(--warn)' },
    low: { label: 'Basse', color: 'var(--ok)' }
  };
  const STATUSES = [
    { id: 'all', label: 'Toutes' },
    { id: 'active', label: 'À faire' },
    { id: 'done', label: 'Terminées' }
  ];

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children) node.append(child);
    return node;
  };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const todayISO = () => new Date().toISOString().slice(0, 10);

  let tasks = load();
  let filter = { status: 'all', priority: 'all', category: 'all', query: '' };
  let editingId = null;
  let deferredInstall = null;
  let toastTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.title === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (_) {
      toast('Stockage indisponible : les tâches ne seront pas conservées.');
    }
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  function dueInfo(task) {
    if (!task.due) return null;
    const today = todayISO();
    if (task.due < today) return { cls: 'due-late', label: `En retard · ${formatDate(task.due)}` };
    if (task.due === today) return { cls: 'due-soon', label: "Aujourd'hui" };
    return { cls: '', label: formatDate(task.due) };
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
  }

  const weight = { high: 0, medium: 1, low: 2 };
  function visibleTasks() {
    const q = filter.query.trim().toLocaleLowerCase('fr');
    return tasks
      .filter((t) => {
        if (filter.status === 'active' && t.done) return false;
        if (filter.status === 'done' && !t.done) return false;
        if (filter.priority !== 'all' && t.priority !== filter.priority) return false;
        if (filter.category !== 'all' && (t.category || '') !== filter.category) return false;
        if (q && !(t.title + ' ' + (t.notes || '') + ' ' + (t.category || '')).toLocaleLowerCase('fr').includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const wp = (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1);
        if (wp) return wp;
        if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
        if (a.due !== b.due) return a.due ? -1 : 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }

  function chip(label, pressed, onClick) {
    return el('button', {
      class: 'chip', type: 'button', 'aria-pressed': pressed ? 'true' : 'false',
      text: label, onclick: onClick
    });
  }

  function renderFilters() {
    const pBox = $('priority-filters');
    pBox.replaceChildren(
      chip('Toutes', filter.priority === 'all', () => setFilter('priority', 'all')),
      ...Object.entries(PRIORITIES).map(([id, p]) => chip(p.label, filter.priority === id, () => setFilter('priority', id)))
    );

    const categories = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    $('category-filters').replaceChildren(
      chip('Toutes', filter.category === 'all', () => setFilter('category', 'all')),
      ...categories.map((c) => chip(c, filter.category === c, () => setFilter('category', c)))
    );
    $('category-options').replaceChildren(...categories.map((c) => el('option', { value: c })));

    const statusChips = STATUSES.map((s) => chip(s.label, filter.status === s.id, () => setFilter('status', s.id)));
    $('mobile-status-filters').replaceChildren(...statusChips);
    $('bottom-nav').replaceChildren(...statusChips.map((c) => c.cloneNode(true)));
    // Rebind cloned nodes in the bottom nav.
    $('bottom-nav').querySelectorAll('.chip').forEach((node, i) => {
      node.addEventListener('click', () => setFilter('status', STATUSES[i].id));
    });
  }

  function setFilter(key, value) {
    filter[key] = value;
    render();
  }

  function taskNode(task) {
    const prio = PRIORITIES[task.priority] || PRIORITIES.medium;
    const check = el('button', {
      class: 'check', type: 'button', text: task.done ? '✓' : '',
      'aria-label': task.done ? 'Marquer comme à faire' : 'Marquer comme terminée',
      'aria-pressed': task.done ? 'true' : 'false',
      onclick: () => toggleTask(task.id)
    });
    const body = el('div', { class: 'task-body' }, [
      el('p', { class: 'task-title', text: task.title })
    ]);
    if (task.notes) body.append(el('p', { class: 'task-notes', text: task.notes }));
    const meta = el('div', { class: 'task-meta' }, [
      el('span', { class: 'tag', text: prio.label }),
      ...(task.category ? [el('span', { class: 'tag', text: task.category })] : [])
    ]);
    const due = dueInfo(task);
    if (due) meta.append(el('span', { class: `tag ${due.cls}`, text: due.label }));
    body.append(meta);

    const pencil = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pencil.setAttribute('viewBox', '0 0 24 24');
    pencil.setAttribute('width', '16');
    pencil.setAttribute('height', '16');
    pencil.setAttribute('fill', 'none');
    pencil.setAttribute('stroke', 'currentColor');
    pencil.setAttribute('stroke-width', '2');
    pencil.setAttribute('stroke-linecap', 'round');
    pencil.setAttribute('stroke-linejoin', 'round');
    pencil.setAttribute('aria-hidden', 'true');
    const pencilPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pencilPath.setAttribute('d', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z');
    pencil.append(pencilPath);
    const actions = el('div', { class: 'task-actions' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Modifier', onclick: () => openDialog(task.id) }, [pencil])
    ]);

    return el('li', {
      class: `task${task.done ? ' is-done' : ''}`,
      dataset: { id: task.id },
      style: `--prio:${prio.color}`
    }, [check, body, actions]);
  }

  function render() {
    const list = visibleTasks();
    const box = $('task-list');
    box.replaceChildren(...list.map(taskNode));

    const done = tasks.filter((t) => t.done).length;
    $('stat-active').textContent = String(tasks.length - done);
    $('stat-done').textContent = String(done);
    $('stat-late').textContent = String(tasks.filter((t) => !t.done && t.due && t.due < todayISO()).length);

    const labels = { all: 'Toutes les tâches', active: 'Tâches à faire', done: 'Tâches terminées' };
    $('list-title').textContent = labels[filter.status];
    $('clear-done').hidden = done === 0;

    const empty = $('empty-state');
    empty.hidden = list.length > 0;
    if (!list.length) {
      $('empty-message').textContent = filter.query || filter.priority !== 'all' || filter.category !== 'all' || filter.status !== 'all'
        ? 'Aucune tâche ne correspond à ces filtres.'
        : 'Aucune tâche pour le moment. Ajoutez-en une ci-dessus.';
    }
    renderFilters();
  }

  function addTask(title, opts = {}) {
    const clean = title.trim();
    if (!clean) return;
    tasks.push({
      id: uid(), title: clean, notes: opts.notes || '',
      priority: PRIORITIES[opts.priority] ? opts.priority : 'medium',
      category: (opts.category || '').trim(), due: opts.due || '',
      done: false, createdAt: new Date().toISOString(), completedAt: null
    });
    save();
    render();
    toast('Tâche ajoutée.');
  }

  function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : null;
    save();
    render();
    toast(task.done ? 'Tâche terminée.' : 'Tâche remise à faire.');
  }

  function openDialog(id = null) {
    editingId = id;
    const task = id ? tasks.find((t) => t.id === id) : null;
    if (id && !task) return;
    $('dialog-title').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
    $('f-title').value = task ? task.title : '';
    $('f-notes').value = task ? (task.notes || '') : '';
    $('f-priority').value = task ? (task.priority || 'medium') : 'medium';
    $('f-due').value = task ? (task.due || '') : '';
    $('f-category').value = task ? (task.category || '') : '';
    $('delete-task').hidden = !task;
    $('task-dialog').showModal();
    setTimeout(() => $('f-title').focus(), 30);
  }

  function closeDialog() { $('task-dialog').close(); }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* noop */ }
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f6fb' : '#0b1120';
  }

  // ---- wiring ----
  $('quick-add').addEventListener('submit', (event) => {
    event.preventDefault();
    addTask($('quick-title').value);
    $('quick-title').value = '';
    $('quick-title').focus();
  });

  $('search').addEventListener('input', (event) => {
    filter.query = event.target.value;
    render();
  });

  $('fab').addEventListener('click', () => openDialog());
  $('dialog-close').addEventListener('click', closeDialog);
  $('cancel-task').addEventListener('click', closeDialog);

  $('task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = {
      title: $('f-title').value,
      notes: $('f-notes').value,
      priority: $('f-priority').value,
      due: $('f-due').value,
      category: $('f-category').value
    };
    if (!data.title.trim()) return;
    if (editingId) {
      const task = tasks.find((t) => t.id === editingId);
      if (task) Object.assign(task, data, { title: data.title.trim(), category: data.category.trim() });
      toast('Tâche mise à jour.');
    } else {
      addTask(data.title, data);
    }
    save();
    closeDialog();
    render();
  });

  $('delete-task').addEventListener('click', () => {
    if (!editingId || !confirm('Supprimer définitivement cette tâche ?')) return;
    tasks = tasks.filter((t) => t.id !== editingId);
    save();
    closeDialog();
    render();
    toast('Tâche supprimée.');
  });

  $('clear-done').addEventListener('click', () => {
    if (!confirm('Effacer toutes les tâches terminées ?')) return;
    tasks = tasks.filter((t) => !t.done);
    save();
    render();
    toast('Tâches terminées effacées.');
  });

  $('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  document.addEventListener('keydown', (event) => {
    const dialogOpen = $('task-dialog').open;
    if (event.key === 'Escape' && dialogOpen) return;
    if (dialogOpen) return;
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (event.key === '/' && !typing) {
      event.preventDefault();
      $('search').focus();
    } else if ((event.key === 'n' || event.key === 'N') && !typing) {
      event.preventDefault();
      openDialog();
    }
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
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    $('install-btn').hidden = true;
    toast('Application installée.');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline still works without SW */ });
    });
  }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === 'light' || saved === 'dark' ? saved
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  } catch (_) {
    applyTheme('dark');
  }

  render();
})();
