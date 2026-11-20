import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, SlidersHorizontal, Mic, Plus, ArrowUpDown, Check } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import TaskCard from '../tasks/TaskCard.jsx'
import { Chip, EmptyState, SectionHead } from '../primitives/Bits.jsx'
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, PRIORITY_ORDER } from '../../nlu/lexicon.js'
import { matchesRange, sortTasks } from '../../nlu/answers.js'
import { fromISODate, daysBetween } from '../../nlu/dates.js'
import { fuzzyScore } from '../../lib/utils.js'

const SORTS = [
  { id: 'smart', label: 'Intelligent', icon: 'Wand2' },
  { id: 'due', label: 'Échéance', icon: 'CalendarClock' },
  { id: 'priority', label: 'Priorité', icon: 'Flag' },
  { id: 'created', label: 'Création', icon: 'History' },
  { id: 'alpha', label: 'A → Z', icon: 'ArrowUpDown' },
]

const GROUPS = [
  { id: 'none', label: 'Liste' },
  { id: 'due', label: 'Par échéance' },
  { id: 'category', label: 'Par catégorie' },
  { id: 'priority', label: 'Par priorité' },
  { id: 'tag', label: 'Par tag' },
]

export default function TasksView({
  tasks,
  filters,
  onFilters,
  onOpenTask,
  onToggle,
  onDelete,
  onPin,
  onQuickAdd,
  onVoice,
  now,
  initialCategory,
}) {
  const [showFilters, setShowFilters] = useState(false)

  const filtered = useMemo(() => {
    let list = [...tasks]
    if (filters.status === 'open') list = list.filter((task) => !task.done)
    else if (filters.status === 'done') list = list.filter((task) => task.done)
    if (filters.category) list = list.filter((task) => task.category === filters.category)
    if (filters.priority) list = list.filter((task) => task.priority === filters.priority)
    if (filters.tag) list = list.filter((task) => (task.tags || []).includes(filters.tag))
    if (filters.range) list = list.filter((task) => matchesRange(task, filters.range, now))
    if (filters.query) {
      list = list
        .map((task) => ({ task, score: fuzzyScore(filters.query, [task.title, task.notes, CATEGORIES[task.category]?.label, ...(task.tags || [])].join(' ')) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.task)
    } else {
      list = sortWith(list, filters.sort)
    }
    return list
  }, [tasks, filters, now])

  const groups = useMemo(() => groupTasks(filtered, filters.groupBy || 'none', now), [filtered, filters.groupBy, now])

  const allTags = useMemo(() => {
    const set = new Map()
    tasks.forEach((task) => (task.tags || []).forEach((tag) => set.set(tag, (set.get(tag) || 0) + 1)))
    return [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  }, [tasks])

  const activeFilterCount = [filters.category, filters.priority, filters.tag, filters.range, filters.query, filters.status !== 'open'].filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHead
        title={filters.category ? CATEGORIES[filters.category]?.label : filters.range === 'done' || filters.status === 'done' ? 'Tâches terminées' : 'Toutes les tâches'}
        subtitle={`${filtered.length} résultat${filtered.length > 1 ? 's' : ''}${activeFilterCount ? ` · ${activeFilterCount} filtre${activeFilterCount > 1 ? 's' : ''} actif${activeFilterCount > 1 ? 's' : ''}` : ''}`}
      >
        <button type="button" className="btn btn-sm" onClick={onVoice}><Mic size={14} /> Dicter</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onQuickAdd}><Plus size={14} /> Ajouter</button>
      </SectionHead>

      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="filter-search">
            <span className="icon"><Search size={15} /></span>
            <input
              className="input"
              value={filters.query || ''}
              onChange={(event) => onFilters({ query: event.target.value })}
              placeholder="Rechercher un mot-clé, un tag, une catégorie…"
              aria-label="Rechercher dans les tâches"
              type="search"
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="filter-panel"
          >
            <SlidersHorizontal size={15} /> Filtres {activeFilterCount > 0 && <Chip tone="info" style={{ marginLeft: 2 }}>{activeFilterCount}</Chip>}
          </button>
          <div className="segmented" role="group" aria-label="Tri">
            {SORTS.map((sort) => (
              <button
                key={sort.id}
                type="button"
                aria-pressed={filters.sort === sort.id}
                onClick={() => onFilters({ sort: sort.id })}
                title={`Trier : ${sort.label}`}
              >
                <Icon name={sort.icon} size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                <span className="hide-sm">{sort.label}</span>
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              id="filter-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
                <FilterRow label="Statut">
                  {[{ id: 'open', label: 'En cours' }, { id: 'done', label: 'Terminées' }, { id: 'all', label: 'Toutes' }].map((option) => (
                    <Chip key={option.id} as="button" className="chip-button" aria-pressed={filters.status === option.id} onClick={() => onFilters({ status: option.id })}>
                      {option.label}
                    </Chip>
                  ))}
                </FilterRow>
                <FilterRow label="Période">
                  {[
                    { id: null, label: 'Toutes' },
                    { id: 'overdue', label: 'En retard' },
                    { id: 'today', label: 'Aujourd’hui' },
                    { id: 'tomorrow', label: 'Demain' },
                    { id: 'week', label: '7 jours' },
                    { id: 'month', label: 'Ce mois' },
                    { id: 'someday', label: 'Sans date' },
                  ].map((option) => (
                    <Chip key={String(option.id)} as="button" className="chip-button" aria-pressed={(filters.range || null) === option.id} onClick={() => onFilters({ range: option.id })}>
                      {option.label}
                    </Chip>
                  ))}
                </FilterRow>
                <FilterRow label="Catégorie">
                  <Chip as="button" className="chip-button" aria-pressed={!filters.category} onClick={() => onFilters({ category: null })}>Toutes</Chip>
                  {CATEGORY_ORDER.map((key) => {
                    const count = tasks.filter((task) => task.category === key).length
                    if (!count) return null
                    return (
                      <Chip key={key} as="button" className="chip-button" color={CATEGORIES[key].color} aria-pressed={filters.category === key} onClick={() => onFilters({ category: filters.category === key ? null : key })}>
                        {CATEGORIES[key].label} · {count}
                      </Chip>
                    )
                  })}
                </FilterRow>
                <FilterRow label="Priorité">
                  <Chip as="button" className="chip-button" aria-pressed={!filters.priority} onClick={() => onFilters({ priority: null })}>Toutes</Chip>
                  {PRIORITY_ORDER.map((key) => (
                    <Chip key={key} as="button" className="chip-button" color={PRIORITIES[key].color} aria-pressed={filters.priority === key} onClick={() => onFilters({ priority: filters.priority === key ? null : key })}>
                      {PRIORITIES[key].label}
                    </Chip>
                  ))}
                </FilterRow>
                {allTags.length > 0 && (
                  <FilterRow label="Tags">
                    <Chip as="button" className="chip-button" aria-pressed={!filters.tag} onClick={() => onFilters({ tag: null })}>Tous</Chip>
                    {allTags.map(([tag, count]) => (
                      <Chip key={tag} as="button" className="chip-button" aria-pressed={filters.tag === tag} onClick={() => onFilters({ tag: filters.tag === tag ? null : tag })}>
                        #{tag} · {count}
                      </Chip>
                    ))}
                  </FilterRow>
                )}
                <FilterRow label="Regrouper">
                  {GROUPS.map((group) => (
                    <Chip key={group.id} as="button" className="chip-button" aria-pressed={(filters.groupBy || 'none') === group.id} onClick={() => onFilters({ groupBy: group.id })}>
                      {group.label}
                    </Chip>
                  ))}
                </FilterRow>
                {activeFilterCount > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onFilters({ query: '', category: null, priority: null, tag: null, range: null, status: 'open', groupBy: 'none', sort: 'smart' })}>
                    <X size={14} /> Réinitialiser les filtres
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={filters.query ? 'Search' : 'ListTodo'}
          title={filters.query ? `Aucun résultat pour « ${filters.query} »` : 'Aucune tâche ici'}
          description={filters.query ? 'Essaie un autre mot-clé, ou dicte une nouvelle tâche à la voix.' : 'Dicte ta première tâche : l’assistant détecte la date, la priorité et la catégorie.'}
          action={
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={onVoice}><Mic size={15} /> Parler</button>
              <button type="button" className="btn" onClick={onQuickAdd}><Plus size={15} /> Saisir</button>
            </div>
          }
        />
      ) : (
        <div className="task-group" style={{ gap: 18 }}>
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              {group.title && (
                <div className="task-group-head">
                  {group.color && <span style={{ width: 9, height: 9, borderRadius: '50%', background: group.color }} />}
                  <h3 id={`group-${group.key}`}>{group.title}</h3>
                  <span className="count">{group.tasks.length}</span>
                  <span className="line" />
                </div>
              )}
              <div className="task-list">
                <AnimatePresence initial={false} mode="popLayout">
                  {group.tasks.map((task, index) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={index}
                      onToggle={onToggle}
                      onOpen={onOpenTask}
                      onDelete={onDelete}
                      onPin={onPin}
                      showCategory={!filters.category}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 96px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)', paddingTop: 6 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function sortWith(list, sort) {
  switch (sort) {
    case 'due':
      return [...list].sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0
        if (!a.dueAt) return 1
        if (!b.dueAt) return -1
        return new Date(a.dueAt) - new Date(b.dueAt)
      })
    case 'priority':
      return [...list].sort((a, b) => (PRIORITIES[b.priority]?.rank || 0) - (PRIORITIES[a.priority]?.rank || 0))
    case 'created':
      return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    case 'alpha':
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    default:
      return sortTasks(list, 'smart')
  }
}

function groupTasks(list, mode, now) {
  if (mode === 'none' || !mode) return [{ key: 'all', title: null, tasks: list }]

  if (mode === 'category') {
    return CATEGORY_ORDER.filter((key) => list.some((task) => task.category === key)).map((key) => ({
      key,
      title: CATEGORIES[key].label,
      color: CATEGORIES[key].color,
      tasks: list.filter((task) => task.category === key),
    }))
  }

  if (mode === 'priority') {
    return PRIORITY_ORDER.filter((key) => list.some((task) => task.priority === key)).map((key) => ({
      key,
      title: PRIORITIES[key].label,
      color: PRIORITIES[key].color,
      tasks: list.filter((task) => task.priority === key),
    }))
  }

  if (mode === 'tag') {
    const map = new Map()
    list.forEach((task) => {
      const tags = task.tags?.length ? task.tags : ['sans tag']
      tags.forEach((tag) => {
        if (!map.has(tag)) map.set(tag, [])
        map.get(tag).push(task)
      })
    })
    return [...map.entries()].map(([tag, tasks]) => ({ key: tag, title: `#${tag}`, tasks }))
  }

  // Par échéance
  const buckets = [
    { key: 'overdue', title: 'En retard', color: 'var(--danger)', test: (task) => !task.done && task.dueAt && fromISODate(task.dueAt).getTime() < now.getTime() },
    { key: 'today', title: 'Aujourd’hui', color: 'var(--warning)', test: (task) => task.dueAt && daysBetween(now, fromISODate(task.dueAt)) === 0 },
    { key: 'tomorrow', title: 'Demain', color: 'var(--info)', test: (task) => task.dueAt && daysBetween(now, fromISODate(task.dueAt)) === 1 },
    { key: 'week', title: 'Cette semaine', color: 'var(--accent)', test: (task) => task.dueAt && daysBetween(now, fromISODate(task.dueAt)) > 1 && daysBetween(now, fromISODate(task.dueAt)) <= 7 },
    { key: 'later', title: 'Plus tard', color: 'var(--text-dim)', test: (task) => task.dueAt && daysBetween(now, fromISODate(task.dueAt)) > 7 },
    { key: 'someday', title: 'Sans échéance', color: 'var(--text-dim)', test: (task) => !task.dueAt },
    { key: 'done', title: 'Terminées', color: 'var(--success)', test: (task) => task.done },
  ]
  return buckets
    .map((bucket) => ({ ...bucket, tasks: list.filter((task) => bucket.test(task)) }))
    .filter((bucket) => bucket.tasks.length)
}
