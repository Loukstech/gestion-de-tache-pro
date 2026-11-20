import { motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { CATEGORIES, PRIORITIES } from '../../nlu/lexicon.js'
import { humanizeDue, fromISODate, daysBetween } from '../../nlu/dates.js'
import { cx } from '../../lib/utils.js'

export function Chip({ children, tone, icon, color, as = 'span', className, ...rest }) {
  const Component = as
  return (
    <Component className={cx('chip', className)} data-tone={tone} {...rest}>
      {color && <span className="chip-dot" style={{ background: color }} />}
      {!color && icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </Component>
  )
}

export function CategoryChip({ id, showLabel = true, ...rest }) {
  const category = CATEGORIES[id] || CATEGORIES.divers
  return (
    <Chip color={category.color} title={`Catégorie : ${category.label}`} {...rest}>
      {showLabel && category.label}
    </Chip>
  )
}

export function PriorityChip({ id, showLabel = true, ...rest }) {
  const priority = PRIORITIES[id] || PRIORITIES.medium
  const tone = id === 'critical' ? 'danger' : id === 'high' ? 'warning' : id === 'low' ? 'info' : undefined
  return (
    <Chip color={priority.color} tone={tone} title={`Priorité : ${priority.label}`} {...rest}>
      {showLabel && priority.label}
    </Chip>
  )
}

/** Échéance avec code couleur automatique : retard / aujourd'hui / bientôt. */
export function DueChip({ task, now = new Date(), showLabel = true }) {
  if (!task?.dueAt) return null
  const due = fromISODate(task.dueAt)
  const delta = daysBetween(now, due)
  const late = !task.done && due.getTime() < now.getTime()
  const tone = late ? 'danger' : delta === 0 ? 'warning' : delta === 1 ? 'info' : undefined
  return (
    <Chip tone={tone} icon={late ? 'AlertTriangle' : 'CalendarClock'} title={`Échéance : ${due.toLocaleString('fr-FR')}`}>
      {showLabel && humanizeDue(due, { withTime: task.dueHasTime })}
    </Chip>
  )
}

export function Progress({ value, max = 100, label, color, height = 8, showValue = false }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
          <span>{label}</span>
          {showValue && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>}
        </div>
      )}
      <div
        className="progress-track"
        style={{ height }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progression'}
      >
        <motion.div
          className="progress-fill"
          style={{ background: color ? `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, var(--accent-2)))` : undefined }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={13} style={{ marginRight: 5, verticalAlign: -2 }} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, description, id }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-title" id={id ? `${id}-label` : undefined}>{label}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}

export function EmptyState({ icon = 'Inbox', title, description, action }) {
  return (
    <div className="empty-state">
      <div className="icon-wrap"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function SectionHead({ title, subtitle, children, as: Heading = 'h2' }) {
  return (
    <div className="section-head">
      <div>
        <Heading>{title}</Heading>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="filter-bar">{children}</div>}
    </div>
  )
}
