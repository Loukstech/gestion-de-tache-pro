# Gestion de tâches pro

Assistant vocal qui écoute, comprend et **classe tes tâches en raisonnant**. Mobile-first, synchro sur tous tes appareils via Supabase.

## Ce que ça fait

- Tu parles ou tu écris : « *Prépare le client vendredi, c'est urgent* ».
- L'IA extrait le titre, la priorité, la catégorie, l'échéance, les sous-tâches et **explique son choix**.
- Elle enregistre la tâche et te répond **à l'écrit et à l'oral**.
- Même compte sur téléphone et PC → mêmes tâches partout.

## Documentation

| Document | Contenu |
|---|---|
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Configurer le projet, la base et la fonction IA |
| [`USER_GUIDE.md`](USER_GUIDE.md) | Utiliser l'assistant, la voix, les filtres et l'installation |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Flux de données, choix techniques, sécurité, schéma |

## Installer

1. Suis [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) : créer le projet, exécuter le SQL, déployer la fonction IA.
2. Publie ce dossier comme site statique (ou sers-le en `localhost` pour tester).
3. Dans l'app : colle l'URL et la clé publique Supabase, crée un compte, c'est prêt.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

La PWA s'installe via le menu du navigateur (« Ajouter à l'écran d'accueil » / « Installer l'application »). HTTPS ou `localhost` requis.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Écrans configuration / connexion / assistant / tâches |
| `styles.css` | Mobile-first, navigation basse, thèmes clair/sombre |
| `app.js` | Interface, boucle vocale, rendu des tâches |
| `supabase.js` | Accès REST : auth, tâches, fonction IA |
| `config.js` | URL et clé publique du projet (par appareil) |
| `voice.js` | Micro → texte et texte → voix (API navigateur) |
| `supabase/schema.sql` | Table `tasks` + sécurité par utilisateur |
| `supabase/functions/classify-task/` | Fonction serveur : prompt structuré + Gemini |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA installable et cache hors ligne |

## Sécurité

- La **clé Gemini** est uniquement dans les secrets Supabase, jamais dans le code ni sur GitHub.
- La **clé anon** est publique par design ; la protection vient des règles RLS de la table.
- Chaque utilisateur ne peut lire/modifier que ses propres tâches.

## Limites

- Micro : Chrome, Edge et Safari vont bien ; Firefox est peu compatible.
- Mode hors ligne : les tâches déjà chargées restent lisibles ; l'IA et la synchro exigent le réseau.
- Gemini `flash-lite` peut être saturé aux heures de pointe ; le code renvoie un message clair.

## Licence

Apache-2.0
