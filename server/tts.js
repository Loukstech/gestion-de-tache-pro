// Synthèse vocale Google via l'API Gemini. Les clés restent côté serveur.
const MAX_BODY = 4096
const MAX_TEXT = 900

const asKeyList = (value) =>
  String(value || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)

const LANGUAGES = new Set(['fr-FR', 'fr-CA', 'en-US', 'en-GB', 'es-ES', 'de-DE', 'it-IT'])

const VOICES = new Set([
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe',
  'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux',
  'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck', 'Pulcherrima',
  'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel',
  'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
])

const AUDIO_TYPES = new Set(['audio/wav', 'audio/mpeg', 'audio/l16', 'audio/x-wav'])

function allowedOrigin(req, reply) {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    reply(403, { error: 'Origine non autorisée.' })
    return false
  }
  const origin = req.headers.origin
  if (!origin) return true
  const hosts = [req.headers.host, req.headers['x-forwarded-host']]
    .filter(Boolean)
    .flatMap((value) => String(value).split(',').map((part) => part.trim().split(':')[0]))
    .filter(Boolean)
  let host
  try { host = new URL(origin).host } catch {
    reply(403, { error: 'Origine non autorisée.' })
    return false
  }
  const sharedHost = /\.apps\.workbuddy\.host$/.test(host)
  if (!sharedHost && !hosts.includes(host) && !hosts.includes(host.split(':')[0])) {
    reply(403, { error: 'Origine non autorisée.' })
    return false
  }
  return true
}

export function ttsMiddleware({
  apiKey,
  apiKeys,
  model = 'gemini-3.8-flash-lite-tts',
  voice = 'Kore',
  fetchImpl = fetch,
} = {}) {
  const keys = asKeyList(apiKeys || apiKey)
  return async (req, res, next) => {
    const path = (req.url || '').split('?')[0]
    if (path !== '/api/ai/tts') return next()
    res.setHeader('Cache-Control', 'no-store')
    const json = (status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' })
    if (!allowedOrigin(req, json)) return undefined
    if (!keys.length) return json(503, { error: 'Gemini non configuré.' })
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return json(415, { error: 'JSON requis.' })

    let chunks = '', size = 0
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY) return json(413, { error: 'Demande trop longue.' })
        chunks += chunk.toString('utf8')
      }
      const body = JSON.parse(chunks)
      const text = String(body.text || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[#*_`«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!text || text.length > MAX_TEXT) return json(400, { error: 'Texte invalide.' })
      const language = LANGUAGES.has(body.language) ? body.language : 'fr-FR'
      const voiceName = VOICES.has(body.voice) ? body.voice : (VOICES.has(voice) ? voice : 'Kore')

      for (let i = 0; i < keys.length; i++) {
        let upstream
        try {
          upstream = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[i] },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                  languageCode: language,
                },
              },
            }),
            signal: AbortSignal.timeout(20000),
          })
        } catch {
          continue
        }
        if (!upstream.ok) continue
        try {
          const data = await upstream.json()
          const part = (data.candidates?.[0]?.content?.parts || []).find((item) => item.inlineData?.data)
          if (!part) continue
          const audio = Buffer.from(part.inlineData.data, 'base64')
          if (!audio.length) continue
          const mimeType = AUDIO_TYPES.has(part.inlineData.mimeType) ? part.inlineData.mimeType : 'audio/wav'
          res.statusCode = 200
          res.setHeader('Content-Type', mimeType)
          res.setHeader('Content-Length', String(audio.length))
          return res.end(audio)
        } catch {
          continue
        }
      }
      return json(502, { error: 'Voix Google indisponible ou quota atteint.' })
    } catch {
      return json(502, { error: 'Impossible de générer la voix.' })
    }
  }
}
