import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, Mic } from 'lucide-react'
import { Chip, SectionHead } from '../primitives/Bits.jsx'
import { CATEGORIES, PRIORITIES } from '../../nlu/lexicon.js'
import { fromISODate, toISODate } from '../../nlu/dates.js'
import { sortTasks } from '../../nlu/answers.js'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function startOfWeek(date) {
  const copy = new Date(date)
  const day = (copy.getDay() + 6) % 7 // lundi = 0
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - day)
  return copy
}

export default function CalendarView({ tasks, onOpenTask, onQuickAdd, onVoice, now, onToggle }) {
  const [cursor, setCursor] = useState(() => startOfWeek(now))

  const byDay = useMemo(() => {
    const map = new Map()
    tasks.forEach((task) => {
      if (!task.dueAt) return
      const key = toISODate(fromISODate(task.dueAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(task)
    })
    map.forEach((list) => sortTasks(list, 'due'))
    return map
  }, [tasks])

  const days = useMemo(() => {
    const start = startOfWeek(cursor)
    const month = cursor.getMonth()
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return { date, key: toISODate(date), outside: date.getMonth() !== month }
    })
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const todayKey = toISODate(now)
  const monthCount = tasks.filter((task) => !task.done && task.dueAt && fromISODate(task.dueAt).getMonth() === cursor.getMonth() && fromISODate(task.dueAt).getFullYear() === cursor.getFullYear()).length

  const move = (weeks) => {
    const next = new Date(cursor)
    next.setDate(next.getDate() + weeks * 7)
    setCursor(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHead
        title="Agenda"
        subtitle={`${monthLabel} · ${monthCount} tâche${monthCount > 1 ? 's' : ''} en cours ce mois-ci`}
        as="h2"
      >
        <div className="segmented" role="group" aria-label="Navigation du mois">
          <button type="button" onClick={() => move(-1)} aria-label="Semaine précédente"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => setCursor(startOfWeek(now))} aria-label="Revenir à aujourd’hui">Aujourd’hui</button>
          <button type="button" onClick={() => move(1)} aria-label="Semaine suivante"><ChevronRight size={15} /></button>
        </div>
        <button type="button" className="btn btn-sm" onClick={onVoice}><Mic size={14} /> Dicter</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onQuickAdd}><Plus size={14} /> Ajouter</button>
      </SectionHead>

      <div className="card" style={{ padding: 14 }}>
        <div className="calendar-grid" style={{ marginBottom: 8 }} aria-hidden="true">
          {DAY_LABELS.map((label) => (
            <div key={label} style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', textAlign: 'center' }}>
              {label}
            </div>
          ))}
        </div>
        <div className="calendar-grid" role="grid" aria-label={`Agenda ${monthLabel}`}>
          {days.map(({ date, key, outside }) => {
            const list = byDay.get(key) || []
            const isToday = key === todayKey
            return (
              <motion.div
                key={key}
                className="calendar-day"
                role="gridcell"
                data-outside={outside}
                data-today={isToday}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18 }}
                aria-label={`${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${list.length} tâche${list.length > 1 ? 's' : ''}`}
              >
                <div className="calendar-day-head">
                  <span className="calendar-day-num" style={isToday ? { color: 'var(--accent-2)' } : undefined}>{date.getDate()}</span>
                  {list.length > 0 && <span style={{ fontSize: 10.5, color: 'var(--text-dim)', fontWeight: 700 }}>{list.length}</span>}
                </div>
                {list.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="calendar-pill"
                    style={{ '--pill-color': PRIORITIES[task.priority]?.color, opacity: task.done ? 0.55 : 1, textDecoration: task.done ? 'line-through' : 'none' }}
                    onClick={() => onOpenTask(task.id)}
                    title={`${task.title} — ${CATEGORIES[task.category]?.label}`}
                  >
                    {task.dueHasTime ? `${fromISODate(task.dueAt).getHours()}h ` : ''}{task.title}
                  </button>
                ))}
                {list.length > 3 && <span className="calendar-more">+ {list.length - 3} autres</span>}
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip icon="Info" tone="info">Légende</Chip>
        {Object.values(PRIORITIES).map((priority) => (
          <Chip key={priority.id} color={priority.color}>{priority.label}</Chip>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
          Astuce vocale : « ajoute une tâche contrôle technique le 12 mars »
        </span>
      </div>
    </div>
  )
}
