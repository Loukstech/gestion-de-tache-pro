/**
 * Lanceur de production pour l'hébergement.
 * Construit l'application puis démarre Vite preview sur le PORT fourni
 * par l'environnement (repli sur 3000 si la variable est absente).
 */
import { build, preview } from 'vite'

const port = Number.parseInt(process.env.PORT || '', 10) || 3000

await build()

const server = await preview({
  preview: {
    host: '0.0.0.0',
    port,
    strictPort: true,
    allowedHosts: true,
  },
})

server.printUrls?.()
