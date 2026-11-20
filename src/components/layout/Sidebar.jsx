import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Flame } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Progress } from '../primitives/Bits.jsx'
import { CATEGORIES, CATEGORY_ORDER } from '../../nlu/lexicon.js'
import { computeStats } from '../../store/useTaskStore.js'
import { cx } from '../../lib/utils.js'

const NAV_MAIN = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard', hint: '1' },
  { id: 'assistant', label: 'Assistant vocal', icon: 'Mic', hint: '2' },
  { id: 'today', label: 'Aujourd’hui', icon: 'Sun', hint: '3' },
  { id: 'tasks', label: 'Toutes les tâches', icon: 'ListTodo', hint: '4' },
  { id: 'calendar', label: 'Agenda', icon: 'CalendarDays', hint: '5' },
  { id: 'analytics', label: 'Analytique', icon: 'BarChart3' },
]

const NAV_SMART = [
  { id: 'overdue', label: 'En retard', icon: 'AlertTriangle', range: 'overdue', tone: 'danger' },
  { id: 'week', label: '7 prochains jours', icon: 'CalendarClock', range: 'week' },
  { id: 'someday', label: 'Sans échéance', icon: 'Inbox', range: 'someday' },
  { id: 'done', label: 'Terminées', icon: 'CheckCircle2', status: 'done' },
]

function Sidebar({ view, onNavigate, tasks, collapsed, onToggleCollapse, mobileOpen, onCloseMobile, onOpenSettings, onOpenShortcuts, settings }) {
  const stats = computeStats(tasks)
  const rangeCounts = {
    overdue: tasks.filter((task) => !task.done && task.dueAt && new Date(task.dueAt) < new Date()).length,
    week: tasks.filter((task) => !task.done && task.dueAt && (new Date(task.dueAt) - new Date()) / 86400000 <= 7 && (new Date(task.dueAt) - new Date()) / 86400000 >= -365).length,
    someday: tasks.filter((task) => !task.done && !task.dueAt).length,
    done: tasks.filter((task) => task.done).length,
  }

  const isSmart = (id) => NAV_SMART.some((item) => item.id === id)

  const renderItem = (item, badge, tone) => {
    const active = view === item.id
    return (
      <button
        key={item.id}
        type="button"
        className={cx('nav-item', active && 'active')}
        aria-current={active ? 'true' : undefined}
        onClick={() => { onNavigate(item); onCloseMobile?.() }}
        title={collapsed ? item.label : undefined}
      >
        <span className="icon"><Icon name={item.icon} size={17} /></span>
        {!collapsed && <span className="label">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span className={cx('nav-badge', tone === 'danger' && 'alert')}>{badge}</span>
        )}
        {collapsed && badge > 0 && (
          <span
            className={cx('nav-badge', tone === 'danger' && 'alert')}
            style={{ position: 'absolute', top: 4, right: 6, minWidth: 16, padding: '0 4px', fontSize: 9.5 }}
          >
            {badge}
          </span>
        )}
      </button>
    )
  }

  const content = (
    <>
      <div className="brand">
        <div className="brand-mark"><Icon name="Mic" size={20} strokeWidth={2.4} /></div>
        {!collapsed && (
          <div className="brand-text">
            <span className="brand-name">TaskVox <span className="gradient-text">Pro</span></span>
            <span className="brand-tag">Gestion vocale</span>
          </div>
        )}
      </div>

      <nav className="nav-section" aria-label="Navigation principale">
        {NAV_MAIN.map((item) => renderItem(item, item.id === 'assistant' ? 0 : item.id === 'today' ? stats.today : 0))}
      </nav>

      {!collapsed && (
        <>
          <div className="nav-section" aria-label="Filtres rapides">
            <div className="nav-label">Filtres rapides</div>
            {NAV_SMART.map((item) => renderItem(item, rangeCounts[item.id] || 0, item.tone))}
          </div>

          <div className="nav-section" aria-label="Catégories">
            <div className="nav-label">Catégories</div>
            {CATEGORY_ORDER.map((key) => {
              const category = CATEGORIES[key]
              const count = tasks.filter((task) => !task.done && task.category === key).length
              if (!count && key === 'divers') return null
              const active = view === `cat:${key}`
              return (
                <button
                  key={key}
                  type="button"
                  className={cx('nav-item', active && 'active')}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => { onNavigate({ id: `cat:${key}`, category: key }); onCloseMobile?.() }}
                >
                  <span className="icon" style={{ color: category.color }}>
                    <Icon name={category.icon} size={16} />
                  </span>
                  <span className="label">{category.label}</span>
                  {count > 0 && <span className="nav-badge">{count}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {!collapsed && (
        <div className="progress-mini">
          <div className="row">
            <span>Progression</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text)' }}>{stats.completionRate} %</span>
          </div>
          <Progress value={stats.done} max={Math.max(1, stats.total)} height={6} />
          <div className="row" style={{ fontSize: 11.5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Flame size={13} color="var(--warning)" /> Série : {stats.streak} j
            </span>
            <span>{stats.done}/{stats.total} faites</span>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {!collapsed && (
          <button type="button" className="btn btn-primary" onClick={() => { onNavigate({ id: 'assistant' }); onCloseMobile?.() }} style={{ width: '100%' }}>
            <Mic size={16} /> Parler à l’assistant
          </button>
        )}
        <button type="button" className="nav-item" onClick={onOpenSettings} title="Réglages">
          <span className="icon"><Icon name="Settings" size={17} /></span>
          {!collapsed && <span className="label">Réglages</span>}
        </button>
        <button type="button" className="nav-item" onClick={onOpenShortcuts} title="Raccourcis clavier">
          <span className="icon"><Icon name="Keyboard" size={17} /></span>
          {!collapsed && <span className="label">Raccourcis</span>}
          {!collapsed && <kbd style={{ marginLeft: 'auto' }}>?</kbd>}
        </button>
        {onToggleCollapse && (
          <button
            type="button"
            className="nav-item"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            title={collapsed ? 'Déplier' : 'Replier'}
          >
            <span className="icon"><Icon name={collapsed ? 'PanelLeft' : 'PanelLeftClose'} size={17} /></span>
            {!collapsed && <span className="label">Replier</span>}
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <aside
        className={cx('sidebar', mobileOpen && 'is-open')}
        aria-label="Menu principal"
        aria-hidden={false}
        style={mobileOpen ? undefined : undefined}
      >
        {content}
      </aside>
    </>
  )
}

export default memo(Sidebar)
