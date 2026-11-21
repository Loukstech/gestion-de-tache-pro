/**
 * Synthèse vocale : voix Google naturelle via l'API Gemini côté serveur,
 * avec repli automatique sur la Web Speech API du navigateur.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiUrl } from '../lib/ai-url.js'

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export const speechSynthesisSupported = supported

export const GOOGLE_VOICES = [
  { value: 'Kore', label: 'Kore · claire et assurée' },
  { value: 'Sulafat', label: 'Sulafat · chaleureuse' },
  { value: 'Aoede', label: 'Aoede · légère et aérienne' },
  { value: 'Vindemiatrix', label: 'Vindemiatrix · douce' },
  { value: 'Puck', label: 'Puck · dynamique (masculine)' },
  { value: 'Fenrir', label: 'Fenrir · énergique (masculine)' },
]

const NATURAL_HINT = /natural|neural|premium|online|google|microsoft|aria|emma|elodie|hortense|henri|sonia|google français/i
const GOOD_FRENCH_HINT = /amelie|audrey|thomas|nicolas|denise|françoise|francoise/i
const ROBOTIC_HINT = /espeak|festival|pico|robot|compact|simplified|basic/i

/** Réglage recommandé pour la voix de secours du navigateur. */
export const NATURAL_VOICE_PRESET = { rate: 0.98, pitch: 1, voiceName: null }

/** Étiquette affichée dans les réglages pour repérer les meilleures voix locales. */
export function describeVoice(voice) {
  if (!voice) return ''
  const tags = []
  if (NATURAL_HINT.test(voice.name)) tags.push('naturelle')
  if (!voice.localService && NATURAL_HINT.test(voice.name)) tags.push('en ligne')
  else if (voice.localService) tags.push('hors ligne')
  return tags.length ? `${voice.name} · ${tags.join(' · ')}` : voice.name
}

function voiceScore(voice) {
  let score = 0
  if (NATURAL_HINT.test(voice.name)) score += 8
  else if (GOOD_FRENCH_HINT.test(voice.name)) score += 4
  if (ROBOTIC_HINT.test(voice.name)) score -= 10
  if (voice.localService) score += 1
  return score
}

const cleanText = (text) => String(text || '')
  .replace(/\s+/g, ' ')
  .replace(/«|»/g, '')
  .replace(/[#*_`]/g, '')
  .replace(/\b\d+\s?%/g, (match) => match.replace('%', ' pourcent'))
  .trim()
  .slice(0, 900)

/** iOS n'autorise la lecture audio qu'après une interaction : on débloque au premier geste. */
function useAudioUnlock() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const unlock = () => {
      try {
        const Context = window.AudioContext || window.webkitAudioContext
        if (!Context) return
        const ctx = new Context()
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        gain.gain.value = 0
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.start()
        oscillator.stop(ctx.currentTime + 0.01)
        ctx.resume?.()
      } catch {
        /* navigation privée ou politique stricte : on utilisera la voix locale */
      }
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [])
}

export function useSpeechSynthesis({
  language = 'fr-FR',
  rate = 1.04,
  pitch = 1,
  voiceName = null,
  enabled = true,
  googleVoice = true,
  googleVoiceName = 'Kore',
} = {}) {
  const [speaking, setSpeaking] = useState(false)
  const [engine, setEngine] = useState(null)
  const [voices, setVoices] = useState([])
  const enabledRef = useRef(enabled)
  const googleRef = useRef(googleVoice)
  const googleNameRef = useRef(googleVoiceName)
  const languageRef = useRef(language)
  const rateRef = useRef(rate)
  const pitchRef = useRef(pitch)
  const voiceNameRef = useRef(voiceName)
  const audioRef = useRef(null)
  const urlRef = useRef(null)
  const controllerRef = useRef(null)
  const timeoutRef = useRef(null)
  const generationRef = useRef(0)

  enabledRef.current = enabled
  googleRef.current = googleVoice
  googleNameRef.current = googleVoiceName
  languageRef.current = language
  rateRef.current = rate
  pitchRef.current = pitch
  voiceNameRef.current = voiceName

  useAudioUnlock()

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
    if (voiceNameRef.current) {
      const named = voices.find((voice) => voice.name === voiceNameRef.current)
      if (named) return named
    }
    return frenchVoices[0]
  }, [voices, frenchVoices])

  const clearAudio = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (controllerRef.current) { controllerRef.current.abort(); controllerRef.current = null }
    if (audioRef.current) {
      audioRef.current.onplaying = null
      audioRef.current.onended = null
      audioRef.current.onerror = null
      try { audioRef.current.pause() } catch { /* déjà arrêté */ }
      audioRef.current = null
    }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
  }, [])

  const speakNative = useCallback((clean, generation) => {
    if (!supported) { setSpeaking(false); setEngine(null); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = languageRef.current
    utterance.rate = rateRef.current
    utterance.pitch = pitchRef.current
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    utterance.onstart = () => {
      if (generationRef.current !== generation) return
      setSpeaking(true)
      setEngine('navigateur')
    }
    utterance.onend = () => {
      if (generationRef.current !== generation) return
      setSpeaking(false)
      setEngine(null)
    }
    utterance.onerror = () => {
      if (generationRef.current !== generation) return
      setSpeaking(false)
      setEngine(null)
    }
    window.speechSynthesis.speak(utterance)
  }, [pickVoice])

  const speak = useCallback(async (text) => {
    const clean = cleanText(text)
    if (!clean) return
    const generation = ++generationRef.current
    clearAudio()
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
    setEngine(null)
    if (!enabledRef.current) return

    if (googleRef.current) {
      const controller = new AbortController()
      controllerRef.current = controller
      timeoutRef.current = setTimeout(() => controller.abort(), 14000)
      setSpeaking(true)
      try {
        const response = await fetch(aiUrl('/api/ai/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            language: languageRef.current,
            voice: googleNameRef.current || 'Kore',
          }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('tts-indisponible')
        const blob = await response.blob()
        if (generationRef.current !== generation) return
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.playsInline = true
        audio.playbackRate = Math.min(1.5, Math.max(0.6, rateRef.current || 1))
        audioRef.current = audio
        urlRef.current = url
        audio.onplaying = () => {
          if (generationRef.current !== generation) return
          setSpeaking(true)
          setEngine('Google')
        }
        audio.onended = () => {
          if (generationRef.current !== generation) return
          clearAudio()
          setSpeaking(false)
          setEngine(null)
        }
        audio.onerror = () => {
          if (generationRef.current !== generation) return
          clearAudio()
          speakNative(clean, generation)
        }
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
        controllerRef.current = null
        await audio.play()
        return
      } catch {
        if (generationRef.current !== generation) return
        clearAudio()
      }
    }
    speakNative(clean, generation)
  }, [clearAudio, speakNative])

  const cancel = useCallback(() => {
    generationRef.current += 1
    clearAudio()
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
    setEngine(null)
  }, [clearAudio])

  useEffect(() => () => {
    generationRef.current += 1
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (controllerRef.current) controllerRef.current.abort()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    if (supported) window.speechSynthesis.cancel()
  }, [])

  return { speak, cancel, speaking, engine, supported, voices, frenchVoices }
}
