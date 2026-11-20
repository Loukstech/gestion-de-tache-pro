import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Send, Loader2, Volume2, Trash2, Sparkles, Keyboard, Wand2, AlertTriangle } from 'lucide-react'
import Icon from '../primitives/Icon.jsx'
import { Chip, EmptyState } from '../primitives/Bits.jsx'
import AnswerCard from './AnswerCard.jsx'
import { VOICE_EXAMPLES } from '../../data/demo.js'
import { speechRecognitionSupported, describeSpeechError } from '../../hooks/useSpeechRecognition.js'
import { cx } from '../../lib/utils.js'

/** Vue « Assistant » : la conversation complète avec l'agent de tâches. */
export default function AssistantView({
  messages,
  onSend,
  listening,
  interim,
  thinking,
  level,
  onToggleVoice,
  speechError,
  voiceReply,
  onSpeak,
  onUndo,
  onOpenTask,
  onClearConversation,
  onQuickAdd,
  autoScroll = true,
  compact = false,
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)
  const composerRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!autoScroll) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking, interim, autoScroll])

  useEffect(() => {
    if (listening && interim) setDraft(interim)
  }, [listening, interim])

  const send = (value) => {
    const text = (value ?? draft).trim()
    if (!text) return
    setDraft('')
    onSend(text)
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')

  return (
    <div className={cx('assistant-panel', compact && 'is-compact')} style={{ height: compact ? '100%' : undefined }}>
      {!compact && (
        <div className="voice-hero">
          <button
            type="button"
            className="big-orb"
            data-listening={listening}
            onClick={onToggleVoice}
            aria-pressed={listening}
            aria-label={listening ? 'Arrêter l’écoute' : 'Démarrer l’écoute vocale'}
            style={{ '--level': level }}
          >
            <span className="ring" aria-hidden="true" />
            <span className="ring" aria-hidden="true" />
            <span className="ring" aria-hidden="true" />
            <AnimatePresence mode="wait" initial={false}>
              {thinking ? (
                <motion.span key="t" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}>
                  <Loader2 size={46} className="spin" />
                </motion.span>
              ) : listening ? (
                <motion.span key="s" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}>
                  <Square size={34} fill="currentColor" />
                </motion.span>
              ) : (
                <motion.span key="m" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}>
                  <Mic size={46} strokeWidth={2.2} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <h2>
            {listening ? 'Je t’écoute…' : thinking ? 'J’analyse ta demande…' : 'Parle, je m’occupe du reste'}
          </h2>
          <p style={{ minHeight: 22 }} aria-live="polite">
            {interim || (listening ? 'Dicte une tâche ou une question en français naturel.' : 'Appuie sur l’orbe, ou écris ci-dessous. Tout est traité localement, gratuitement.')}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Chip icon="Zap" tone="info">NLU français local</Chip>
            <Chip icon="Wallet">0 € · aucune API</Chip>
            <Chip icon={voiceReply ? 'Volume2' : 'VolumeX'}>{voiceReply ? 'Réponses vocales actives' : 'Réponses vocales coupées'}</Chip>
            {!speechRecognitionSupported && <Chip icon="AlertTriangle" tone="warning">Micro non supporté ici — la saisie texte marche pareil</Chip>}
          </div>
        </div>
      )}

      <div className="conversation" ref={scrollRef} style={compact ? { flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 } : undefined}>
        {messages.length === 0 && (
          <EmptyState
            icon="MessageSquare"
            title="L’assistant est prêt"
            description="Essaie : « ajoute une tâche appeler le client Dupont demain à 15h, c’est urgent » puis « qu’est-ce que j’ai à faire aujourd’hui ? »."
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                <button type="button" className="btn btn-primary" onClick={onToggleVoice}>
                  <Mic size={15} /> Parler maintenant
                </button>
                <button type="button" className="btn" onClick={onQuickAdd}>
                  <Keyboard size={15} /> Saisie texte
                </button>
              </div>
            }
          />
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className="message"
              data-role={message.role}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <div className="message-avatar" aria-hidden="true">
                <Icon name={message.role === 'user' ? (message.source === 'voice' ? 'Mic' : 'User') : 'Sparkles'} size={16} />
              </div>
              <div className="bubble" style={message.role === 'assistant' ? { flex: 1 } : undefined}>
                {message.role === 'user' ? (
                  <>
                    <div className="bubble-text">{message.text}</div>
                    {message.source === 'voice' && (
                      <div style={{ marginTop: 6 }}>
                        <Chip icon="Mic" tone="info">Dictée vocale</Chip>
                      </div>
                    )}
                  </>
                ) : (
                  <AnswerCard
                    answer={message.answer}
                    onChip={({ command, action }) => {
                      if (action === 'create') onQuickAdd()
                      else if (command) onSend(command)
                    }}
                    onOpenTask={onOpenTask}
                    onSpeakAgain={() => onSpeak?.(message.answer?.spoken || message.text)}
                    onUndo={onUndo}
                    onPlayExample={(command) => onSend(command)}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {thinking && (
          <motion.div className="message" data-role="assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="message-avatar" aria-hidden="true"><Icon name="Sparkles" size={16} /></div>
            <div className="bubble" aria-busy="true">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-muted)', fontSize: 13.5 }}>
                <Loader2 size={15} className="spin" /> Je classe et je prépare ta réponse…
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {(speechError) && (
        <div role="alert" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 13px', borderRadius: 14, border: '1px solid rgba(251,191,36,0.4)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-muted)' }}>
          <AlertTriangle size={16} color="var(--warning)" style={{ flex: '0 0 16px', marginTop: 1 }} />
          <span>{speechError}</span>
        </div>
      )}

      <div className="composer">
        <textarea
          ref={composerRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Écris ou dicte : « qu’est-ce que j’ai à faire cette semaine ? »"
          aria-label="Message à l’assistant"
          style={{ minHeight: 40 }}
        />
        <button
          type="button"
          className={cx('btn btn-icon', listening && 'btn-danger')}
          onClick={onToggleVoice}
          aria-pressed={listening}
          aria-label={listening ? 'Arrêter la dictée' : 'Dicter'}
          title={listening ? 'Arrêter la dictée' : 'Dicter'}
        >
          <Icon name={listening ? 'Square' : 'Mic'} size={17} />
        </button>
        <button type="button" className="btn btn-primary btn-icon" onClick={() => send()} disabled={!draft.trim()} aria-label="Envoyer">
          <Send size={17} />
        </button>
      </div>

      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} /> Essaye ces phrases
          </span>
          {VOICE_EXAMPLES.slice(0, 6).map((example) => (
            <button key={example} type="button" className="chip chip-button" onClick={() => send(example)}>
              {example}
            </button>
          ))}
          {messages.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClearConversation}>
              <Trash2 size={13} /> Vider la conversation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
