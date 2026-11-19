# Gestion de tâches pro

Gestionnaire de tâches professionnel **mobile-first**, installable en **PWA** (mobile et desktop) et utilisable **hors ligne**. Aucune dépendance, aucun build : des fichiers statiques.

## Fonctionnalités

- Créer une tâche rapidement ou via un formulaire complet (titre, notes, priorité, échéance, catégorie).
- Cocher / décocher, modifier, supprimer, effacer les terminées.
- Recherche plein texte, filtres par statut, priorité et catégorie.
- Statistiques : à faire, terminées, en retard.
- Tri automatique : tâches actives d'abord, priorité, échéance.
- Thème clair / sombre (suit le système, mémorise le choix).
- Raccourcis clavier : `N` nouvelle tâche, `/` recherche, `Échap` ferme la fenêtre.
- Persistance locale dans `localStorage`, fonctionnement hors ligne via service worker.
- Installation en application autonome via le bouton « Installer l'app » (ou menu du navigateur).

## Lancer

Le service worker et l'installation PWA nécessitent **HTTPS** ou `localhost` (pas `file://`).

```bash
python3 -m http.server 8000
# ouvrir http://localhost:8000
```

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'interface |
| `styles.css` | Styles mobile-first, responsive à partir de 860px, thèmes |
| `app.js` | Logique, état, persistance, raccourcis, installation |
| `manifest.webmanifest` | Métadonnées PWA et icônes |
| `sw.js` | Service worker : cache de l'app shell, mode hors ligne |
| `icons/` | Icônes PNG (standards, maskables, Apple Touch) |
| `make_icons.py` | Générateur des icônes (Python pur, sans dépendance) |

## Installer

- **Android / Chrome** : menu ⋮ → « Installer l'application » (ou bouton dans l'en-tête).
- **iOS / Safari** : partager → « Sur l'écran d'accueil ».
- **Desktop Chrome / Edge** : icône d'installation dans la barre d'adresse, ou `...` → « Installer ».

## Limites actuelles

Les données sont **locales à chaque appareil** (`localStorage`). Il n'y a pas encore de compte ni de synchronisation entre téléphone et ordinateur. Pour un usage multi-appareils, il faudra ajouter un backend (base de données + authentification) et remplacer `localStorage` par un appel API.

## Licence

Apache-2.0
