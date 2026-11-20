import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

import Header from './components/layout/Header.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import CommandPalette from './components/command/CommandPalette.jsx'
import QuickAddModal from './components/tasks/QuickAddModal.jsx'
import TaskDetail from './components/tasks/TaskDetail.jsx'
import SettingsModal from './components/settings/SettingsModal.jsx'
import ShortcutsModal from './components/settings/ShortcutsModal.jsx'
import VoiceDock from './components/voice/VoiceDock.jsx'
import DashboardView from './components/views/DashboardView.jsx'
import TodayView from './components/views/TodayView.jsx'
import TasksView from './components/views/TasksView.jsx'
import CalendarView from './components/views/CalendarView.jsx'
import AnalyticsView from './components/views/AnalyticsView.jsx'
import AssistantView from './components/assistant/AssistantView.jsx'
import Onboarding from './components/onboarding/Onboarding.jsx'
import { useToaster } from './components/primitives/Toast.jsx'

import { useTaskStore, computeStats } from './store/useTaskStore.js'
import { useSpeechRecognition, speechRecognitionSupported, describeSpeechError } from './hooks/useSpeechRecognition.js'
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis.js'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'
import { CATEGORIES, PRIORITIES } from './nlu/lexicon.js'
import { humanizeDue, fromISODate } from './nlu/dates.js'
import { cx } from './lib/utils.js'

