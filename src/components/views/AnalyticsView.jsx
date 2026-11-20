import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Flame, TrendingUp, Gauge, Target } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip, Progress, SectionHead, EmptyState } from '../primitives/Bits.jsx'
import { computeStats } from '../../store/useTaskStore.js'
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, PRIORITY_ORDER } from '../../nlu/lexicon.js'
import { formatMinutes, matchesRange } from '../../nlu/answers.js'
import { fromISODate, toISODate } from '../../nlu/dates.js'

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default function AnalyticsView({ tasks, now, onNavigate }) {
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const open = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)

  const last14 = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const key = toISODate(date)
      days.push({
        key,
        date,
        label: DAY_LABELS[date.getDay()],
        created: tasks.filter((task) => toISODate(new Date(task.createdAt)) === key).length,
        completed: done.filter((task) => task.completedAt && toISODate(new Date(task.completedAt)) === key).length,
      })
    }
    return days
  }, [tasks, done, now])

  const maxBar = Math.max(1, ...last14.map((day) => Math.max(day.created, day.completed)))

  const categoryRows = useMemo(
    () =>
      CATEGORY_ORDER.map((key) => ({
        key,
        label: CATEGORIES[key].label,
        color: CATEGORIES[key].color,
        icon: CATEGORIES[key].icon,
        open: open.filter((task) => task.category === key).length,
        done: done.filter((task) => task.category === key).length,
        minutes: open.filter((task) => task.category === key).reduce((sum, task) => sum + (task.estimateMinutes || 0), 0),
      })).filter((row) => row.open + row.done > 0).sort((a, b) => b.open + b.done - (a.open + a.done)),
    [open, done],
  )

  const priorityRows = useMemo(
    () => PRIORITY_ORDER.map((key) => ({
      key,
      label: PRIORITIES[key].label,
      color: PRIORITIES[key].color,
      short: PRIORITIES[key].short,
      open: open.filter((task) => task.priority === key).length,
      done: done.filter((task) => task.priority === key).length,
    })),
    [open, done],
  )

  const totalPriority = Math.max(1, open.length)

  const tagRows = useMemo(() => {
    const map = new Map()
    tasks.forEach((task) => (task.tags || []).forEach((tag) => {
      const entry = map.get(tag) || { tag, open: 0, done: 0 }
      if (task.done) entry.done += 1
      else entry.open += 1
      map.set(tag, entry)
    }))
    return [...map.values()].sort((a, b) => b.open + b.done - (a.open + a.done)).slice(0, 10)
  }, [tasks])

  const aging = useMemo(() => {
    const buckets = [
      { label: 'Moins de 24 h', test: (task) => (now - new Date(task.createdAt)) / 3600000 < 24 },
      { label: '1 à 3 jours', test: (task) => { const h = (now - new Date(task.createdAt)) / 3600000; return h >= 24 && h < 72 } },
      { label: '3 à 7 jours', test: (task) => { const h = (now - new Date(task.createdAt)) / 3600000; return h >= 72 && h < 168 } },
      { label: 'Plus d’une semaine', test: (task) => (now - new Date(task.createdAt)) / 3600000 >= 168 },
    ]
    return buckets.map((bucket) => ({ label: bucket.label, count: open.filter(bucket.test).length }))
  }, [open, now])

  const totalTime = open.reduce((sum, task) => sum + (task.estimateMinutes || 0), 0)
  const doneTime = done.reduce((sum, task) => sum + (task.estimateMinutes || 0), 0)
  const voiceShare = tasks.length ? Math.round((tasks.filter((task) => task.source === 'voice').length / tasks.length) * 100) : 0

  if (!tasks.length) {
    return (
      <EmptyState
        icon="BarChart3"
        title="Pas encore de données à analyser"
        description="Crée quelques tâches (à la voix ou au clavier) et cette page se remplira : charge par catégorie, régularité, retards, temps estimé."
        action={<button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => onNavigate('assistant')}><Icon name="Mic" size={15} /> Ouvrir l’assistant</button>}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHead title="Analytique" subtitle={`Charge, régularité et répartition · ${stats.total} tâches au total`} as="h2" />

      <div className="grid grid-stats">
        <Metric icon="Gauge" label="Taux de complétion" value={`${stats.completionRate} %`} color="var(--accent)" hint={`${stats.done} sur ${stats.total}`} />
        <Metric icon="Flame" label="Série en cours" value={`${stats.streak} j`} color="var(--warning)" hint={stats.streak ? 'Ne casse pas la chaîne' : 'Termine une tâche aujourd’hui'} />
        <Metric icon="TrendingUp" label="Terminées (7 j)" value={stats.completedLast7} color="var(--success)" hint="Ton rythme récent" />
        <Metric icon="AlertTriangle" label="En retard" value={stats.overdue} color="var(--danger)" hint={stats.overdue ? 'À replanifier' : 'Aucun retard'} />
        <Metric icon="Timer" label="Charge restante" value={formatMinutes(totalTime) || '—'} color="var(--accent-2)" hint={doneTime ? `${formatMinutes(doneTime)} déjà faites` : 'Estimations'} />
        <Metric icon="Mic" label="Créées à la voix" value={`${voiceShare} %`} color="var(--accent-3)" hint={`${tasks.filter((task) => task.source === 'voice').length} tâches`} />
      </div>

      <div className="grid grid-2">
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Activité des 14 derniers jours</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-dim)' }}>Créations vs tâches terminées</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 148 }} role="img" aria-label="Histogramme des créations et des tâches terminées sur 14 jours">
            {last14.map((day) => (
              <div key={day.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                  <motion.div
                    title={`${day.created} créée(s)`}
                    style={{ width: 7, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 75%, transparent)' }}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(3, (day.created / maxBar) * 100)}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <motion.div
                    title={`${day.completed} terminée(s)`}
                    style={{ width: 7, borderRadius: 3, background: 'color-mix(in srgb, var(--success) 85%, transparent)' }}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(3, (day.completed / maxBar) * 100)}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                  />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>{day.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} /> Créées</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--success)', display: 'inline-block' }} /> Terminées</span>
          </div>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Répartition par catégorie</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-dim)' }}>Tâches en cours, avec le temps estimé</p>
          {categoryRows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Aucune donnée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {categoryRows.map((row) => {
                const total = row.open + row.done
                const max = categoryRows[0].open + categoryRows[0].done || 1
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => onNavigate(`cat:${row.key}`)}
                    style={{ display: 'grid', gridTemplateColumns: '132px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'inherit' }}
                    aria-label={`${row.label} : ${row.open} en cours sur ${total}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 650, color: 'var(--text-muted)', minWidth: 0 }}>
                      <Icon name={row.icon} size={14} color={row.color} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                    </span>
                    <span className="mini-bar-track" style={{ position: 'relative', height: 10 }}>
                      <motion.span
                        className="mini-bar-fill"
                        style={{ background: row.color, display: 'block' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(row.open / max) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right', minWidth: 62 }}>
                      {row.open}
                      {row.minutes > 0 && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-dim)', fontWeight: 600 }}>{formatMinutes(row.minutes)}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800 }}>Charge par priorité</h3>
          <div style={{ display: 'flex', gap: 6, height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }} role="img" aria-label="Répartition des tâches en cours par priorité">
            {priorityRows.filter((row) => row.open > 0).map((row) => (
              <motion.span
                key={row.key}
                initial={{ width: 0 }}
                animate={{ width: `${(row.open / totalPriority) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: row.color, height: '100%', display: 'block' }}
                title={`${row.label} : ${row.open}`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {priorityRows.map((row) => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: row.color, flex: '0 0 9px' }} />
                <span style={{ fontWeight: 650, minWidth: 78 }}>{row.label}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{row.short}</span>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{row.open} <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>/ {row.open + row.done}</span></span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800 }}>Ancienneté des tâches en cours</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aging.map((bucket) => (
              <div key={bucket.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5, color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span>{bucket.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{bucket.count}</span>
                </div>
                <Progress value={bucket.count} max={Math.max(1, open.length)} height={7} />
              </div>
            ))}
          </div>
          {stats.someday > 0 && (
            <p style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--text-dim)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <Icon name="Info" size={14} style={{ flex: '0 0 14px', marginTop: 1 }} />
              {stats.someday} tâche{stats.someday > 1 ? 's' : ''} sans échéance : dis « liste mes tâches sans date » puis donne-leur un jour.
            </p>
          )}
        </section>
      </div>

      {tagRows.length > 0 && (
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800 }}>Tags les plus utilisés</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tagRows.map((row) => (
              <Chip key={row.tag} icon="Hash">
                {row.tag} · {row.open + row.done}
              </Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Metric({ icon, label, value, color, hint }) {
  return (
    <motion.div className="card stat-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <div className="stat-top">
        <span className="stat-icon" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-delta">{hint}</div>}
      <span className="stat-accent" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </motion.div>
  )
}
