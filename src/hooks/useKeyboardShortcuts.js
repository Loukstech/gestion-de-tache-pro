import { useEffect } from 'react'
import { isMac } from '../lib/utils.js'

/**
 * Raccourcis clavier globaux. Tout est documenté dans le panneau « Raccourcis »
 * afin que l'application reste 100 % utilisable sans souris (accessibilité).
 */
export function useKeyboardShortcuts(handlers = {}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const mod = isMac ? event.metaKey : event.ctrlKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        handlers.onCommandPalette?.()
        return
      }
      if (mod && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        handlers.onQuickAdd?.()
        return
      }
      if (mod && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        handlers.onToggleVoice?.()
        return
      }
      if (mod && event.key === '/') {
        event.preventDefault()
        handlers.onFocusAssistant?.()
        return
      }
      if (event.key === 'Escape') {
        handlers.onEscape?.()
        return
      }
      if (typing) return

      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault()
        handlers.onShowShortcuts?.()
        return
      }
      if (event.key.toLowerCase() === 'v') {
        handlers.onToggleVoice?.()
        return
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handlers.onQuickAdd?.()
      }
      if (event.key >= '1' && event.key <= '5' && !mod && !event.altKey) {
        handlers.onNavigate?.(Number(event.key))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}
