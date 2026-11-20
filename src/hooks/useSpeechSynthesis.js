/**
 * Synthèse vocale (Web Speech API) — gratuite et native.
 * L'assistant répond à voix haute si l'option est activée.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export const speechSynthesisSupported = supported

export function useSpeechSynthesis({ language = 'fr-FR', rate = 1.04, pitch = 1, voiceName = null, enabled = true } = {}) {
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState([])
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!supported) return undefined
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const pickVoice = useCallback(() => {
    if (!supported || !voices.length) return null
    if (voiceName) {
      const named = voices.find((voice) => voice.name === voiceName)
      if (named) return named
    }
    const french = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('fr'))
    if (!french.length) return null
    const preferred =
      french.find((voice) => /google|natural|amelie|audrey|thomas|nicolas|denise/i.test(voice.name)) ||
      french.find((voice) => voice.localService) ||
      french[0]
    return preferred
  }, [voices, voiceName])

  const speak = useCallback(
    (text) => {
      if (!supported || !enabledRef.current) return
      const clean = String(text || '')
        .replace(/\s+/g, ' ')
        .replace(/«|»/g, '')
        .replace(/[#*_`]/g, '')
        .replace(/\b\d+\s?%/g, (match) => match.replace('%', ' pourcent'))
        .trim()
      if (!clean) return

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 900))
      utterance.lang = language
      utterance.rate = rate
      utterance.pitch = pitch
      const voice = pickVoice()
      if (voice) utterance.voice = voice
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [language, rate, pitch, pickVoice],
  )

  const cancel = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel()
  }, [])

  return { speak, cancel, speaking, supported, voices, frenchVoices: voices.filter((voice) => voice.lang?.toLowerCase().startsWith('fr')) }
}
