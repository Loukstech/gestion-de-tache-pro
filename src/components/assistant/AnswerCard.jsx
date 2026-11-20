import { motion } from 'framer-motion'
import { CheckCircle2, CalendarClock, AlertTriangle, Inbox, Volume2, Undo2 } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip, CategoryChip, PriorityChip, DueChip, Progress } from '../primitives/Bits.jsx'
import { CATEGORIES, PRIORITIES } from '../../nlu/lexicon.js'
import { formatMinutes } from '../../nlu/answers.js'
import { humanizeDue, fromISODate } from '../../nlu/dates.js'
import { cx } from '../../lib/utils.js'

const GROUP_TONE_COLOR = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  info: 'var(--info)',
  neutral: 'var(--accent)',
  muted: 'var(--text-dim)',
}

/** Rendu structuré d'une réponse de l'assistant (texte parlé + données). */
export default function AnswerCard({ answer, onChip, onOpenTask, onSpeakAgain, onUndo, onPlayExample }) {
  if (!answer) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="answer-head">
        <Icon
          name={
            answer.kind === 'create' ? 'CheckCircle2'
              : answer.kind === 'stats' ? 'BarChart3'
              : answer.kind === 'delete' ? 'Trash2'
              : answer.kind === 'complete' ? 'CheckCircle2'
              : answer.kind === 'help' ? 'HelpCircle'
              : answer.kind === 'unknown' ? 'HelpCircle'
              : answer.emptyState ? 'Inbox' : 'ListTodo'
          }
          size={16}
          color="var(--accent-2)"
        />
        <span className="answer-headline">{answer.headline}</span>
        {answer.subheadline && <span className="answer-sub">{answer.subheadline}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {onSpeakAgain && (
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} onClick={onSpeakAgain} aria-label="Réécouter la réponse" title="Réécouter">
              <Volume2 size={15} />
            </button>
          )}
          {answer.undoable && onUndo && (
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} onClick={onUndo} aria-label="Annuler la dernière action" title="Annuler">
              <Undo2 size={15} />
            </button>
          )}
        </span>
      </div>

      <div className="bubble-text">{answer.spoken}</div>

      {answer.stats?.length > 0 && (
        <div className="answer-stats">
          {answer.stats.map((stat) => (
            <div key={stat.label} className="answer-stat" data-tone={stat.tone}>
              <b style={{ color: stat.tone === 'danger' ? 'var(--danger)' : stat.tone === 'warning' ? 'var(--warning)' : stat.tone === 'success' ? 'var(--success)' : 'var(--text)' }}>
                {stat.value}
              </b>
              <span style={{ color: 'var(--text-dim)', fontSize: 11.5, fontWeight: 600 }}>{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      {answer.breakdown && (
        <div style={{ display: 'grid', gap: 14, marginTop: 4 }}>
          {answer.breakdown.byCategory?.length > 0 && (
            <div className="mini-bars" aria-label="Répartition par catégorie">
              {answer.breakdown.byCategory.slice(0, 6).map((entry) => {
                const max = answer.breakdown.byCategory[0].count || 1
                return (
                  <div key={entry.key} className="mini-bar-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontWeight: 600 }}>
                      <Icon name={CATEGORIES[entry.key]?.icon} size={13} color={entry.color} /> {entry.label}
                    </span>
                    <span className="mini-bar-track">
                      <motion.span
                        className="mini-bar-fill"
                        style={{ background: entry.color, display: 'block' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(entry.count / max) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{entry.count}</b>
                  </div>
                )
              })}
            </div>
          )}
          {answer.breakdown.byPriority?.length > 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {answer.breakdown.byPriority.map((entry) => (
                <Chip key={entry.key} color={entry.color}>
                  {entry.label} · {entry.count}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {answer.groups?.map((group, groupIndex) => (
        <div className="answer-group" key={`${group.title}-${groupIndex}`}>
          <div className="answer-group-title">
            <span className="dot" style={{ background: group.color || GROUP_TONE_COLOR[group.tone] || 'var(--accent)' }} />
            {group.title}
            <span style={{ color: 'var(--text-dim)', fontWeight: 700 }}>· {group.tasks.length}</span>
          </div>
          {group.tasks.map((task, index) => (
            <motion.button
              key={task.id || index}
              type="button"
              className="answer-task"
              style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: onOpenTask ? 'pointer' : 'default' }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.035, 0.3) }}
              onClick={() => onOpenTask?.(task.id)}
              disabled={!onOpenTask}
            >
              <span style={{ marginTop: 2, color: task.done ? 'var(--success)' : PRIORITIES[task.priority]?.color }}>
                <Icon name={task.done ? 'CheckCircle2' : 'CircleDot'} size={15} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="t-title" style={{ display: 'block' }}>{task.title}</span>
                <span className="t-meta">
                  <span style={{ color: CATEGORIES[task.category]?.color }}>{CATEGORIES[task.category]?.label}</span>
                  {task.dueAt && <span>· {humanizeDue(fromISODate(task.dueAt), { withTime: task.dueHasTime })}</span>}
                  {PRIORITIES[task.priority]?.id !== 'medium' && <span>· {PRIORITIES[task.priority]?.label}</span>}
                  {group.meta?.[index] && !task.dueAt && <span>· {group.meta[index]}</span>}
                  {task.subtasks?.length > 0 && <span>· {task.subtasks.filter((sub) => sub.done).length}/{task.subtasks.length} étapes</span>}
                </span>
              </span>
            </motion.button>
          ))}
          {group.hidden > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '2px 10px' }}>
              + {group.hidden} autre{group.hidden > 1 ? 's' : ''} — demande « liste toutes mes tâches » pour tout voir.
            </div>
          )}
        </div>
      ))}

      {answer.examples?.length > 0 && (
        <div className="example-grid" style={{ marginTop: 4 }}>
          {answer.examples.map((example) => (
            <button key={example.command} type="button" className="example-card" onClick={() => onPlayExample?.(example.command)}>
              <span className="ex-text">« {example.command} »</span>
              <span className="ex-hint"><Icon name="Mic" size={11} /> {example.intent}</span>
            </button>
          ))}
        </div>
      )}

      {answer.chips?.length > 0 && (
        <div className="answer-chips">
          {answer.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="chip chip-button"
              onClick={() => {
                if (chip.action === 'undo') onUndo?.()
                else if (chip.action === 'create') onChip?.({ action: 'create' })
                else if (chip.command) onChip?.({ command: chip.command })
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
