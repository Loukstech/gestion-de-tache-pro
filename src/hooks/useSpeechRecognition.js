/**
 * Reconnaissance vocale via la Web Speech API — gratuite, intégrée au navigateur.
 *
 * Points clés gérés ici :
 *  - reprise automatique après le silence (le navigateur coupe `continuous` au bout
 *    de ~60 s : on relance tant que l'utilisateur veut rester en écoute) ;
 *  - résultats intermédiaires pour un retour visuel instantané ;
 *  - niveaux audio temps réel (AnalyserNode) pour animer l'orbe ;
 *  - gestion explicite des erreurs (micro refusé, pas de réseau, navigateur non compatible).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export const speechRecognitionSupported = Boolean(SpeechRecognitionImpl)

const ERROR_MESSAGES = {
  'not-allowed': "L'accès au microphone a été refusé. Autorise-le dans les réglages du navigateur.",
  'service-not-allowed': 'Le service de reconnaissance vocale est bloqué par le navigateur.',
  'no-speech': "Je n'ai rien entendu. Réessaie en parlant près du micro.",
  'audio-capture': 'Aucun microphone détecté sur cet appareil.',
  network: 'La reconnaissance vocale en ligne est indisponible (vérifie la connexion).',
  aborted: 'Écoute interrompue.',
  'language-not-supported': "La reconnaissance du français n'est pas disponible sur ce navigateur.",
}

export function describeSpeechError(code) {
  return ERROR_MESSAGES[code] || `Erreur de reconnaissance vocale (${code || 'inconnue'}).`
}

export function useSpeechRecognition({
  language = 'fr-FR',
  continuous = true,
  interimResults = true,
  onFinalTranscript,
  onLevel,
  enabled = true,
} = {}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const [supported] = useState(speechRecognitionSupported)

  const recognitionRef = useRef(null)
  const shouldListenRef = useRef(false)
  const finalBufferRef = useRef('')
  const silenceTimerRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const rafRef = useRef(0)
  const restartTimeoutRef = useRef(null)
  const levelCallbackRef = useRef(onLevel)
  const finalCallbackRef = useRef(onFinalTranscript)

  useEffect(() => { levelCallbackRef.current = onLevel }, [onLevel])
  useEffect(() => { finalCallbackRef.current = onFinalTranscript }, [onFinalTranscript])

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    audioContextRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    levelCallbackRef.current?.(0)
  }, [])

  const startLevelMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const context = new AudioCtx()
      audioContextRef.current = context
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) sum += data[i]
        const average = sum / data.length / 255
        levelCallbackRef.current?.(Math.min(1, average * 2.4))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // Le microphone est peut-être déjà utilisé par la reconnaissance : pas bloquant.
    }
  }, [])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const teardown = useCallback(() => {
    clearSilenceTimer()
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    restartTimeoutRef.current = null
    stopLevelMeter()
    const recognition = recognitionRef.current
    if (recognition) {
      try {
        recognition.onend = null
        recognition.onerror = null
        recognition.onresult = null
        recognition.stop()
      } catch {
        /* déjà arrêté */
      }
    }
    recognitionRef.current = null
    setListening(false)
    setInterim('')
  }, [clearSilenceTimer, stopLevelMeter])

  const build = useCallback(() => {
    const recognition = new SpeechRecognitionImpl()
    recognition.lang = language
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setError(null)
    }

    recognition.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const chunk = result[0].transcript
        if (result.isFinal) {
          finalBufferRef.current = `${finalBufferRef.current} ${chunk}`.trim()
        } else {
          interimText += chunk
        }
      }
      setInterim(interimText.trim())
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        const value = finalBufferRef.current.trim()
        finalBufferRef.current = ''
        setInterim('')
        if (value) finalCallbackRef.current?.(value)
      }, 1100)
    }

    recognition.onerror = (event) => {
      const code = event.error
      if (code === 'no-speech' || code === 'aborted') {
        // Erreurs bénignes : on relance si l'utilisateur veut encore parler.
        return
      }
      setError(describeSpeechError(code))
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        shouldListenRef.current = false
        teardown()
      }
    }

    recognition.onend = () => {
      clearSilenceTimer()
      const value = finalBufferRef.current.trim()
      if (value) {
        finalBufferRef.current = ''
        setInterim('')
        finalCallbackRef.current?.(value)
      }
      setInterim('')
      if (shouldListenRef.current) {
        // Relance automatique : la Web Speech API s'arrête après un silence long.
        restartTimeoutRef.current = setTimeout(() => {
          if (!shouldListenRef.current) return
          try {
            recognition.start()
          } catch {
            // start() peut lever si l'instance est déjà active : on reconstruit.
            recognitionRef.current = build()
            try { recognitionRef.current.start() } catch { setListening(false) }
          }
        }, 220)
      } else {
        setListening(false)
      }
    }

    return recognition
  }, [language, continuous, interimResults, clearSilenceTimer, teardown])

  const start = useCallback(async () => {
    if (!supported) {
      setError("Ton navigateur ne propose pas la reconnaissance vocale. Utilise la saisie texte, elle comprend exactement les mêmes phrases.")
      return false
    }
    shouldListenRef.current = true
    finalBufferRef.current = ''
    setInterim('')
    setError(null)

    if (!recognitionRef.current) recognitionRef.current = build()
    try {
      recognitionRef.current.start()
    } catch {
      recognitionRef.current = build()
      try { recognitionRef.current.start() } catch { /* déjà démarré */ }
    }
    startLevelMeter()
    return true
  }, [supported, build, startLevelMeter])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    const value = finalBufferRef.current.trim()
    finalBufferRef.current = ''
    if (value) finalCallbackRef.current?.(value)
    teardown()
  }, [teardown])

  const toggle = useCallback(() => {
    if (shouldListenRef.current) stop()
    else start()
  }, [start, stop])

  useEffect(() => () => {
    shouldListenRef.current = false
    teardown()
  }, [teardown])

  return {
    listening: enabled && listening,
    interim,
    error,
    supported,
    start,
    stop,
    toggle,
  }
}
