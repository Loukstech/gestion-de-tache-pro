import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wand2, Mic, Plus, CornerDownLeft, Sparkles } from 'lucide-react'
import Modal from '../primitives/Modal.jsx'
import Icon from '../primitives/Icon.jsx'
import { Chip, CategoryChip, PriorityChip, DueChip } from '../primitives/Bits.jsx'
import { interpret } from '../../nlu/parser.js'
import { QUICK_ADD_EXAMPLES } from '../../data/demo.js'
import { CATEGORIES, PRIORITIES } from '../../nlu/lexicon.js'
import { fromISODate } from '../../nlu/dates.js'

/**
 * Ajout rapide : une seule zone de texte, mais analysée en langage naturel.
 * « demain 15h appeler le banquier #urgent » devient une tâche datée, prioritaire
 * et classée — sans quitter le clavier.
 */
export default function QuickAddModal({ open, onClose, onSubmit, listening, interim, onToggleVoice, supported }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setText('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (listening && interim) setText(interim)
  }, [listening, interim])

  const preview = useMemo(() => {
    const value = text.replace(/^!\s*/, '').trim()
    if (value.length < 3) return null
    return interpret(value, { source: 'text' })
  }, [text])

  const draft = preview?.tasks?.[0]

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSubmit(value)
    setText('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajout rapide en langage naturel"
      description="Écris ou dicte une phrase complète : la date, la priorité et la catégorie sont détectées automatiquement."
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          {supported && (
            <button type="button" className={listening ? 'btn btn-danger' : 'btn'} onClick={onToggleVoice}>
              <Icon name={listening ? 'Square' : 'Mic'} size={15} /> {listening ? 'Arrêter la dictée' : 'Dicter'}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
            <Plus size={16} /> Créer
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="quick-add">Ta phrase</label>
        <div style={{ position: 'relative' }}>
          <textarea
            id="quick-add"
            ref={inputRef}
            className="textarea"
            style={{ minHeight: 74, paddingRight: 44 }}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="Ex. Appeler le client Dupont demain à 15h, c’est urgent"
          />
          <span style={{ position: 'absolute', right: 12, bottom: 10, color: 'var(--text-dim)' }} aria-hidden="true">
            <Wand2 size={17} />
          </span>
        </div>
        <span className="field-hint">
          <CornerDownLeft size={11} style={{ verticalAlign: -1 }} /> Entrée pour créer · Maj + Entrée pour une nouvelle ligne
        </span>
      </div>

      {draft && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
          aria-live="polite"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15} color="var(--accent-2)" />
            <strong style={{ fontSize: 13.5 }}>Ce que j’ai compris</strong>
            <Chip tone="info" style={{ marginLeft: 'auto' }}>{Math.round((preview.confidence || 0) * 100)} % de confiance</Chip>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{draft.title}</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <CategoryChip id={draft.category} />
            <PriorityChip id={draft.priority} />
            {draft.dueAt && <DueChip task={{ ...draft, dueAt: draft.dueAt }} />}
            {draft.recurrence && <Chip icon="Repeat">{draft.recurrence.label}</Chip>}
            {draft.estimateMinutes && <Chip icon="Timer">{draft.estimateMinutes} min</Chip>}
            {(draft.tags || []).map((tag) => <Chip key={tag}>#{tag}</Chip>)}
            {draft.subtasks?.length > 0 && <Chip icon="ListChecks">{draft.subtasks.length} étapes</Chip>}
          </div>
          {draft.subtasks?.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)' }}>
              {draft.subtasks.map((sub) => <li key={sub.id}>{sub.title}</li>)}
            </ol>
          )}
          {draft.category === 'divers' && !draft.dueAt && (
            <span className="field-hint">Astuce : ajoute un mot-clé (« client », « pharmacie », « facture ») ou une date (« demain ») pour un classement plus fin.</span>
          )}
        </motion.div>
      )}

      {!draft && (
        <div className="field">
          <span className="field-label">Exemples qui marchent</span>
          <div className="example-grid">
            {QUICK_ADD_EXAMPLES.map((example) => (
              <button key={example} type="button" className="example-card" onClick={() => setText(example)}>
                <span className="ex-text">{example}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
