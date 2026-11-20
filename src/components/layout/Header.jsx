import { Search, Plus, Mic, Command, Sun, Moon, Volume2, VolumeX, Menu, PanelLeft } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { modifierKeyLabel } from '../../lib/utils.js'

const TITLES = {
  dashboard: { title: 'Tableau de bord', sub: 'Vue d’ensemble de ta journée et de ta charge' },
  assistant: { title: 'Assistant vocal', sub: 'Parle en français naturel, je crée, classe et retrouve' },
  today: { title: 'Aujourd’hui', sub: 'Ce qui doit avancer dans les 24 heures' },
  tasks: { title: 'Toutes les tâches', sub: 'Recherche, filtre et organise' },
  calendar: { title: 'Agenda', sub: 'Tes échéances sur le mois' },
  analytics: { title: 'Analytique', sub: 'Charge par catégorie, priorité et régularité' },
  settings: { title: 'Réglages', sub: 'Voix, affichage, accessibilité et données' },
}

export default function Header({
  view,
  categoryLabel,
  onOpenPalette,
  onQuickAdd,
  onToggleVoice,
  listening,
  onToggleTheme,
  theme,
  voiceReply,
  onToggleVoiceReply,
  onOpenMobileNav,
  onToggleSidebar,
  sidebarCollapsed,
  dateLabel,
}) {
  const meta = TITLES[view] || (categoryLabel ? { title: categoryLabel, sub: 'Tâches classées dans cette catégorie' } : { title: 'TaskVox Pro', sub: '' })

  return (
    <header className="app-header">
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Déplier le menu latéral' : 'Replier le menu latéral'}
        data-sidebar-toggle
      >
        <PanelLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={onOpenMobileNav}
        aria-label="Ouvrir le menu"
        data-mobile-menu
      >
        <Menu size={19} />
      </button>

      <div className="header-title">
        <h1>{meta.title}</h1>
        <p>{meta.sub}{dateLabel ? ` · ${dateLabel}` : ''}</p>
      </div>

      <div className="header-actions">
        <button type="button" className="search-trigger" onClick={onOpenPalette} aria-label="Ouvrir la palette de commandes et la recherche">
          <Search size={15} />
          <span className="label">Rechercher ou dicter…</span>
          <kbd><Command size={10} style={{ verticalAlign: -1 }} /> K</kbd>
        </button>

        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleVoiceReply}
          aria-pressed={voiceReply}
          aria-label={voiceReply ? 'Couper la réponse vocale' : 'Activer la réponse vocale'}
          title={voiceReply ? 'Réponses vocales activées' : 'Réponses vocales coupées'}
        >
          <Icon name={voiceReply ? 'Volume2' : 'VolumeX'} size={17} />
        </button>

        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
          title="Changer de thème"
        >
          <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={17} />
        </button>

        <button
          type="button"
          className={listening ? 'btn btn-danger btn-icon' : 'btn btn-icon'}
          onClick={onToggleVoice}
          aria-pressed={listening}
          aria-label={listening ? 'Arrêter l’écoute vocale' : 'Démarrer l’écoute vocale'}
          title={`${modifierKeyLabel} + M — écoute vocale`}
          style={listening ? { borderRadius: '50%' } : undefined}
        >
          <Icon name={listening ? 'Square' : 'Mic'} size={17} />
        </button>

        <button type="button" className="btn btn-primary header-add" onClick={onQuickAdd} aria-label="Nouvelle tâche" title="Nouvelle tâche">
          <Plus size={17} strokeWidth={2.6} /> <span className="hide-sm">Nouvelle tâche</span>
        </button>
      </div>
    </header>
  )
}
