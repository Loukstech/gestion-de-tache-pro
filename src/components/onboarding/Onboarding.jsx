import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Wand2, ArrowRight, ArrowLeft, Sparkles, Database, Wallet } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip } from '../primitives/Bits.jsx'
import { VOICE_EXAMPLES } from '../../data/demo.js'

const STEPS = [
  {
    icon: 'Mic',
    title: 'Parle, tout simplement',
    body: 'Appuie sur l’orbe (ou Ctrl/⌘ + M) et dicte en français naturel. Pas de formulaire, pas de menu : une phrase suffit.',
    examples: VOICE_EXAMPLES.slice(0, 4),
  },
  {
    icon: 'Wand2',
    title: 'Je classe comme un pro',
    body: 'Le moteur détecte la date, l’heure, la priorité, la récurrence, les sous-tâches et la catégorie (Travail, Santé, Finance, Administratif…). 13 catégories, plus de 400 mots-clés français.',
    examples: [
      'Ajoute une tâche payer la facture d’électricité tous les mois',
      'Je dois préparer la réunion de lundi avec les étapes : slides, invitation, salle',
    ],
  },
  {
    icon: 'Search',
    title: 'Demande, je réponds clairement',
    body: 'Pose une question : la réponse est structurée en groupes (en retard, aujourd’hui, cette semaine), avec les chiffres utiles et des raccourcis pour enchaîner.',
    examples: [
      'Qu’est-ce que j’ai à faire aujourd’hui ?',
      'Liste mes tâches en retard par priorité',
      'Combien de tâches j’ai cette semaine ?',
    ],
  },
  {
    icon: 'Wallet',
    title: 'Gratuit, local, privé',
    body: 'Reconnaissance vocale du navigateur + moteur de compréhension maison + stockage IndexedDB sur ton appareil. Aucun compte, aucun serveur, aucune API payante. Un export JSON est prévu pour migrer plus tard vers un service payant si tu le souhaites.',
    examples: [],
  },
]

export default function Onboarding({ onFinish, onLoadDemo, onOpenAssistant, hasTasks }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="onboarding">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="card"
        style={{ padding: 'clamp(20px, 4vw, 34px)', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Chip icon="Sparkles" tone="info">TaskVox Pro</Chip>
          <Chip icon="Languages">Français naturel</Chip>
          <Chip icon="Wallet" tone="success">0 € · aucune API</Chip>
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 5vw, 42px)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
          Ton gestionnaire de tâches <span className="gradient-text">qui t’écoute</span>
        </h1>
        <p style={{ margin: '12px auto 0', maxWidth: 620, color: 'var(--text-muted)', fontSize: 15 }}>
          Une phrase, et la tâche est créée, datée, priorisée et rangée dans la bonne catégorie.
          Une question, et tu obtiens une réponse claire et structurée.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '24px 0 6px' }}>
          {STEPS.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              onClick={() => setStep(index)}
              aria-label={`Étape ${index + 1} : ${entry.title}`}
              aria-current={index === step}
              style={{
                width: index === step ? 30 : 9,
                height: 9,
                borderRadius: 999,
                border: 0,
                cursor: 'pointer',
                background: index === step ? 'linear-gradient(90deg, var(--accent), var(--accent-2))' : 'var(--border-strong)',
                transition: 'all 260ms cubic-bezier(0.22,1,0.36,1)',
                padding: 0,
              }}
            />
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.section
          key={current.title}
          className="card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{ padding: 'clamp(18px, 3vw, 26px)' }}
        >
          <div className="step-card">
            <div className="step-num"><Icon name={current.icon} size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: '4px 0 6px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{current.title}</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14.5, lineHeight: 1.65 }}>{current.body}</p>

              {current.examples.length > 0 && (
                <div className="example-grid" style={{ marginTop: 16 }}>
                  {current.examples.map((example) => (
                    <div key={example} className="example-card" style={{ cursor: 'default' }}>
                      <span className="ex-text">« {example} »</span>
                      <span className="ex-hint"><Icon name="Mic" size={11} /> À dire ou à écrire</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            {step > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={15} /> Précédent
              </button>
            )}
            {!last ? (
              <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
                Suivant <ArrowRight size={15} />
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={() => { onFinish(); onOpenAssistant() }}>
                  <Mic size={16} /> Commencer à parler
                </button>
                {!hasTasks && (
                  <button type="button" className="btn" onClick={() => { onLoadDemo(); onFinish() }}>
                    <Database size={15} /> Charger des exemples
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={onFinish}>
              Passer <ArrowRight size={14} />
            </button>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  )
}
