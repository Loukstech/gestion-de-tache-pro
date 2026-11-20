import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Mic, CornerDownLeft, ArrowRight, Wand2, Loader2 } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import Modal from '../primitives/Modal.jsx'
import { Chip, CategoryChip, PriorityChip, DueChip } from '../primitives/Bits.jsx'
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES } from '../../nlu/lexicon.js'
import { interpret } from '../../nlu/parser.js'
import { filterTasks } from '../../nlu/answers.js'
import { fuzzyScore, modifierKeyLabel, cx } from '../../lib/utils.js'

/**
 * Palette de commandes (Ctrl/Cmd + K).
 * Trois modes dans un seul champ :
 *  - texte libre  → recherche instantanée dans les tâches + commandes ;
 *  - « ! »        → création en langage naturel (même moteur que la voix) ;
 *  - bouton micro → dictée vocale.
 */
export default function CommandPalette({
  open,
  onClose,
  tasks,
  onNavigate,
  onRunCommand,
  onOpenTask,
  onQuickAdd,
  onToggleVoice,
  listening,
  interim,
  busy,
  theme,
  onToggleTheme,
  onLoadDemo,
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery(listening ? (interim || '') : '')
      setActive(0)
      const timer = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open, listening])

  useEffect(() => {
    if (listening && interim) setQuery(interim)
  }, [listening, interim])

  useEffect(() => setActive(0), [query])

  const natural = query.replace(/^!\s*/, '').trim()
  const isCreateMode = query.trim().startsWith('!') || (natural.length > 2 && /^(ajoute|crée|cree|note|je dois|il faut|rappelle|planifie|supprime|termine|liste|montre|cherche|combien|qu'est)/i.test(natural))

  const preview = useMemo(() => {
    if (!isCreateMode || natural.length < 3) return null
    const interpretation = interpret(natural, { source: 'text' })
    return interpretation
  }, [isCreateMode, natural])

  const commands = useMemo(() => {
    const base = [
      { id: 'nav-dashboard', group: 'Naviguer', title: 'Tableau de bord', icon: 'LayoutDashboard', run: () => onNavigate('dashboard'), keywords: 'accueil dashboard statistiques vue' },
      { id: 'nav-assistant', group: 'Naviguer', title: 'Assistant vocal', icon: 'Mic', run: () => onNavigate('assistant'), keywords: 'voix parler micro assistant' },
      { id: 'nav-today', group: 'Naviguer', title: 'Aujourd’hui', icon: 'Sun', keywords: 'jour taches du jour today', run: () => onNavigate('today') },
      { id: 'nav-tasks', group: 'Naviguer', title: 'Toutes les tâches', icon: 'ListTodo', keywords: 'liste taches all', run: () => onNavigate('tasks') },
      { id: 'nav-calendar', group: 'Naviguer', title: 'Agenda', icon: 'CalendarDays', keywords: 'calendrier mois planning', run: () => onNavigate('calendar') },
      { id: 'nav-analytics', group: 'Naviguer', title: 'Analytique', icon: 'BarChart3', keywords: 'stats bilan productivite', run: () => onNavigate('analytics') },
      { id: 'cmd-voice', group: 'Actions', title: listening ? 'Arrêter l’écoute vocale' : 'Démarrer l’écoute vocale', icon: listening ? 'Square' : 'Mic', keywords: 'voix dicter parler micro', run: onToggleVoice, badge: `${modifierKeyLabel}+M` },
      { id: 'cmd-add', group: 'Actions', title: 'Nouvelle tâche', icon: 'Plus', keywords: 'ajouter creer nouvelle', run: onQuickAdd, badge: `${modifierKeyLabel}+J` },
      { id: 'cmd-theme', group: 'Actions', title: theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre', icon: theme === 'dark' ? 'Sun' : 'Moon', keywords: 'theme sombre clair apparence', run: onToggleTheme },
      { id: 'cmd-demo', group: 'Actions', title: 'Charger le jeu de démonstration', icon: 'Wand2', keywords: 'demo exemple donnees', run: onLoadDemo },
      ...CATEGORY_ORDER.filter((key) => key !== 'divers').map((key) => ({
        id: `nav-cat-${key}`,
        group: 'Catégories',
        title: CATEGORIES[key].label,
        icon: CATEGORIES[key].icon,
        color: CATEGORIES[key].color,
        keywords: `categorie ${CATEGORIES[key].label} ${CATEGORIES[key].keywords.slice(0, 6).join(' ')}`,
        run: () => onNavigate(`cat:${key}`),
      })),
      { id: 'cmd-help', group: 'Actions', title: 'Que sais-tu faire ?', icon: 'HelpCircle', keywords: 'aide exemples commandes', run: () => onRunCommand('aide') },
      { id: 'cmd-stats', group: 'Actions', title: 'Mon bilan chiffré', icon: 'Gauge', keywords: 'stats bilan combien', run: () => onRunCommand('donne-moi mes statistiques') },
      { id: 'cmd-today', group: 'Actions', title: 'Ce que j’ai à faire aujourd’hui', icon: 'Target', keywords: 'jour today faire', run: () => onRunCommand("qu'est-ce que j'ai à faire aujourd'hui") },
      { id: 'cmd-overdue', group: 'Actions', title: 'Mes tâches en retard', icon: 'AlertTriangle', keywords: 'retard overdue', run: () => onRunCommand('liste mes tâches en retard') },
    ]
    return base
  }, [listening, theme, onNavigate, onQuickAdd, onToggleVoice, onToggleTheme, onLoadDemo, onRunCommand])

  const taskResults = useMemo(() => {
    if (!natural) return []
    return tasks
      .map((task) => {
        const haystack = [task.title, task.notes, CATEGORIES[task.category]?.label, ...(task.tags || [])].join(' ')
        return { task, score: fuzzyScore(natural, haystack) }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((entry) => entry.task)
  }, [natural, tasks])

  const commandResults = useMemo(() => {
    if (!natural) return commands.slice(0, 12)
    return commands
      .map((command) => ({ command, score: fuzzyScore(natural, `${command.title} ${command.group} ${command.keywords}`) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.command)
  }, [natural, commands])

  /** Ligne « créer » en tête si le texte ressemble à une commande naturelle. */
  const createEntry = preview?.tasks?.length
    ? {
        id: 'create-live',
        group: 'Créer en langage naturel',
        title: preview.tasks.map((task) => task.title).join(' · '),
        icon: 'Wand2',
        run: () => onRunCommand(natural),
        preview,
      }
    : isCreateMode && natural.length > 2
      ? { id: 'create-raw', group: 'Créer en langage naturel', title: `Créer la tâche « ${natural} »`, icon: 'Plus', run: () => onRunCommand(natural) }
      : null

  const items = useMemo(() => {
    const list = []
    if (createEntry) list.push(createEntry)
    commandResults.forEach((command) => list.push(command))
    taskResults.forEach((task) => {
      list.push({
        id: `task-${task.id}`,
        group: 'Tâches',
        title: task.title,
        icon: task.done ? 'CheckCircle2' : 'CircleDot',
        task,
        run: () => onOpenTask(task.id),
      })
    })
    return list
  }, [createEntry, commandResults, taskResults, onOpenTask])

  const grouped = useMemo(() => {
    const map = new Map()
    items.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, [])
      map.get(item.group).push(item)
    })
    return [...map.entries()]
  }, [items])

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const runItem = (item) => {
    if (!item) return
    item.run?.()
    onClose()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[active]
      if (item) runItem(item)
      else if (natural) {
        onRunCommand(natural)
        onClose()
      }
    } else if (event.key === 'Tab') {
      // Piège à focus : la palette est une mini-application modale.
      const focusables = Array.from(listRef.current?.querySelectorAll('button') || [])
      if (!focusables.length) event.preventDefault()
    }
  }

  let flatIndex = -1

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
          style={{ paddingTop: '10vh' }}
        >
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes et recherche"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            onKeyDown={onKeyDown}
          >
            <div className="palette-input-row">
              {busy ? <Loader2 size={19} className="spin" /> : <Search size={19} color="var(--text-dim)" />}
              <input
                ref={inputRef}
                className="palette-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Dicte, écris « ! ajoute une tâche … » ou recherche…"
                aria-label="Commande ou recherche"
                aria-controls="palette-results"
                aria-activedescendant={items[active] ? `palette-item-${items[active].id}` : undefined}
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                className={cx('btn btn-icon', listening && 'btn-danger')}
                onClick={onToggleVoice}
                aria-pressed={listening}
                aria-label={listening ? 'Arrêter la dictée' : 'Démarrer la dictée'}
                title="Dicter"
              >
                <Mic size={17} />
              </button>
            </div>

            {preview?.tasks?.[0] && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip icon="Sparkles" tone="info">Analyse en direct</Chip>
                {preview.tasks.map((task) => (
                  <span key={task.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <CategoryChip id={task.category} />
                    <PriorityChip id={task.priority} />
                    <DueChip task={task} />
                    {(task.tags || []).slice(0, 2).map((tag) => <Chip key={tag}>#{tag}</Chip>)}
                  </span>
                ))}
              </div>
            )}

            <div className="palette-list" id="palette-results" ref={listRef} role="listbox" aria-label="Résultats">
              {items.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13.5 }}>
                  Aucun résultat. Tape « ! » suivi d’une phrase pour créer une tâche.
                </div>
              )}
              {grouped.map(([group, groupItems]) => (
                <div key={group}>
                  <div className="palette-group-label">{group}</div>
                  {groupItems.map((item) => {
                    flatIndex += 1
                    const index = flatIndex
                    const isActive = index === active
                    return (
                      <button
                        key={item.id}
                        id={`palette-item-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className="palette-item"
                        data-active={isActive}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => runItem(item)}
                      >
                        <span className="p-icon" style={item.color ? { color: item.color } : undefined}>
                          <Icon name={item.icon} size={16} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span className="p-title">{item.title}</span>
                          {item.task && (
                            <span className="p-sub" style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                              {CATEGORIES[item.task.category]?.label}
                              {item.task.dueAt ? ` · ${new Date(item.task.dueAt).toLocaleDateString('fr-FR')}` : ''}
                              {item.task.done ? ' · terminée' : ''}
                            </span>
                          )}
                          {item.preview?.tasks?.[0]?.notes && <span className="p-sub">{item.preview.tasks[0].notes}</span>}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)' }}>
                          {item.badge && <kbd>{item.badge}</kbd>}
                          {isActive && <CornerDownLeft size={14} />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="palette-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
              <span><kbd>↵</kbd> exécuter</span>
              <span><kbd>!</kbd> créer en langage naturel</span>
              <span><kbd>Échap</kbd> fermer</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRight size={12} /> moteur français local, 0 €
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
