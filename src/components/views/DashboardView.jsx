import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus, Mic, Flame, Target, ArrowRight, CalendarClock, ListChecks, Timer } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip, CategoryChip, PriorityChip, DueChip, Progress, SectionHead, EmptyState } from '../primitives/Bits.jsx'
import TaskCard from '../tasks/TaskCard.jsx'
import { computeStats } from '../../store/useTaskStore.js'
import { matchesRange, sortTasks, formatMinutes } from '../../nlu/answers.js'
import { CATEGORIES, PRIORITIES, PRIORITY_ORDER } from '../../nlu/lexicon.js'
import { fromISODate } from '../../nlu/dates.js'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
}

export default function DashboardView({ tasks, onOpenTask, onToggle, onDelete, onPin, onQuickAdd, onVoice, onNavigate, now }) {
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const open = useMemo(() => tasks.filter((task) => !task.done), [tasks])

  const focus = useMemo(() => {
    const overdue = open.filter((task) => matchesRange(task, 'overdue', now))
    const today = open.filter((task) => matchesRange(task, 'today', now) && !matchesRange(task, 'overdue', now))
    return sortTasks([...overdue, ...today], 'smart').slice(0, 6)
  }, [open, now])

  const upcoming = useMemo(
    () => sortTasks(open.filter((task) => task.dueAt && !matchesRange(task, 'today', now) && !matchesRange(task, 'overdue', now)), 'due').slice(0, 5),
    [open, now],
  )

  const topCategories = useMemo(
    () => stats.byCategory.filter((entry) => entry.open > 0).sort((a, b) => b.open - a.open).slice(0, 5),
    [stats],
  )

  const load = useMemo(() => {
    const totalMinutes = open.reduce((sum, task) => sum + (task.estimateMinutes || 0), 0)
    return { minutes: totalMinutes, label: formatMinutes(totalMinutes) }
  }, [open])

  const recentDone = useMemo(
    () => tasks.filter((task) => task.done).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)).slice(0, 4),
    [tasks],
  )

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <motion.section variants={item} className="card" style={{ padding: 'clamp(18px, 3vw, 28px)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <Chip icon="CalendarClock">
                {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Chip>
              {stats.streak > 0 && <Chip icon="Flame" tone="warning">{stats.streak} jours d’affilée</Chip>}
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              {greeting}. {stats.overdue > 0
                ? <><span className="gradient-text">{stats.overdue} tâche{stats.overdue > 1 ? 's' : ''} en retard</span> à rattraper.</>
                : stats.today > 0
                  ? <>Tu as <span className="gradient-text">{stats.today} tâche{stats.today > 1 ? 's' : ''}</span> aujourd’hui.</>
                  : <>Rien d’urgent, <span className="gradient-text">journée libre</span>.</>}
            </h2>
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 14.5, maxWidth: 620 }}>
              {stats.open} en cours · {stats.week} sur les 7 prochains jours · {stats.completionRate} % de ton liste terminée
              {load.minutes > 0 ? ` · charge estimée ${load.label}` : ''}.
            </p>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={onVoice}>
                <Mic size={16} /> Parler à l’assistant
              </button>
              <button type="button" className="btn" onClick={onQuickAdd}>
                <Plus size={16} /> Nouvelle tâche
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onNavigate('today')}>
                <Target size={15} /> Voir la journée <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div style={{ flex: '0 1 260px', minWidth: 210 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700 }}>Avancement global</span>
              <b style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{stats.completionRate}<span style={{ fontSize: 14, color: 'var(--text-dim)' }}> %</span></b>
            </div>
            <Progress value={stats.done} max={Math.max(1, stats.total)} height={10} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
              <span>{stats.done} terminées</span>
              <span>{stats.open} restantes</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {PRIORITY_ORDER.map((key) => {
                const count = open.filter((task) => task.priority === key).length
                if (!count) return null
                return (
                  <Chip key={key} color={PRIORITIES[key].color} title={`${PRIORITIES[key].label} : ${count}`}>
                    {PRIORITIES[key].short} · {count}
                  </Chip>
                )
              })}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section variants={item} className="grid grid-stats" aria-label="Indicateurs clés">
        <StatCard icon="AlertTriangle" label="En retard" value={stats.overdue} color="var(--danger)" hint={stats.overdue ? 'À traiter en premier' : 'Aucun retard'} onClick={() => onNavigate('overdue')} />
        <StatCard icon="Sun" label="Aujourd’hui" value={stats.today} color="var(--warning)" hint="Échéance du jour" onClick={() => onNavigate('today')} />
        <StatCard icon="CalendarClock" label="7 prochains jours" value={stats.week} color="var(--accent-2)" hint="Charge à venir" onClick={() => onNavigate('week')} />
        <StatCard icon="Inbox" label="Sans échéance" value={stats.someday} color="var(--text-dim)" hint="À dater" onClick={() => onNavigate('someday')} />
        <StatCard icon="Timer" label="Temps estimé" value={load.label || '—'} color="var(--accent)" hint="Somme des durées" small />
        <StatCard icon="CheckCircle2" label="Terminées 7 j" value={stats.completedLast7} color="var(--success)" hint="Rythme récent" />
      </motion.section>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 22 }} data-dashboard-grid>
        <motion.section variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <SectionHead
            title="À traiter en priorité"
            subtitle="Retards et échéances du jour, triés par priorité"
            as="h2"
          >
            {focus.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('today')}>
                Tout voir <ArrowRight size={13} />
              </button>
            )}
          </SectionHead>

          {focus.length === 0 ? (
            <EmptyState
              icon="CheckCircle2"
              title="Rien d’urgent aujourd’hui"
              description="Profites-en pour planifier la suite à la voix : « ajoute une tâche préparer le rapport de vendredi »."
              action={<button type="button" className="btn btn-primary" style={{ marginTop: 6 }} onClick={onVoice}><Mic size={15} /> Dictée une tâche</button>}
            />
          ) : (
            <div className="task-list">
              {focus.map((task, index) => (
                <TaskCard key={task.id} task={task} index={index} onToggle={onToggle} onOpen={onOpenTask} onDelete={onDelete} onPin={onPin} />
              ))}
            </div>
          )}
        </motion.section>

        <motion.section variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>Charge par catégorie</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('analytics')}>Analytique</button>
            </div>
            {topCategories.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Aucune tâche en cours pour l’instant.</p>
            ) : (
              <div className="mini-bars">
                {topCategories.map((entry) => {
                  const max = topCategories[0].open || 1
                  return (
                    <div key={entry.key} className="mini-bar-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-muted)' }}>
                        <Icon name={CATEGORIES[entry.key]?.icon} size={13} color={entry.color} /> {entry.label}
                      </span>
                      <span className="mini-bar-track">
                        <motion.span
                          className="mini-bar-fill"
                          style={{ background: entry.color, display: 'block' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(entry.open / max) * 100}%` }}
                          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </span>
                      <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{entry.open}</b>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Prochaines échéances</h3>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Rien de planifié après aujourd’hui.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', font: 'inherit', background: 'var(--surface-2)', border: '1px solid transparent', borderRadius: 12, padding: '9px 11px', cursor: 'pointer', width: '100%' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITIES[task.priority]?.color, flex: '0 0 8px' }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-dim)' }}>{CATEGORIES[task.category]?.label}</span>
                    </span>
                    <Chip tone={task.dueAt && new Date(task.dueAt) < now ? 'danger' : undefined}>{task.dueAt ? new Date(task.dueAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}</Chip>
                  </button>
                ))}
              </div>
            )}
          </div>

          {recentDone.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Récemment bouclé</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {recentDone.map((task) => (
                  <div key={task.id} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                    <Icon name="CheckCircle2" size={14} color="var(--success)" />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through', opacity: 0.75 }}>{task.title}</span>
                    {task.completedAt && <span style={{ fontSize: 11.5, color: 'var(--text-dim)', flex: '0 0 auto' }}>{new Date(task.completedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      </div>
    </motion.div>
  )
}

function StatCard({ icon, label, value, color, hint, onClick, small }) {
  return (
    <motion.button
      type="button"
      variants={item}
      className="card card-hover stat-card"
      onClick={onClick}
      style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: onClick ? 'pointer' : 'default' }}
      aria-label={`${label} : ${value}. ${hint || ''}`}
    >
      <div className="stat-top">
        <span className="stat-icon" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Icon name={icon} size={18} />
        </span>
        {hint && <span className="stat-delta">{hint}</span>}
      </div>
      <div className="stat-value" style={{ fontSize: small ? 22 : undefined }}>{value}</div>
      <div className="stat-label">{label}</div>
      <span className="stat-accent" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </motion.button>
  )
}
