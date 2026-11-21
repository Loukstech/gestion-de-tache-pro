import { Fragment, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Upload, Trash2, Wand2, Volume2, Database, Mic } from 'lucide-react'
import Modal from '../primitives/Modal.jsx'
import Icon from '../primitives/Icon.jsx'
import { Switch, Segmented, Chip } from '../primitives/Bits.jsx'
import { speechRecognitionSupported } from '../../hooks/useSpeechRecognition.js'
import { speechSynthesisSupported, describeVoice, NATURAL_VOICE_PRESET, GOOGLE_VOICES } from '../../hooks/useSpeechSynthesis.js'
import { CATEGORIES, CATEGORY_ORDER } from '../../nlu/lexicon.js'
import { aiUrl } from '../../lib/ai-url.js'

const ACCENTS = [
  { value: 'violet', label: 'Violet', color: '#7c5cff' },
  { value: 'ocean', label: 'Océan', color: '#3b82f6' },
  { value: 'emeraude', label: 'Émeraude', color: '#10b981' },
  { value: 'soleil', label: 'Soleil', color: '#f59e0b' },
  { value: 'rose', label: 'Rose', color: '#ec4899' },
]

export default function SettingsModal({
  open,
  onClose,
  settings,
  onSettings,
  frenchVoices,
  onExport,
  onImport,
  onLoadDemo,
  onClearTasks,
  onClearConversation,
  taskCount,
  backend,
  onTestVoice,
  cloud,
  onCloudSignIn,
  onCloudSignUp,
  onCloudSignOut,
  onCloudSyncNow,
}) {
  const fileRef = useRef(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [ttsReady, setTtsReady] = useState(false)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  useEffect(() => {
    if (!open) return
    let active = true
    fetch(aiUrl('/api/ai/status')).then((res) => res.ok ? res.json() : Promise.reject()).then((data) => {
      if (!active) return
      setAiStatus(data.configured ? 'configured' : 'missing')
      setTtsReady(Boolean(data.tts))
    }).catch(() => { if (active) { setAiStatus('missing'); setTtsReady(false) } })
    return () => { active = false }
  }, [open])

  const handleImport = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        onImport(data)
      } catch {
        window.alert("Fichier illisible : attends-toi à un export JSON TaskVox.")
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Réglages"
      description="Voix, apparence, accessibilité et données. Tout est enregistré localement sur cet appareil."
      size="md"
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Fermer</button>}
    >
      <Tabbed>
        {(tab) => tab === 'voix' && (
          <section className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mic size={16} color="var(--accent-2)" /> Voix
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-dim)' }}>
              La dictée utilise le navigateur. Les réponses parlées utilisent la voix Google (API Gemini, clés protégées sur le serveur), avec repli automatique sur la voix locale.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Chip icon={speechRecognitionSupported ? 'CheckCircle2' : 'AlertTriangle'} tone={speechRecognitionSupported ? 'success' : 'warning'}>
                Dictée vocale : {speechRecognitionSupported ? 'disponible' : 'indisponible sur ce navigateur'}
              </Chip>
              <Chip icon={ttsReady ? 'CheckCircle2' : 'AlertTriangle'} tone={ttsReady ? 'success' : 'warning'}>
                Voix Google : {ttsReady ? 'disponible' : 'non configurée'}
              </Chip>
              <Chip icon={speechSynthesisSupported ? 'CheckCircle2' : 'AlertTriangle'} tone={speechSynthesisSupported ? 'success' : 'warning'}>
                Voix de secours : {speechSynthesisSupported ? 'disponible' : 'indisponible'}
              </Chip>
            </div>

            <Switch
              id="set-voice-reply"
              label="Répondre à voix haute"
              description="L’assistant lit ses réponses (utile en mains libres)."
              checked={settings.voiceReply}
              onChange={(value) => onSettings({ voiceReply: value })}
            />

            <Switch
              id="set-google-voice"
              label="Voix Google naturelle"
              description="Utilise l’API Gemini pour une prononciation bien plus naturelle, y compris sur iPhone. Si elle échoue, l’appli repasse sur la voix du navigateur."
              checked={settings.googleVoice !== false}
              onChange={(value) => onSettings({ googleVoice: value })}
            />

            {settings.googleVoice !== false && (
              <div className="setting-row">
                <div className="setting-text">
                  <div className="setting-title" id="set-google-voice-name">Timbre Google</div>
                  <div className="setting-desc">Choisis le timbre qui te plaît ; tous parlent français.</div>
                </div>
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  aria-labelledby="set-google-voice-name"
                  value={settings.googleVoiceName || 'Kore'}
                  onChange={(event) => onSettings({ googleVoiceName: event.target.value })}
                >
                  {GOOGLE_VOICES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title" id="set-voice-name">Voix de secours (navigateur)</div>
                <div className="setting-desc">{frenchVoices.length ? `${frenchVoices.length} voix française${frenchVoices.length > 1 ? 's' : ''} détectée${frenchVoices.length > 1 ? 's' : ''} · utilisée seulement si Google est indisponible.` : 'Aucune voix française détectée : la voix par défaut du système sera utilisée'}</div>
              </div>
              <select
                className="select"
                style={{ maxWidth: 220 }}
                aria-labelledby="set-voice-name"
                value={settings.voiceName || ''}
                onChange={(event) => onSettings({ voiceName: event.target.value || null })}
              >
                <option value="">Automatique</option>
                {frenchVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>{describeVoice(voice)}</option>
                ))}
              </select>
            </div>

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title"><label htmlFor="set-rate">Vitesse de parole · {settings.rate.toFixed(2)}×</label></div>
                <div className="setting-desc">Plus lent = plus intelligible, plus rapide = plus naturel.</div>
              </div>
              <input
                id="set-rate"
                type="range"
                min="0.6"
                max="1.6"
                step="0.02"
                value={settings.rate}
                onChange={(event) => onSettings({ rate: Number(event.target.value) })}
                style={{ width: 168, accentColor: 'var(--accent)' }}
              />
            </div>

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title"><label htmlFor="set-pitch">Hauteur de voix · {settings.pitch.toFixed(2)}</label></div>
              </div>
              <input
                id="set-pitch"
                type="range"
                min="0.5"
                max="1.6"
                step="0.05"
                value={settings.pitch}
                onChange={(event) => onSettings({ pitch: Number(event.target.value) })}
                style={{ width: 168, accentColor: 'var(--accent)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={onTestVoice} disabled={!speechSynthesisSupported && !ttsReady}>
                <Volume2 size={14} /> Tester la voix
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onSettings(NATURAL_VOICE_PRESET)}
              >
                <Wand2 size={14} /> Réglage naturel
              </button>
            </div>
            <div className="setting-desc" style={{ marginTop: 6 }}>
              « Réglage naturel » adopte un débit plus calme et sélectionne la meilleure voix française de secours. Avec Google activé, la hauteur et la vitesse de secours ne s’appliquent pas.
            </div>

            <Switch
              id="set-show-dock"
              label="Bouton flottant vocal"
              description="Afficher l’orbe et le dock en bas de l’écran. Tu peux le masquer ici sans perdre le micro dans l’assistant."
              checked={settings.showVoiceDock !== false}
              onChange={(value) => onSettings({ showVoiceDock: value })}
            />

            <Switch
              id="set-continuous"
              label="Écoute continue"
              description="Le micro se relance automatiquement après un silence pour enchaîner plusieurs tâches."
              checked={settings.continuous}
              onChange={(value) => onSettings({ continuous: value })}
            />
            <Switch
              id="set-confirm"
              label="Confirmer avant suppression multiple"
              description="Au-delà de 3 tâches concernées, l’assistant demande « oui » ou « non »."
              checked={settings.confirmDestructive}
              onChange={(value) => onSettings({ confirmDestructive: value })}
            />
          </section>
        )}

        {(tab) => tab === 'ia' && (
          <section className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>Agent IA</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              L'agent écoute, raisonne avec l'historique et l'état de tes tâches, puis exécute les actions nécessaires (créer, retrouver, modifier, terminer, supprimer après confirmation) avant de te répondre.
            </p>
            <Chip tone={aiStatus === 'configured' ? 'success' : 'warning'}>{aiStatus === 'configured' ? 'Clé configurée côté serveur' : aiStatus === 'missing' ? 'Clé non configurée côté serveur' : 'Vérification de la configuration…'}</Chip>
            <Switch id="set-agent" label="Mode agent" description="Boucle raison → agir → vérifier. Sans clé serveur, l'application repasse automatiquement sur le moteur local." checked={settings.agentMode !== false} onChange={(value) => onSettings({ agentMode: value })} />
            <Switch id="set-ai" label="Compréhension simple (repli)" description="Ancien mode : Gemini interprète seulement création et consultation. Utile si le mode agent échoue." checked={Boolean(settings.aiEnabled)} onChange={(value) => onSettings({ aiEnabled: value })} />
            <p className="field-hint">Configure GEMINI_API_KEYS côté serveur et redémarre l'application. Ne colle pas ta clé dans une conversation. L'agent envoie la phrase, l'historique et un résumé des tâches à Google ; l'offre gratuite dépend des quotas.</p>
          </section>
        )}

        {(tab) => tab === 'apparence' && (
          <section className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>Apparence & accessibilité</h3>

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title">Thème</div>
                <div className="setting-desc">Sombre par défaut, clair en journée.</div>
              </div>
              <Segmented
                ariaLabel="Thème"
                value={settings.theme || 'dark'}
                onChange={(value) => onSettings({ theme: value })}
                options={[
                  { value: 'dark', label: 'Sombre', icon: 'Moon' },
                  { value: 'light', label: 'Clair', icon: 'Sun' },
                ]}
              />
            </div>

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title">Couleur d’accent</div>
                <div className="setting-desc">Appliquée aux dégradés, orbe vocale et éléments actifs.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.value}
                    type="button"
                    onClick={() => onSettings({ accent: accent.value })}
                    aria-label={`Accent ${accent.label}`}
                    aria-pressed={settings.accent === accent.value}
                    style={{
                      width: 30, height: 30, borderRadius: 10, border: '2px solid',
                      borderColor: settings.accent === accent.value ? 'var(--text)' : 'transparent',
                      background: `linear-gradient(135deg, ${accent.color}, color-mix(in srgb, ${accent.color} 40%, #22d3ee))`,
                      cursor: 'pointer',
                      transition: 'transform 140ms cubic-bezier(0.34,1.56,0.64,1)',
                      transform: settings.accent === accent.value ? 'scale(1.12)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>

            <Switch
              id="set-contrast"
              label="Contraste élevé"
              description="Renforce les bordures et la lisibilité du texte (recommandé en forte lumière)."
              checked={settings.highContrast}
              onChange={(value) => onSettings({ highContrast: value })}
            />
            <Switch
              id="set-motion"
              label="Réduire les animations"
              description="Coupe les mouvements non essentiels. Suit aussi automatiquement prefers-reduced-motion."
              checked={settings.reduceMotion}
              onChange={(value) => onSettings({ reduceMotion: value })}
            />

            <div className="setting-row">
              <div className="setting-text">
                <div className="setting-title">Densité des listes</div>
                <div className="setting-desc">Compacte affiche plus de tâches à l’écran.</div>
              </div>
              <Segmented
                ariaLabel="Densité"
                value={settings.density}
                onChange={(value) => onSettings({ density: value })}
                options={[
                  { value: 'confortable', label: 'Confortable' },
                  { value: 'compacte', label: 'Compacte' },
                ]}
              />
            </div>

            <Switch
              id="set-confidence"
              label="Afficher le niveau de confiance"
              description="Indique à quel point l’analyse de ta phrase est sûre."
              checked={settings.showConfidence}
              onChange={(value) => onSettings({ showConfidence: value })}
            />
          </section>
        )}

        {(tab) => tab === 'donnees' && (
          <section className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} color="var(--accent-2)" /> Données
            </h3>
            <div style={{ margin: '10px 0 14px', padding: 14, borderRadius: 14, border: '1px solid rgba(124,92,255,0.35)', background: 'rgba(124,92,255,0.08)' }}>
              <strong style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Database size={15} color="var(--accent-2)" /> Synchronisation entre appareils
              </strong>
              {cloud?.connected ? (
                <>
                  <p style={{ margin: '8px 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Connecté en tant que <b>{cloud.email}</b>.{' '}
                    {cloud.lastSync ? `Dernière synchronisation : ${new Date(cloud.lastSync).toLocaleString('fr-FR')}.` : 'Première synchronisation…'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm" disabled={cloud.busy} onClick={onCloudSyncNow}>
                      {cloud.busy ? 'Synchronisation…' : 'Synchroniser maintenant'}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={cloud.busy} onClick={onCloudSignOut}>Déconnecter</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: '8px 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Utilise le même compte sur ton téléphone et ton PC pour retrouver les mêmes tâches partout.
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input className="input" type="email" placeholder="ton@email.com" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} aria-label="Email de synchronisation" />
                    <input className="input" type="password" placeholder="Mot de passe" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} aria-label="Mot de passe de synchronisation" />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" disabled={cloud?.busy || !cloudEmail || !cloudPassword} onClick={() => onCloudSignIn(cloudEmail, cloudPassword)}>Se connecter</button>
                      <button type="button" className="btn btn-sm" disabled={cloud?.busy || !cloudEmail || !cloudPassword} onClick={() => onCloudSignUp(cloudEmail, cloudPassword)}>Créer un compte</button>
                    </div>
                  </div>
                </>
              )}
              {cloud?.error && (
                <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>{cloud.error}</p>
              )}
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-dim)' }}>
              Stockage local et gratuit ({backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}) conservé sur cet appareil. La synchronisation reste inactive tant que tu ne te connectes pas.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Chip icon="ListTodo">{taskCount} tâche{taskCount > 1 ? 's' : ''}</Chip>
              <Chip icon="Database">{backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</Chip>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={onExport}><Download size={15} /> Exporter en JSON</button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Importer un JSON</button>
              <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImport} className="sr-only" aria-label="Choisir un fichier JSON à importer" />
              <button type="button" className="btn" onClick={onLoadDemo}><Wand2 size={15} /> Charger la démo</button>
              <button type="button" className="btn" onClick={onClearConversation}><Icon name="MessageSquare" size={15} /> Vider la conversation</button>
            </div>

            <div style={{ marginTop: 20, padding: 14, borderRadius: 14, border: '1px solid rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.08)' }}>
              <strong style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Trash2 size={15} color="var(--danger)" /> Zone sensible
              </strong>
              <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                Supprime définitivement les {taskCount} tâche{taskCount > 1 ? 's' : ''} de cet appareil. Pense à exporter avant.
              </p>
              {confirmClear ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => { onClearTasks(); setConfirmClear(false) }}
                  >
                    Oui, tout supprimer
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Annuler</button>
                </div>
              ) : (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)} disabled={taskCount === 0}>
                  <Trash2 size={15} /> Tout effacer
                </button>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 800 }}>Catégories disponibles</h4>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {CATEGORY_ORDER.map((key) => (
                  <Chip key={key} color={CATEGORIES[key].color} icon={CATEGORIES[key].icon}>{CATEGORIES[key].label}</Chip>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Le classement est automatique d’après les mots de ta phrase. Tu peux aussi forcer : « … dans la catégorie Travail ».
              </p>
            </div>
          </section>
        )}
      </Tabbed>
    </Modal>
  )
}

function Tabbed({ children }) {
  const [tab, setTab] = useState('voix')
  const tabs = [
    { id: 'voix', label: 'Voix', icon: 'Mic' },
    { id: 'ia', label: 'IA', icon: 'Sparkles' },
    { id: 'apparence', label: 'Apparence', icon: 'Sun' },
    { id: 'donnees', label: 'Données', icon: 'Database' },
  ]
  return (
    <>
      <div className="segmented" role="tablist" aria-label="Sections des réglages" style={{ alignSelf: 'flex-start' }}>
        {tabs.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} aria-pressed={tab === entry.id} onClick={() => setTab(entry.id)}>
            <Icon name={entry.icon} size={13} style={{ marginRight: 5, verticalAlign: -2 }} /> {entry.label}
          </button>
        ))}
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        {(Array.isArray(children) ? children : [children]).map((child, index) => (
          <Fragment key={index}>{typeof child === 'function' ? child(tab) : child}</Fragment>
        ))}
      </motion.div>
    </>
  )
}
