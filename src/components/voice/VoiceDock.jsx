import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Loader2, AlertTriangle, Keyboard } from 'lucide-react'
import { cx } from '../../lib/utils.js'

/**
 * Dock vocal flottant : orbe animée (niveaux audio temps réel), transcription
 * live, état du microphone et messages d'erreur explicites.
 */
export default function VoiceDock({
  listening,
  interim,
  error,
  supported,
  thinking,
  onToggle,
  onOpenAssistant,
  level = 0,
  lastTranscript,
  onDismissError,
}) {
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    if (!listening) return undefined
    const timer = setInterval(() => setPulse((value) => value + 1), 2400)
    return () => clearInterval(timer)
  }, [listening])

  const statusText = thinking
    ? 'J’analyse…'
    : listening
      ? interim
        ? `« ${interim} »`
        : 'Je t’écoute…'
      : lastTranscript
        ? `Dernier : « ${lastTranscript} »`
        : 'Appuie pour parler'

  return (
    <div className="voice-dock" role="region" aria-label="Commande vocale">
      <div className="orb-wrap" data-listening={listening}>
        <span className="orb-ring" aria-hidden="true" />
        <span className="orb-ring" aria-hidden="true" />
        <span className="orb-ring" aria-hidden="true" />
        <span className="orb-level" style={{ '--level': listening ? 0.6 + level * 1.5 : 0 }} aria-hidden="true" />
        <button
          type="button"
          className="orb"
          data-listening={listening}
          onClick={onToggle}
          aria-pressed={listening}
          aria-label={listening ? 'Arrêter l’écoute vocale' : 'Démarrer l’écoute vocale et dicter une tâche'}
          title={listening ? 'Arrêter (Ctrl/⌘ + M)' : 'Parler (Ctrl/⌘ + M)'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {thinking ? (
              <motion.span key="thinking" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                <Loader2 size={21} className="spin" />
              </motion.span>
            ) : listening ? (
              <motion.span key="stop" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                <Square size={17} fill="currentColor" />
              </motion.span>
            ) : (
              <motion.span key="mic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                <Mic size={21} strokeWidth={2.4} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <div className="dock-body">
        <div className="dock-title">
          {listening ? (
            <span className="wave" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </span>
          ) : (
            <Mic size={13} />
          )}
          <span aria-live="polite">{listening ? 'Écoute en cours' : thinking ? 'Traitement' : 'Assistant vocal'}</span>
        </div>
        <div className={cx('dock-transcript', !interim && !listening && 'empty')}>{statusText}</div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onOpenAssistant} aria-label="Ouvrir l’assistant complet" title="Ouvrir l’assistant">
          <Keyboard size={16} />
        </button>
      </div>

      <AnimatePresence>
        {(error || !supported) && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: 0,
              right: 0,
              padding: '11px 13px',
              borderRadius: 14,
              border: '1px solid rgba(251,191,36,0.4)',
              background: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
              fontSize: 12.5,
              color: 'var(--text-muted)',
              textAlign: 'left',
            }}
            role="alert"
          >
            <AlertTriangle size={16} color="var(--warning)" style={{ flex: '0 0 16px', marginTop: 1 }} />
            <span>
              {error || "Ce navigateur n'expose pas la reconnaissance vocale. La saisie texte comprend exactement les mêmes phrases en français."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
