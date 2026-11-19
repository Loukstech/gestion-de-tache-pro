# Architecture

Vue d'ensemble technique. Pour la mise en route, voir `SUPABASE_SETUP.md`.

## Flux d'une tâche vocale

```
Utilisateur (parle)
   ↓  Web Speech API (navigateur, fr-FR)
Texte
   ↓  POST /functions/v1/classify-task  (Bearer token Supabase)
Edge Function
   ↓  Gemini flash-lite, prompt structuré, clé serveur
JSON { title, priority, category, due, subtasks, reasoning, reply }
   ↓  POST /rest/v1/tasks  (Bearer token, RLS)
Supabase Postgres
   ↓  lecture par l'autre appareil
Affichage + synthèse vocale
```

## Couches

| Couche | Technologie | Données |
|---|---|---|
| Interface | HTML/CSS/JS natif, modules ES | Aucune dépendance, aucun build |
| Voix | Web Speech API | Gratuite, côté navigateur |
| Auth + base | Supabase (Postgres) | RLS par `auth.uid()` |
| Raisonnement | Supabase Edge Function + Gemini | Clé dans les secrets serveur |
| PWA | Manifest + service worker v2 | Cache de l'app shell et des tâches |

## Choix importants

**Pourquoi une Edge Function et pas un appel Gemini direct ?**
Une clé API dans le navigateur est publique : n'importe qui pourrait la lire dans le code source et l'utiliser. La fonction serveur garde la clé hors du dépôt et hors du client. Supabase vérifie aussi le JWT : seul un utilisateur connecté peut appeler l'IA.

**Pourquoi REST et pas le SDK Supabase ?**
L'app est un site statique sans build. Un client `fetch` minimal évite une dépendance CDN, garde le service worker simple et rend l'app lisible par n'importe qui.

**Pourquoi un cache local des tâches ?**
Le cache (`gdtp.tasks.cache.v1`) sert uniquement à afficher quelque chose hors ligne. La source de vérité reste Supabase. À la reconnexion, les données distantes remplacent le cache.

**Session**
Le token de session est conservé dans `localStorage` (`gdtp.session.v1`) pour éviter de demander le mot de passe à chaque ouverture. Il est effacé à la déconnexion.

## Sécurité

- Table `tasks` avec RLS : `auth.uid() = user_id` pour lire, écrire, modifier et supprimer.
- Clé `anon` publique, clé `service_role` jamais utilisée par le client.
- Clé Gemini uniquement dans `GEMINI_API_KEY` sur Supabase.
- Aucune clé secrète dans le dépôt Git (vérifié avant chaque commit).
- `cors` ouvert sur la fonction : l'accès est contrôlé par le JWT, pas par l'origine.

## Schéma de données

`tasks` : `id` (uuid), `user_id` (uuid), `title`, `notes`, `priority` (high/medium/low), `category`, `due` (date), `done`, `ai_reasoning`, `created_at`, `completed_at`.

Index : `(user_id, created_at desc)`.

## Limites connues

- Gemini `flash-lite` peut renvoyer 503 en cas de forte demande ; l'app affiche un message et la tâche n'est pas créée.
- La reconnaissance vocale dépend du navigateur et d'un service en ligne ; hors ligne, le clavier reste disponible.
- Le prompt ne gère qu'**une** tâche par énoncé. Les étapes sont stockées dans `notes` / sous-tâches.
- Le plan gratuit Supabase suffit pour un usage personnel mais impose des quotas ; au-delà, il faut passer à un plan payant.
