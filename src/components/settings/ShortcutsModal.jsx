import Modal from '../primitives/Modal.jsx'
import Icon from '../primitives/Icon.jsx'
import { Chip } from '../primitives/Bits.jsx'
import { VOICE_EXAMPLES } from '../../data/demo.js'
import { modifierKeyLabel } from '../../lib/utils.js'

const SHORTCUTS = [
  { keys: [`${modifierKeyLabel}`, 'K'], label: 'Palette de commandes & recherche', icon: 'Command' },
  { keys: [`${modifierKeyLabel}`, 'J'], label: 'Ajout rapide en langage naturel', icon: 'Plus' },
  { keys: [`${modifierKeyLabel}`, 'M'], label: 'Démarrer / arrêter la dictée vocale', icon: 'Mic' },
  { keys: [`${modifierKeyLabel}`, '/'], label: 'Aller au champ de l’assistant', icon: 'MessageSquare' },
  { keys: ['V'], label: 'Basculer l’écoute vocale (hors champ de saisie)', icon: 'Radio' },
  { keys: ['N'], label: 'Nouvelle tâche (hors champ de saisie)', icon: 'Wand2' },
  { keys: ['1', '…', '5'], label: 'Aller à la vue 1 à 5', icon: 'LayoutDashboard' },
  { keys: ['?'], label: 'Afficher cette aide', icon: 'HelpCircle' },
  { keys: ['Échap'], label: 'Fermer la fenêtre en cours', icon: 'X' },
  { keys: ['↑', '↓', '↵'], label: 'Naviguer et valider dans la palette', icon: 'ArrowUpDown' },
]

const PRINCIPLES = [
  { icon: 'Eye', text: 'Tout est utilisable au clavier : aucune action ne dépend de la souris.' },
  { icon: 'Volume2', text: 'Chaque réponse de l’assistant est annoncée aux lecteurs d’écran (aria-live) et peut être lue à voix haute.' },
  { icon: 'Contrast', text: 'Contraste élevé, densité compacte et réduction des animations sont réglables, et prefers-reduced-motion est respecté.' },
  { icon: 'Languages', text: 'Interface et compréhension du langage entièrement en français.' },
]

export default function ShortcutsModal({ open, onClose, onPlayExample }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raccourcis, phrases vocales et accessibilité"
      description="Liste des raccourcis clavier et exemples de phrases comprises par l’assistant."
      size="md"
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Fermer</button>}
    >
      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>Raccourcis clavier</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 12, background: 'var(--surface-2)' }}>
              <Icon name={shortcut.icon} size={15} color="var(--accent-2)" />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{shortcut.label}</span>
              <span style={{ display: 'flex', gap: 3 }}>
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Phrases comprises par l’assistant</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-dim)' }}>
          Clique pour l’envoyer telle quelle. Le même moteur traite la voix et le texte.
        </p>
        <div className="example-grid">
          {VOICE_EXAMPLES.map((example) => (
            <button key={example} type="button" className="example-card" onClick={() => onPlayExample(example)}>
              <span className="ex-text">« {example} »</span>
              <span className="ex-hint"><Icon name="Play" size={11} /> Exécuter</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>Accessibilité</h3>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {PRINCIPLES.map((principle) => (
            <li key={principle.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-muted)' }}>
              <Icon name={principle.icon} size={15} color="var(--success)" style={{ flex: '0 0 15px', marginTop: 2 }} />
              {principle.text}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          <Chip icon="Wallet" tone="success">100 % gratuit</Chip>
          <Chip icon="Database">Données locales</Chip>
          <Chip icon="Zap">Aucune API externe</Chip>
        </div>
      </section>
    </Modal>
  )
}