export default function App() {
  const store = useTaskStore()
  const {
    ready, tasks, messages, settings, filters, view, activeTaskId, assistant, toast, setToast,
    hydrate, persistSettings, runNaturalLanguage, addTasks, updateTask, deleteTask,
    toggleTask, togglePin, toggleSubtask, setView, setFilters, setActiveTask,
    restoreFromUndo, loadDemoData, clearAllTasks, importTasks, exportData,
    clearConversation, resetFilters,
  } = store

  const toaster = useToaster()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [level, setLevel] = useState(0)
  const [lastTranscript, setLastTranscript] = useState('')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!toast) return
    toaster.push(toast)
    setToast(null)
  }, [toast, setToast, toaster.push])

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  /* ------------------------------ démarrage ------------------------------ */
  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  /* ------------------------------ thème DOM ------------------------------ */
  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.dataset.theme = settings.theme || 'dark'
    root.dataset.accent = settings.accent || 'violet'
    root.dataset.density = settings.density || 'confortable'
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal'
    root.dataset.motion = settings.reduceMotion ? 'reduit' : 'complet'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', settings.theme === 'light' ? '#f4f5fb' : '#07080f')
  }, [ready, settings.theme, settings.accent, settings.density, settings.highContrast, settings.reduceMotion])

  useEffect(() => {
    if (!ready) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches && settings.reduceMotion === false && settings.motionAutoApplied !== true) {
      persistSettings({ reduceMotion: true, motionAutoApplied: true })
    }
    const contrastMedia = window.matchMedia('(prefers-contrast: more)')
    if (contrastMedia.matches && !settings.highContrast && settings.contrastAutoApplied !== true) {
      persistSettings({ highContrast: true, contrastAutoApplied: true })
    }
  }, [ready, settings.reduceMotion, settings.highContrast, persistSettings])

  /* -------------------------------- voix -------------------------------- */
  const { speak, cancel, speaking, frenchVoices } = useSpeechSynthesis({
    language: settings.language || 'fr-FR',
    rate: settings.rate,
    pitch: settings.pitch,
    voiceName: settings.voiceName,
    enabled: settings.voiceReply,
  })

  const handleFinalTranscript = useCallback(
    (text) => {
      if (!text || !text.trim()) return
      setLastTranscript(text)
      runCommand(text, 'voice')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { listening, interim, error: speechError, start, stop, toggle: toggleVoice } = useSpeechRecognition({
    language: settings.language || 'fr-FR',
    continuous: settings.continuous !== false,
    interimResults: settings.interimResults !== false,
    onFinalTranscript: handleFinalTranscript,
    onLevel: setLevel,
  })

  /* ------------------------------ exécution ------------------------------ */
  const runCommand = useCallback(
    async (text, source = 'text') => {
      const result = await useTaskStore.getState().runNaturalLanguage(text, { source })
      if (!result?.answer) return result

      const answer = result.answer

      if (settingsRef.current.voiceReply && answer.spoken) speak(answer.spoken)

      if (answer.kind === 'create' && result.created?.length) {
        const first = result.created[0]
        toaster.push({
          tone: 'success',
          title: result.created.length > 1 ? `${result.created.length} tâches créées` : 'Tâche créée',
          description: `${first.title}${first.dueAt ? ` · ${humanizeDue(fromISODate(first.dueAt))}` : ''} · ${CATEGORIES[first.category]?.label}`,
          action: { label: 'Annuler', onClick: () => useTaskStore.getState().restoreFromUndo() },
        })
      } else if (answer.kind === 'delete') {
        toaster.push({
          tone: 'danger',
          title: answer.headline,
          description: answer.spoken,
          action: { label: 'Annuler', onClick: () => useTaskStore.getState().restoreFromUndo() },
        })
      } else if (answer.kind === 'complete') {
        toaster.push({ tone: 'success', title: answer.headline, description: answer.spoken })
      } else if (answer.kind === 'unknown' || answer.kind === 'error') {
        toaster.push({ tone: 'warning', title: answer.headline, description: 'Regarde la suggestion dans l’assistant.' })
      }

      return result
    },
    [speak, toaster],
  )

  const handleToggleVoice = useCallback(() => {
    if (listening) {
      stop()
      return
    }
    cancel()
    if (!speechRecognitionSupported) {
      toaster.push({
        tone: 'warning',
        title: 'Dictée vocale indisponible',
        description: 'Ce navigateur n’expose pas la Web Speech API. La saisie texte comprend exactement les mêmes phrases.',
        duration: 6500,
      })
      setView('assistant')
      setPaletteOpen(false)
      return
    }
    setPaletteOpen(false)
    start()
  }, [listening, stop, start, cancel, toaster, setView])

  /* ------------------------------ raccourcis ------------------------------ */
  const shortcutHandlers = useMemo(
    () => ({
      onCommandPalette: () => setPaletteOpen((value) => !value),
      onQuickAdd: () => setQuickAddOpen(true),
      onToggleVoice: handleToggleVoice,
      onFocusAssistant: () => {
        setView('assistant')
        setTimeout(() => document.querySelector('.composer textarea')?.focus(), 120)
      },
      onShowShortcuts: () => setShortcutsOpen(true),
      onEscape: () => {
        if (paletteOpen) setPaletteOpen(false)
        else if (quickAddOpen) setQuickAddOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (shortcutsOpen) setShortcutsOpen(false)
        else if (mobileNavOpen) setMobileNavOpen(false)
        else if (listening) stop()
      },
      onNavigate: (index) => {
        const map = ['dashboard', 'assistant', 'today', 'tasks', 'calendar']
        setView(map[index - 1])
      },
    }),
    [handleToggleVoice, paletteOpen, quickAddOpen, settingsOpen, shortcutsOpen, mobileNavOpen, listening, stop, setView],
  )
  useKeyboardShortcuts(shortcutHandlers)

  /* ------------------------------ dérivés ------------------------------ */
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [tasks, activeTaskId])
  const categoryKey = view.startsWith('cat:') ? view.slice(4) : null
  const categoryLabel = categoryKey ? CATEGORIES[categoryKey]?.label : null

  const effectiveFilters = useMemo(() => {
    if (categoryKey) return { ...filters, category: categoryKey, status: filters.status || 'open' }
    if (view === 'overdue') return { ...filters, range: 'overdue', status: 'open' }
    if (view === 'week') return { ...filters, range: 'week', status: 'open' }
    if (view === 'someday') return { ...filters, range: 'someday', status: 'open' }
    if (view === 'done') return { ...filters, status: 'done' }
    return filters
  }, [filters, categoryKey, view])

  const handleExport = useCallback(() => {
    const data = useTaskStore.getState().exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `taskvox-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toaster.push({ tone: 'success', title: 'Export terminé', description: `${data.tasks.length} tâches enregistrées dans le fichier JSON.` })
  }, [toaster])

  const handleImport = useCallback(
    async (data) => {
      const list = Array.isArray(data) ? data : data?.tasks
      if (!Array.isArray(list) || !list.length) {
        toaster.push({ tone: 'danger', title: 'Import impossible', description: 'Aucune tâche trouvée dans ce fichier.' })
        return
      }
      const created = await importTasks(list)
      toaster.push({ tone: 'success', title: 'Import réussi', description: `${created.length} tâches importées.` })
    },
    [importTasks, toaster],
  )

  const handleSpeakTask = useCallback(
    (task) => {
      const bits = [
        task.title,
        task.dueAt ? `échéance ${humanizeDue(fromISODate(task.dueAt), { withTime: task.dueHasTime })}` : 'sans échéance',
        `priorité ${PRIORITIES[task.priority]?.label}`,
        `catégorie ${CATEGORIES[task.category]?.label}`,
        task.subtasks?.length ? `${task.subtasks.filter((sub) => sub.done).length} étapes faites sur ${task.subtasks.length}` : '',
        task.notes || '',
      ].filter(Boolean)
      speak(bits.join('. '))
    },
    [speak],
  )

  const showOnboarding = ready && !settings.onboardingDone

  /* ------------------------------ rendu ------------------------------ */
  if (!ready) {
    return (
      <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', gap: 14 }}>
        <div className="app-bg" aria-hidden="true">
          <span className="orb orb-1" /><span className="orb orb-2" /><span className="orb orb-3" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}
        >
          <Loader2 size={30} className="spin" color="var(--accent)" />
          <span style={{ fontSize: 13.5, color: 'var(--text-muted)', fontWeight: 600 }}>Chargement de ton espace…</span>
        </motion.div>
      </div>
    )
  }

  return (
    <>
      <div className="app-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <a href="#main-content" className="skip-link">Aller au contenu principal</a>

      <div className="app-shell" data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'} data-mobile-nav={mobileNavOpen ? 'open' : 'closed'}>
        <Sidebar
          view={view}
          tasks={tasks}
          collapsed={sidebarCollapsed && !mobileNavOpen}
          settings={settings}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onNavigate={(target) => {
            if (typeof target === 'string') setView(target)
            else if (target.category) setView(`cat:${target.category}`)
            else setView(target.id)
          }}
        />

        <div className="app-main">
          <Header
            view={view}
            categoryLabel={categoryLabel}
            theme={settings.theme || 'dark'}
            voiceReply={settings.voiceReply}
            listening={listening}
            sidebarCollapsed={sidebarCollapsed}
            dateLabel={now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            onOpenPalette={() => setPaletteOpen(true)}
            onQuickAdd={() => setQuickAddOpen(true)}
            onToggleVoice={handleToggleVoice}
            onToggleTheme={() => persistSettings({ theme: (settings.theme || 'dark') === 'dark' ? 'light' : 'dark' })}
            onToggleVoiceReply={() => {
              const next = !settings.voiceReply
              persistSettings({ voiceReply: next })
              if (!next) cancel()
              else speak('Réponses vocales activées.')
            }}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
          />

          <main id="main-content" className="app-scroll" tabIndex={-1}>
            <div className="container">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {showOnboarding ? (
                    <Onboarding
                      hasTasks={tasks.length > 0}
                      onFinish={() => persistSettings({ onboardingDone: true })}
                      onLoadDemo={() => loadDemoData().then(() => toaster.push({ tone: 'success', title: 'Démo chargée', description: '19 tâches réalistes créées pour explorer l’application.' }))}
                      onOpenAssistant={() => setView('assistant')}
                    />
                  ) : view === 'dashboard' ? (
                    <DashboardView
                      tasks={tasks}
                      now={now}
                      stats={stats}
                      onOpenTask={setActiveTask}
                      onToggle={toggleTask}
                      onDelete={(id) => deleteTask(id).then(() => toaster.push({ tone: 'info', title: 'Tâche supprimée', action: { label: 'Annuler', onClick: () => restoreFromUndo() } }))}
                      onPin={togglePin}
                      onQuickAdd={() => setQuickAddOpen(true)}
                      onVoice={handleToggleVoice}
                      onNavigate={setView}
                    />
                  ) : view === 'assistant' ? (
                    <AssistantView
                      messages={messages}
                      thinking={assistant.thinking}
                      listening={listening}
                      interim={interim}
                      level={level}
                      speechError={speechError}
                      voiceReply={settings.voiceReply}
                      onSend={(text) => runCommand(text, 'text')}
                      onToggleVoice={handleToggleVoice}
                      onSpeak={speak}
                      onUndo={async () => {
                        const ok = await restoreFromUndo()
                        toaster.push({ tone: ok ? 'success' : 'warning', title: ok ? 'Action annulée' : 'Rien à annuler' })
                      }}
                      onOpenTask={setActiveTask}
                      onClearConversation={clearConversation}
                      onQuickAdd={() => setQuickAddOpen(true)}
                    />
                  ) : view === 'today' ? (
                    <TodayView
                      tasks={tasks}
                      now={now}
                      onOpenTask={setActiveTask}
                      onToggle={toggleTask}
                      onDelete={(id) => deleteTask(id).then(() => toaster.push({ tone: 'info', title: 'Tâche supprimée', action: { label: 'Annuler', onClick: () => restoreFromUndo() } }))}
                      onPin={togglePin}
                      onQuickAdd={() => setQuickAddOpen(true)}
                      onVoice={handleToggleVoice}
                      onSend={(text) => runCommand(text, 'text')}
                      onNavigate={setView}
                    />
                  ) : view === 'calendar' ? (
                    <CalendarView
                      tasks={tasks}
                      now={now}
                      onOpenTask={setActiveTask}
                      onQuickAdd={() => setQuickAddOpen(true)}
                      onVoice={handleToggleVoice}
                    />
                  ) : view === 'analytics' ? (
                    <AnalyticsView tasks={tasks} now={now} onNavigate={setView} />
                  ) : (
                    <TasksView
                      tasks={tasks}
                      now={now}
                      filters={effectiveFilters}
                      initialCategory={categoryKey}
                      onFilters={setFilters}
                      onOpenTask={setActiveTask}
                      onToggle={toggleTask}
                      onDelete={(id) => deleteTask(id).then(() => toaster.push({ tone: 'info', title: 'Tâche supprimée', action: { label: 'Annuler', onClick: () => restoreFromUndo() } }))}
                      onPin={togglePin}
                      onQuickAdd={() => setQuickAddOpen(true)}
                      onVoice={handleToggleVoice}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      <nav className="mobile-nav" aria-label="Navigation rapide">
        <ul>
          {[
            { id: 'dashboard', label: 'Accueil', icon: 'LayoutDashboard' },
            { id: 'today', label: 'Du jour', icon: 'Sun' },
            { id: 'assistant', label: 'Assistant', icon: 'Mic' },
            { id: 'tasks', label: 'Tâches', icon: 'ListTodo' },
            { id: 'calendar', label: 'Agenda', icon: 'CalendarDays' },
          ].map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => setView(entry.id)} aria-current={view === entry.id ? 'true' : undefined}>
                <MobileIcon name={entry.icon} active={view === entry.id} />
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {!showOnboarding && (
        <VoiceDock
          listening={listening}
          interim={interim}
          level={level}
          error={speechError}
          supported={speechRecognitionSupported}
          thinking={assistant.thinking}
          lastTranscript={lastTranscript}
          onToggle={handleToggleVoice}
          onOpenAssistant={() => setView('assistant')}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tasks={tasks}
        listening={listening}
        interim={interim}
        busy={assistant.thinking}
        theme={settings.theme || 'dark'}
        onNavigate={(target) => setView(target)}
        onOpenTask={(id) => setActiveTask(id)}
        onQuickAdd={() => setQuickAddOpen(true)}
        onToggleVoice={handleToggleVoice}
        onToggleTheme={() => persistSettings({ theme: (settings.theme || 'dark') === 'dark' ? 'light' : 'dark' })}
        onLoadDemo={() => loadDemoData().then(() => toaster.push({ tone: 'success', title: 'Démo chargée' }))}
        onRunCommand={(text) => runCommand(text, 'text')}
      />

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        listening={listening}
        interim={interim}
        supported={speechRecognitionSupported}
        onToggleVoice={handleToggleVoice}
        onSubmit={(text) => runCommand(text, 'text')}
      />

      <TaskDetail
        task={activeTask}
        open={Boolean(activeTask)}
        onClose={() => setActiveTask(null)}
        onUpdate={updateTask}
        onDelete={(id) => deleteTask(id).then(() => toaster.push({ tone: 'info', title: 'Tâche supprimée', action: { label: 'Annuler', onClick: () => restoreFromUndo() } }))}
        onToggle={toggleTask}
        onToggleSubtask={toggleSubtask}
        onSpeak={handleSpeakTask}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettings={persistSettings}
        frenchVoices={frenchVoices}
        taskCount={tasks.length}
        backend={store.storageBackend}
        onExport={handleExport}
        onImport={handleImport}
        onLoadDemo={() => loadDemoData().then(() => toaster.push({ tone: 'success', title: 'Démo chargée' }))}
        onClearTasks={() => clearAllTasks().then(() => toaster.push({ tone: 'warning', title: 'Toutes les tâches ont été effacées', action: { label: 'Annuler', onClick: () => restoreFromUndo() } }))}
        onClearConversation={() => { clearConversation(); toaster.push({ tone: 'info', title: 'Conversation vidée' }) }}
        onTestVoice={() => speak("Bonjour, je suis ton assistant de tâches. Je comprends le français naturel : dis-moi ce que tu dois faire, et je m'occupe du classement.")}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onPlayExample={(example) => {
          setShortcutsOpen(false)
          setView('assistant')
          runCommand(example, 'text')
        }}
      />

      {toaster.node}

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {listening ? `Écoute vocale active. ${interim}` : speaking ? 'L’assistant parle.' : ''}
      </div>
    </>
  )
}

function MobileIcon({ name, active }) {
  const paths = {
    LayoutDashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    Sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    Mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" /></>,
    ListTodo: <><rect x="3" y="5" width="6" height="6" rx="1.5" /><path d="M3 17h6M13 6h8M13 12h8M13 18h8" /></>,
    CalendarDays: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  }
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
