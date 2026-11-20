import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, Mic, Wand2, X } from 'lucide-react'
import Modal from '../primitives/Modal.jsx'
import Icon from '../primitives/Icon.jsx'
import { Chip, PriorityChip, CategoryChip, DueChip, Progress } from '../primitives/Bits.jsx'
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, PRIORITY_ORDER } from '../../nlu/lexicon.js'
import { formatMinutes } from '../../nlu/answers.js'
import { fromISODate, toLocalDateTime, humanizeDue, nextOccurrence } from '../../nlu/dates.js'
import { interpret } from '../../nlu/parser.js'
import { uid, capitalize, cx } from '../../lib/utils.js'

/**
 * Fiche détaillée d'une tâche : édition complète, sous-tâches, historique
 * et « baguette magique » qui ré-analyse le titre en langage naturel.
 */
export default function TaskDetail({ task, open, onClose, onUpdate, onDelete, onToggle, onToggleSubtask, onSpeak }) {
  const [form, setForm] = useState(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        notes: task.notes || '',
        priority: task.priority || 'medium',
        category: task.category || 'divers',
        dueAt: task.dueAt ? toLocalDateTime(fromISODate(task.dueAt)) : '',
        dueHasTime: Boolean(task.dueHasTime),
        tags: (task.tags || []).join(', '),
        estimateMinutes: task.estimateMinutes || '',
        assignee: task.assignee || '',
        recurrence: task.recurrence?.rrule || '',
        pinned: Boolean(task.pinned),
      })
    }
  }, [task])

  const subtaskProgress = useMemo(() => {
    const subs = task?.subtasks || []
    return { done: subs.filter((sub) => sub.done).length, total: subs.length }
  }, [task])

  if (!task || !form) return null

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const commit = () => {
    const parsedTags = form.tags
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)

    onUpdate(task.id, {
      title: capitalize(form.title.trim()) || task.title,
      notes: form.notes,
      priority: form.priority,
      category: form.category,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      dueHasTime: form.dueHasTime,
      tags: [...new Set(parsedTags)],
      estimateMinutes: form.estimateMinutes ? Number(form.estimateMinutes) : null,
      assignee: form.assignee.trim() || null,
      recurrence: form.recurrence
        ? { rrule: form.recurrence, label: RECURRENCE_LABELS[form.recurrence] || form.recurrence }
        : null,
      pinned: form.pinned,
    })
  }

  /** Ré-analyse le titre comme une phrase parlée : dates, priorité, catégorie. */
  const magicAnalyze = () => {
    setAnalyzing(true)
    const interpretation = interpret(form.title, { source: 'text' })
    const draft = interpretation.tasks?.[0]
    if (draft) {
      setForm((current) => ({
        ...current,
        title: draft.title,
        dueAt: draft.dueAt ? toLocalDateTime(fromISODate(draft.dueAt)) : current.dueAt,
        dueHasTime: draft.dueHasTime,
        priority: draft.priority || current.priority,
        category: draft.category !== 'divers' ? draft.category : current.category,
        tags: [...new Set([...current.tags.split(',').map((t) => t.trim()).filter(Boolean), ...(draft.tags || [])])].join(', '),
        estimateMinutes: draft.estimateMinutes || current.estimateMinutes,
      }))
    }
    setTimeout(() => setAnalyzing(false), 450)
  }

  const addSubtask = () => {
    const title = newSubtask.trim()
    if (!title) return
    onUpdate(task.id, { subtasks: [...(task.subtasks || []), { id: uid('sub'), title: capitalize(title), done: false }] })
    setNewSubtask('')
  }

  const removeSubtask = (subtaskId) => {
    onUpdate(task.id, { subtasks: (task.subtasks || []).filter((sub) => sub.id !== subtaskId) })
  }

  const nextDate = task.recurrence?.rrule ? nextOccurrence(task.recurrence.rrule, fromISODate(task.dueAt) || new Date()) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Détail de la tâche"
      description={`Édition de la tâche ${task.title}`}
      size="md"
      initialFocusRef={titleRef}
      footer={
        <>
          <button type="button" className="btn btn-danger" onClick={() => { onDelete(task.id); onClose() }}>
            <Trash2 size={15} /> Supprimer
          </button>
          <button type="button" className="btn" onClick={onClose}>Fermer</button>
          <button type="button" className="btn btn-primary" onClick={() => { commit(); onClose() }}>
            <Check size={16} /> Enregistrer
          </button>
        </>
      }
    >
      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label htmlFor="task-title">Titre</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="task-title"
                ref={titleRef}
                className="input"
                value={form.title}
                onChange={(event) => patch('title', event.target.value)}
                onBlur={commit}
                placeholder="Ex. Appeler le client Dupont"
              />
              <button
                type="button"
                className="btn btn-icon"
                onClick={magicAnalyze}
                aria-label="Analyser le titre en langage naturel"
                title="Analyse intelligente : détecte date, priorité et catégorie dans le titre"
              >
                <motion.span animate={analyzing ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.5 }}>
                  <Wand2 size={16} />
                </motion.span>
              </button>
            </div>
            <span className="field-hint">La baguette relit le titre comme une phrase parlée et complète les champs.</span>
          </div>

          <div className="field">
            <label htmlFor="task-notes">Notes</label>
            <textarea
              id="task-notes"
              className="textarea"
              value={form.notes}
              onChange={(event) => patch('notes', event.target.value)}
              onBlur={commit}
              placeholder="Détails, contexte, liens…"
            />
          </div>

          <div className="field">
            <span className="field-label" id="subtasks-label">Sous-tâches {subtaskProgress.total > 0 && `(${subtaskProgress.done}/${subtaskProgress.total})`}</span>
            {subtaskProgress.total > 0 && (
              <Progress value={subtaskProgress.done} max={subtaskProgress.total} height={6} />
            )}
            <div role="list" aria-labelledby="subtasks-label">
              <AnimatePresence initial={false}>
                {(task.subtasks || []).map((sub) => (
                  <motion.div
                    key={sub.id}
                    className="subtask-row"
                    role="listitem"
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                  >
                    <button
                      type="button"
                      className="subtask-check"
                      aria-pressed={sub.done}
                      aria-label={`${sub.done ? 'Repasser en à faire' : 'Terminer'} : ${sub.title}`}
                      onClick={() => onToggleSubtask(task.id, sub.id)}
                    >
                      {sub.done && <Check size={12} strokeWidth={3.4} />}
                    </button>
                    <span className="subtask-title" data-done={sub.done}>{sub.title}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ width: 28, height: 28, color: 'var(--danger)' }}
                      onClick={() => removeSubtask(sub.id)}
                      aria-label={`Supprimer la sous-tâche ${sub.title}`}
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="input"
                value={newSubtask}
                onChange={(event) => setNewSubtask(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }}
                placeholder="Ajouter une étape…"
                aria-label="Nouvelle sous-tâche"
              />
              <button type="button" className="btn btn-icon" onClick={addSubtask} aria-label="Ajouter la sous-tâche">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <PriorityChip id={task.priority} />
              <CategoryChip id={task.category} />
              <DueChip task={task} />
              {task.source === 'voice' && <Chip icon="Mic">Créée à la voix</Chip>}
            </div>
            <button
              type="button"
              className={cx('btn', task.done ? '' : 'btn-primary')}
              style={{ width: '100%' }}
              onClick={() => onToggle(task.id)}
            >
              <Check size={16} /> {task.done ? 'Remettre en à faire' : 'Marquer terminée'}
            </button>
            <button
              type="button"
              className="btn"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => { patch('pinned', !form.pinned); onUpdate(task.id, { pinned: !form.pinned }) }}
              aria-pressed={form.pinned}
            >
              <Icon name={form.pinned ? 'PinOff' : 'Pin'} size={15} /> {form.pinned ? 'Désépingler' : 'Épingler en haut'}
            </button>
            {onSpeak && (
              <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => onSpeak(task)}>
                <Mic size={15} /> Lire à voix haute
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor="task-priority">Priorité</label>
            <select id="task-priority" className="select" value={form.priority} onChange={(event) => patch('priority', event.target.value)} onBlur={commit}>
              {PRIORITY_ORDER.map((key) => (
                <option key={key} value={key}>{PRIORITIES[key].label} · {PRIORITIES[key].short}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="task-category">Catégorie</label>
            <select id="task-category" className="select" value={form.category} onChange={(event) => patch('category', event.target.value)} onBlur={commit}>
              {CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>{CATEGORIES[key].label}</option>
              ))}
            </select>
            {task.auto?.categoryAlternatives?.length > 0 && (
              <span className="field-hint">
                Autres pistes détectées : {task.auto.categoryAlternatives.map((key) => CATEGORIES[key]?.label).filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="task-due">Échéance</label>
            <input
              id="task-due"
              type="datetime-local"
              className="input"
              value={form.dueAt}
              onChange={(event) => patch('dueAt', event.target.value)}
              onBlur={commit}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={form.dueHasTime}
                  onChange={(event) => patch('dueHasTime', event.target.checked)}
                  onBlur={commit}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
                />
                Heure précise
              </label>
              {form.dueAt && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { patch('dueAt', ''); commit() }}>Retirer</button>
              )}
            </div>
            {form.dueAt && (
              <span className="field-hint">{humanizeDue(new Date(form.dueAt), { withTime: form.dueHasTime })}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="task-recurrence">Récurrence</label>
            <select id="task-recurrence" className="select" value={form.recurrence} onChange={(event) => patch('recurrence', event.target.value)} onBlur={commit}>
              <option value="">Aucune</option>
              {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {nextDate && <span className="field-hint">Prochaine occurrence : {humanizeDue(nextDate)}</span>}
          </div>

          <div className="field">
            <label htmlFor="task-tags">Tags (séparés par des virgules)</label>
            <input id="task-tags" className="input" value={form.tags} onChange={(event) => patch('tags', event.target.value)} onBlur={commit} placeholder="client, urgent" />
          </div>

          <div className="field">
            <label htmlFor="task-estimate">Durée estimée (minutes)</label>
            <input
              id="task-estimate"
              type="number"
              min="0"
              step="5"
              className="input"
              value={form.estimateMinutes}
              onChange={(event) => patch('estimateMinutes', event.target.value)}
              onBlur={commit}
              placeholder="45"
            />
            {task.estimateMinutes > 0 && <span className="field-hint">Soit {formatMinutes(Number(task.estimateMinutes))}</span>}
          </div>

          <div className="field">
            <label htmlFor="task-assignee">Avec / délégué à</label>
            <input id="task-assignee" className="input" value={form.assignee} onChange={(event) => patch('assignee', event.target.value)} onBlur={commit} placeholder="Karim, le comptable…" />
          </div>

          <dl className="kv card" style={{ padding: 14, margin: 0 }}>
            <dt>Créée le</dt>
            <dd>{new Date(task.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            <dt>Source</dt>
            <dd>{SOURCE_LABELS[task.source] || task.source}</dd>
            {task.completedAt && (
              <>
                <dt>Terminée le</dt>
                <dd>{new Date(task.completedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </Modal>
  )
}

export const RECURRENCE_LABELS = {
  daily: 'Tous les jours',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
  workdays: 'Jours ouvrés',
  'weekly-day': 'Chaque semaine (même jour)',
  interval: 'Intervalle personnalisé',
}

const SOURCE_LABELS = {
  voice: 'Voix',
  text: 'Saisie texte',
  demo: 'Jeu de démonstration',
  import: 'Import',
}
