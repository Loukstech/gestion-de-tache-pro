import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Mic, Plus, CheckCircle2, AlertTriangle, Coffee, Sunrise, Sunset } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip, Progress, SectionHead, EmptyState } from '../primitives/Bits.jsx'
import TaskCard from '../tasks/TaskCard.jsx'
import { matchesRange, sortTasks, formatMinutes } from '../../nlu/answers.js'
import { PRIORITIES, CATEGORIES } from '../../nlu/lexicon.js'
import { fromISODate } from '../../nlu/dates.js'

const SLOT_ORDER = [
  { id: 'matin', label: 'Matin', icon: 'Sunrise', test: (h) => h < 12 },
  { id: 'apres-midi', label: 'Après-midi', icon: 'Sun', test: (h) => h >= 12 && h < 18 },
  { id: 'soir', label: 'Soir', icon: 'Sunset', test: (h) => h >= 18 },
]

/** Vue « Aujourd’hui » : la journée en un coup d’œil, avec plan par moment. */
export default function TodayView({ tasks, now, onOpenTask, onToggle, onDelete, onPin, onQuickAdd, onVoice, onSend, onNavigate }) {
  const open = useMemo(() => tasks.filter((task) => !task.done), [tasks])

  const overdue = useMemo(() => sortTasks(open.filter((task) => matchesRange(task, 'overdue', now)), 'smart'), [open, now])
  const today = useMemo(
    () => sortTasks(open.filter((task) => task.dueAt && !matchesRange(task, 'overdue', now) && fromISODate(task.dueAt).toDateString() === now.toDateString()), 'smart'),
    [open, now],
  )
  const unscheduled = useMemo(() => sortTasks(open.filter((task) => !task.dueAt), 'smart').slice(0, 6), [open])
  const tomorrow = useMemo(
    () => sortTasks(open.filter((task) => task.dueAt && matchesRange(task, 'tomorrow', now)), 'due').slice(0, 5),
    [open, now],
  )

  const slots = useMemo(() => {
    const dated = [...overdue, ...today].filter((task) => task.dueAt)
    return SLOT_ORDER.map((slot) => ({
      ...slot,
      tasks: sortTasks(dated.filter((task) => slot.test(fromISODate(task.dueAt).getHours())), 'due'),
    })).filter((slot) => slot.tasks.length)
  }, [overdue, today])

  const totalToday = overdue.length + today.length
  const doneToday = tasks.filter((task) => task.done && task.completedAt && fromISODate(task.completedAt).toDateString() === now.toDateString()).length
  const progress = totalToday + doneToday ? Math.round((doneToday / (totalToday + doneToday)) * 100) : 0
  const minutes = [...overdue, ...today].reduce((sum, task) => sum + (task.estimateMinutes || 0), 0)
  const critical = [...overdue, ...today].filter((task) => task.priority === 'critical' || task.priority === 'high')

  const topFocus = critical[0] || overdue[0] || today[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHead
        title="Aujourd’hui"
        subtitle={now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        as="h2"
      >
        <button type="button" className="btn btn-sm" onClick={onVoice}><Mic size={14} /> Dicter</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onQuickAdd}><Plus size={14} /> Ajouter</button>
      </SectionHead>

      <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
              <Chip icon="ListTodo" tone={totalToday ? 'info' : 'success'}>{totalToday} à faire</Chip>
              {overdue.length > 0 && <Chip icon="AlertTriangle" tone="danger">{overdue.length} en retard</Chip>}
              {doneToday > 0 && <Chip icon="CheckCircle2" tone="success">{doneToday} déjà bouclées</Chip>}
              {minutes > 0 && <Chip icon="Timer">{formatMinutes(minutes)} estimées</Chip>}
            </div>
            <h3 style={{ margin: 0, fontSize: 'clamp(19px, 2.6vw, 25px)', fontWeight: 800, letterSpacing: '-0.025em' }}>
              {totalToday === 0
                ? 'Journée dégagée, rien d’échu aujourd’hui.'
                : overdue.length > 0
                  ? `Commence par rattraper ${overdue.length} retard${overdue.length > 1 ? 's' : ''}.`
                  : `${totalToday} tâche${totalToday > 1 ? 's' : ''} au programme.`}
            </h3>
            {topFocus && (
              <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
                Priorité du jour : <strong style={{ color: 'var(--text)' }}>{topFocus.title}</strong>
                {topFocus.dueAt ? ` · ${fromISODate(topFocus.dueAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            )}
          </div>

          <div style={{ flex: '0 1 240px', minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700 }}>
              <span>Journée accomplie</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{progress} %</b>
            </div>
            <Progress value={doneToday} max={Math.max(1, totalToday + doneToday)} height={10} />
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {['critical', 'high', 'medium', 'low'].map((key) => {
                const count = [...overdue, ...today].filter((task) => task.priority === key).length
                if (!count) return null
                return <Chip key={key} color={PRIORITIES[key].color}>{PRIORITIES[key].short} · {count}</Chip>
              })}
            </div>
          </div>
        </div>
      </motion.section>

      {overdue.length > 0 && (
        <section aria-labelledby="today-overdue">
          <div className="task-group-head">
            <Icon name="AlertTriangle" size={15} color="var(--danger)" />
            <h3 id="today-overdue" style={{ color: 'var(--danger)' }}>En retard</h3>
            <span className="count">{overdue.length}</span>
            <span className="line" />
          </div>
          <div className="task-list">
            {overdue.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} onToggle={onToggle} onOpen={onOpenTask} onDelete={onDelete} onPin={onPin} />
            ))}
          </div>
        </section>
      )}

      {today.length > 0 && (
        <section aria-labelledby="today-day">
          <div className="task-group-head">
            <Icon name="Sun" size={15} color="var(--warning)" />
            <h3 id="today-day">Échu aujourd’hui</h3>
            <span className="count">{today.length}</span>
            <span className="line" />
          </div>
          <div className="task-list">
            {today.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} onToggle={onToggle} onOpen={onOpenTask} onDelete={onDelete} onPin={onPin} />
            ))}
          </div>
        </section>
      )}

      {totalToday === 0 && (
        <EmptyState
          icon="Coffee"
          title="Aucune échéance aujourd’hui"
          description="Tu peux planifier la suite à la voix : « ajoute une tâche préparer le rapport pour demain matin »."
          action={
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={onVoice}><Mic size={15} /> Parler</button>
              <button type="button" className="btn" onClick={() => onNavigate('tasks')}><Icon name="Inbox" size={15} /> Voir les tâches sans date</button>
            </div>
          }
        />
      )}

      <div className="grid grid-2">
        {slots.length > 0 && (
          <section className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14.5, fontWeight: 800 }}>Plan de la journée</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {slots.map((slot) => (
                <div key={slot.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                    <Icon name={slot.icon} size={13} /> {slot.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {slot.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        style={{ display: 'flex', gap: 9, alignItems: 'center', textAlign: 'left', font: 'inherit', background: 'var(--surface-2)', border: '1px solid transparent', borderRadius: 11, padding: '8px 10px', cursor: 'pointer', width: '100%', color: 'inherit' }}
                      >
                        <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)', fontWeight: 700, minWidth: 38 }}>
                          {fromISODate(task.dueAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITIES[task.priority]?.color, flex: '0 0 7px' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14.5, fontWeight: 800 }}>Demain</h3>
          {tomorrow.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Rien de planifié pour demain. Dis « ajoute une tâche … demain » pour préparer la suite.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {tomorrow.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  style={{ display: 'flex', gap: 9, alignItems: 'center', textAlign: 'left', font: 'inherit', background: 'var(--surface-2)', border: 0, borderRadius: 11, padding: '8px 10px', cursor: 'pointer', width: '100%', color: 'inherit' }}
                >
                  <Icon name={CATEGORIES[task.category]?.icon} size={14} color={CATEGORIES[task.category]?.color} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                  <Chip>{task.dueHasTime ? fromISODate(task.dueAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Journée'}</Chip>
                </button>
              ))}
            </div>
          )}

          {unscheduled.length > 0 && (
            <>
              <h3 style={{ margin: '18px 0 12px', fontSize: 14.5, fontWeight: 800 }}>Sans échéance · à placer</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {unscheduled.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    style={{ display: 'flex', gap: 9, alignItems: 'center', textAlign: 'left', font: 'inherit', background: 'transparent', border: '1px solid var(--border)', borderRadius: 11, padding: '8px 10px', cursor: 'pointer', width: '100%', color: 'inherit' }}
                  >
                    <Icon name="Inbox" size={14} color="var(--text-dim)" />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <Chip color={CATEGORIES[task.category]?.color}>{CATEGORIES[task.category]?.label}</Chip>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
