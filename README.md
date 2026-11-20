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

Le champ texte reste disponible si le micro ou la reconnaissance vocale ne sont pas pris en charge. Vérifier et corriger les tâches créées : la compréhension française est basée sur des règles et peut se tromper. Les fonctions vocales dépendent du navigateur, d'une autorisation et d'un contexte sécurisé (HTTPS ou localhost). Selon le navigateur, la reconnaissance vocale peut envoyer l'audio à un service externe et nécessiter une connexion Internet ; elle n'est pas nécessairement traitée localement. La synthèse vocale dépend également des voix installées.

Les données sont stockées dans IndexedDB, avec un repli sur localStorage. Elles restent liées au navigateur et à l'appareil : effacer les données du navigateur peut les supprimer. Utiliser l'export JSON dans les paramètres pour les sauvegarder et l'import pour les restaurer. Aucune synchronisation entre appareils n'est incluse.

## Architecture et évolutions

- React et Vite pour l'interface, Zustand pour l'état.
- `src/nlu/` : interprétation locale des commandes et réponses structurées ; `scripts/nlu-test.mjs` vérifie les principaux cas en français.
- `src/lib/storage.js` : interface de persistance locale, remplaçable par un adaptateur distant.
- `src/hooks/` : intégrations aux API vocales du navigateur.

La solution de départ ne requiert aucun abonnement. Un backend de synchronisation ou un fournisseur d'IA peut être ajouté ultérieurement via ces points d'intégration ; leurs coûts, la confidentialité et l'authentification devront alors être évalués séparément.

## Option : compréhension par Gemini

L'IA est désactivée par défaut. Pour l'activer :

1. Créer une clé Gemini dans [Google AI Studio](https://aistudio.google.com/apikey), en vérifiant les conditions, quotas et tarifs actuels de Google. Une offre gratuite peut être limitée ou indisponible selon le modèle ou le compte.
2. Copier `.env.example` en `.env.local`, puis renseigner `GEMINI_API_KEY` dans ce fichier **sur la machine qui exécute le serveur**. Ne jamais partager la clé dans une conversation, ni la placer dans une variable `VITE_` ou un fichier versionné.
3. Redémarrer `npm run dev` (ou `npm run build` puis `npm run preview`) pour charger la clé, ouvrir **Réglages → IA** et activer Gemini.

L'interface et les requêtes passent par le même serveur Vite : `/api/ai/interpret` appelle Gemini côté serveur et la clé n'est pas envoyée au navigateur. Seules la phrase et la date locale sont envoyées à Google ; la liste des tâches reste dans le navigateur. Des données personnelles peuvent cependant figurer dans la phrase : consulter les conditions de confidentialité de Google avant activation. Le moteur local prend le relais en cas d'erreur et affiche un avertissement. Les modifications et suppressions restent gérées par le moteur local. Les résultats de l'IA doivent être vérifiés.

**Important :** le serveur Vite et cet adaptateur sont conçus pour les tests personnels, pas pour une exposition publique : il n'y a ni authentification utilisateur, ni limitation de débit. Ne déployez pas une clé sur un serveur public sans backend de production sécurisé, authentification, quotas et protection contre les abus. L'accès réseau à `generativelanguage.googleapis.com` est nécessaire. Un hébergement statique seul ne fournit pas l'API. Dans certains environnements d'aperçu, les connexions sortantes vers Google peuvent être bloquées ; la configuration de la clé seule ne garantit pas la connexion.
