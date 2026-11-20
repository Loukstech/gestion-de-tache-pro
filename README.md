# TaskVox Pro

Gestionnaire personnel de tâches en français, pilotable à la voix ou au clavier. Les tâches, les réglages et l'historique sont conservés dans le navigateur, sans compte ni clé API.

## Démarrer

Prérequis : Node.js 20.19+ ou 22.12+ et npm.

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée par Vite. Pour vérifier le moteur de compréhension et compiler l'application :

```bash
npm test
npm run build
npm run preview
```

## Utilisation

Autoriser le microphone dans un navigateur compatible avec la reconnaissance vocale Web Speech, puis utiliser le bouton micro. Par exemple :

- « Ajoute une tâche appeler le client demain à 15 heures, c'est urgent »
- « Quelles sont mes tâches urgentes demain ? »
- « Montre mes tâches de la semaine »

Le champ texte reste disponible si le micro ou la reconnaissance vocale ne sont pas pris en charge. Le bouton clavier du dock ouvre l'assistant et place directement le curseur dans le champ de saisie. Dans **Réglages → Voix**, le bouton **Réglage naturel** sélectionne automatiquement la meilleure voix française disponible (voix neurales/prémium en priorité) et règle un débit plus calme ; **Tester la voix** permet de comparer. L'interrupteur **Bouton flottant vocal** masque l'orbe si tu préfères une interface plus sobre — le micro reste accessible depuis l'assistant. Vérifier et corriger les tâches créées : la compréhension française est basée sur des règles et peut se tromper. Les fonctions vocales dépendent du navigateur, d'une autorisation et d'un contexte sécurisé (HTTPS ou localhost). Selon le navigateur, la reconnaissance vocale peut envoyer l'audio à un service externe et nécessiter une connexion Internet ; elle n'est pas nécessairement traitée localement. La synthèse vocale dépend également des voix installées.

Les données sont stockées dans IndexedDB, avec un repli sur localStorage. Elles restent liées au navigateur et à l'appareil : effacer les données du navigateur peut les supprimer. Utiliser l'export JSON dans les paramètres pour les sauvegarder et l'import pour les restaurer. Aucune synchronisation entre appareils n'est incluse.

## Architecture et évolutions

- React et Vite pour l'interface, Zustand pour l'état.
- `src/nlu/` : interprétation locale des commandes et réponses structurées ; `scripts/nlu-test.mjs` vérifie les principaux cas en français.
- `src/lib/storage.js` : interface de persistance locale, remplaçable par un adaptateur distant.
- `src/hooks/` : intégrations aux API vocales du navigateur.

La solution de départ ne requiert aucun abonnement. Un backend de synchronisation ou un fournisseur d'IA peut être ajouté ultérieurement via ces points d'intégration ; leurs coûts, la confidentialité et l'authentification devront alors être évalués séparément.

## Mode agent (IA)

L'agent est activé par défaut dans **Réglages → IA**. Il reçoit ta phrase, les derniers messages et un résumé des tâches, raisonne côté serveur via Gemini, appelle les outils nécessaires (créer, lister, modifier, terminer, rouvrir, supprimer après confirmation, filtrer, naviguer, annuler), vérifie leurs résultats puis te répond en français. Il gère les références contextuelles (« termine-la ») et demande confirmation avant toute suppression.

1. Crée une clé Gemini dans [Google AI Studio](https://aistudio.google.com/apikey), en vérifiant les conditions, quotas et tarifs actuels de Google.
2. Copie `.env.example` en `.env.local` et renseigne `GEMINI_API_KEYS` (plusieurs clés possibles, séparées par des virgules, avec bascule automatique). `GEMINI_API_KEY` reste accepté. Ne jamais partager la clé dans une conversation ni la placer dans une variable `VITE_` ou un fichier versionné.
3. Redémarre `npm run dev` (ou `npm run build` puis `npm run preview`, ou `npm start` en production) pour charger la clé. **Réglages → IA** indique si elle est détectée.
4. Le mode agent envoie la phrase, l'historique et un résumé des tâches à Google ; la clé reste sur le serveur. Sans clé, sur un hébergement statique ou en cas d'erreur, l'application repasse automatiquement sur le moteur local sans interrompre l'utilisation. Le mode « compréhension simple » reste disponible comme repli.

**Important :** `/api/ai/agent` est fourni par le middleware Vite (`dev`, `preview`, `npm start`). Un hébergement purement statique ne fournit pas cet endpoint : déploie l'application comme service Node (avec `PORT`) pour activer l'agent. Le middleware contrôle l'origine des requêtes, mais ne comporte ni authentification utilisateur ni limitation de débit : il est prévu pour un usage personnel, pas une exposition publique. La reconnaissance vocale peut envoyer l'audio à un service externe selon le navigateur ; consulte les conditions de confidentialité Google avant d'activer l'agent.
