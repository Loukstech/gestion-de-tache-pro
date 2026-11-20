/**
 * Synthèse vocale (Web Speech API) — gratuite et native.
 * L'assistant répond à voix haute si l'option est activée.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export const speechSynthesisSupported = supported

const NATURAL_HINT = /natural|neural|premium|online|google|aria|elodie|hortense|henri|sonia/i
const GOOD_FRENCH_HINT = /amelie|audrey|thomas|nicolas|denise/i

/** Étiquette affichée dans les réglages pour repérer les meilleures voix. */
export function describeVoice(voice) {
  if (!voice) return ''
  return `${voice.name}${NATURAL_HINT.test(voice.name) ? ' · naturelle' : ''}`
}

function voiceScore(voice) {
  let score = 0
  if (NATURAL_HINT.test(voice.name)) score += 3
  else if (GOOD_FRENCH_HINT.test(voice.name)) score += 2
  if (voice.localService) score += 1
  return score
}

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

  const frenchVoices = useMemo(
    () => voices.filter((voice) => voice.lang?.toLowerCase().startsWith('fr')).sort((a, b) => voiceScore(b) - voiceScore(a)),
    [voices],
  )

  const pickVoice = useCallback(() => {
    if (!supported || !frenchVoices.length) return null
    if (voiceName) {
      const named = voices.find((voice) => voice.name === voiceName)
      if (named) return named
    }
    return frenchVoices[0]
  }, [voices, frenchVoices, voiceName])

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

  return { speak, cancel, speaking, supported, voices, frenchVoices }
}
