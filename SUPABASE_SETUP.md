# Configuration Supabase (à faire une fois)

L'app est prête. Il reste à créer le projet Supabase et à coller deux valeurs dans l'app. Comptez 10 minutes. Le plan gratuit suffit.

## 1. Créer le projet

1. Va sur https://supabase.com et connecte-toi (GitHub suffit).
2. « New project » → nom : `taches-pro` → choisis une région proche de chez toi → mot de passe de base de données (à conserver).
3. Attends que le projet soit prêt.

## 2. Récupérer les deux valeurs

Dans le projet Supabase :

- **Project URL** : `Settings` → `API` → `Project URL` → `https://xxxx.supabase.co`
- **anon public key** : `Settings` → `API` → `Project API keys` → la ligne **`anon` `public`** (pas la `service_role` !)

## 3. Créer la table

`SQL Editor` → `New query` → copie tout le contenu de `supabase/schema.sql` → `Run`.

Ça crée la table `tasks` et les règles de sécurité : chacun ne voit que ses propres tâches.

## 4. Autoriser l'email/password

`Authentication` → `Sign In / Providers` → `Email` → **active Email**, et **désactive « Confirm email »** pour tester immédiatement (ou garde-la active et confirme le mail reçu).

## 5. Déployer l'IA (Edge Function)

Installe la CLI Supabase, puis dans le dossier du projet :

```bash
npm install -g supabase
supabase login
supabase link --project-ref XXXX   # XXXX = l'identifiant dans l'URL du projet
supabase secrets set GEMINI_API_KEY=TA_CLE_ICI
supabase functions deploy classify-task
```

La vérification du token reste activée (comportement par défaut) : seule une personne connectée peut appeler l'IA.

La clé Gemini reste **sur le serveur Supabase**. Elle n'apparaît jamais dans l'app ni dans GitHub.

## 6. Dans l'app

Ouvre l'app (URL du site publié ou `localhost`) :

1. Écran **Configuration** : colle l'URL et la clé anon → Continuer.
2. Écran **Connexion** : « Créer un compte » avec ton email et un mot de passe.
3. Sur ton PC et ton téléphone : **même URL, mêmes identifiants** → mêmes tâches.

## Vérification rapide

- Dis « Prépare le client vendredi à 10h, c'est urgent » dans le chat.
- L'IA doit créer une tâche **priorité haute**, catégorie **Client**, échéance **vendredi**, et te répondre à l'écrit et à l'oral.
- Ouvre la même URL sur l'autre appareil : la tâche doit être là.

## Coût

- Supabase : plan gratuit ( largement suffisant pour un usage personnel ).
- Gemini flash-lite : quota gratuit généreux.
- Voix : gratuite, intégrée au navigateur.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Invalid API key » | Clé anon mal copiée ou URL avec un slash final |
| Connexion refusée | Email à confirmer, ou projet pas encore prêt |
| « GEMINI_API_KEY not configured » | Secret non posé ou fonction non déployée |
| Micro muet | Autorisation micro refusée, ou Firefox (peu compatible) |
| Tâches invisibles | RLS absente : relance `schema.sql` |
