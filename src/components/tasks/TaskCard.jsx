import { memo } from 'react'
import { motion } from 'framer-motion'
import { Check, Pin, PinOff, Trash2, Pencil, Repeat, Timer, ListChecks, Mic, Hash } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { CategoryChip, PriorityChip, DueChip } from '../primitives/Bits.jsx'
import { CATEGORIES, PRIORITIES } from '../../nlu/lexicon.js'
import { formatMinutes } from '../../nlu/answers.js'
import { cx } from '../../lib/utils.js'

function TaskCard({
  task,
  index = 0,
  onToggle,
  onOpen,
  onDelete,
  onPin,
  selected = false,
  showCategory = true,
}) {
  const category = CATEGORIES[task.category] || CATEGORIES.divers
  const priority = PRIORITIES[task.priority] || PRIORITIES.medium
  const doneSubs = (task.subtasks || []).filter((sub) => sub.done).length
  const totalSubs = (task.subtasks || []).length

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36, delay: Math.min(index * 0.018, 0.16) }}
      className={cx('task-row')}
      data-done={task.done}
      data-overdue={!task.done && task.dueAt && new Date(task.dueAt) < new Date()}
      data-selected={selected}
      style={{ '--row-accent': task.done ? 'transparent' : priority.color, borderColor: selected ? 'var(--accent)' : undefined }}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(task.id)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Tâche : ${task.title}. ${task.done ? 'Terminée.' : 'En cours.'} Priorité ${priority.label}, catégorie ${category.label}. Appuyer sur Entrée pour ouvrir le détail.`}
    >
      <button
        type="button"
        className="task-check"
        aria-pressed={task.done}
        aria-label={task.done ? `Marquer « ${task.title} » comme à faire` : `Terminer « ${task.title} »`}
        onClick={(event) => {
          event.stopPropagation()
          onToggle?.(task.id)
        }}
      >
        <motion.span
          initial={false}
          animate={{ scale: task.done ? 1 : 0, rotate: task.done ? 0 : -40 }}
          transition={{ type: 'spring', stiffness: 620, damping: 26 }}
          style={{ display: 'grid', placeItems: 'center' }}
        >
          <Check size={15} strokeWidth={3.2} />
        </motion.span>
      </button>

      <div className="task-body">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <PriorityChip id={task.priority} showLabel={false} title={`Priorité ${priority.label}`} />
          {showCategory && <CategoryChip id={task.category} />}
          <DueChip task={task} />
          {task.pinned && <span className="chip" style={{ color: 'var(--warning)' }} title="Épinglée"><Pin size={12} /> Épinglée</span>}
          {task.recurrence && <span className="chip" title={`Récurrence : ${task.recurrence.label}`}><Repeat size={12} /> {task.recurrence.label}</span>}
          {totalSubs > 0 && (
            <span className="chip" title={`${doneSubs} sur ${totalSubs} sous-tâches faites`}>
              <ListChecks size={12} /> {doneSubs}/{totalSubs}
            </span>
          )}
          {task.estimateMinutes > 0 && <span className="chip" title="Durée estimée"><Timer size={12} /> {formatMinutes(task.estimateMinutes)}</span>}
          {(task.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="chip" style={{ opacity: 0.85 }}><Hash size={11} /> {tag}</span>
          ))}
          {task.source === 'voice' && <span className="chip" title="Créée par la voix" style={{ opacity: 0.7 }}><Mic size={12} /></span>}
        </div>
        {task.notes && <div className="task-notes">{task.notes}</div>}
      </div>

      <div className="task-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          style={{ width: 32, height: 32 }}
          onClick={(event) => { event.stopPropagation(); onPin?.(task.id) }}
          aria-label={task.pinned ? `Désépingler « ${task.title} »` : `Épingler « ${task.title} »`}
          title={task.pinned ? 'Désépingler' : 'Épingler'}
        >
          <Icon name={task.pinned ? 'PinOff' : 'Pin'} size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          style={{ width: 32, height: 32 }}
          onClick={(event) => { event.stopPropagation(); onOpen?.(task.id) }}
          aria-label={`Modifier « ${task.title} »`}
          title="Ouvrir / modifier"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          style={{ width: 32, height: 32, color: 'var(--danger)' }}
          onClick={(event) => { event.stopPropagation(); onDelete?.(task.id) }}
          aria-label={`Supprimer « ${task.title} »`}
          title="Supprimer"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </motion.article>
  )
}

export default memo(TaskCard)
