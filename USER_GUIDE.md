# Guide d'utilisation

## Première ouverture (une fois par appareil)

1. **Configuration** : colle l'URL Supabase (`https://xxxx.supabase.co`) et la clé **anon public**. Ces deux valeurs se trouvent dans `Settings → API` de ton projet.
2. **Connexion** : « Créer un compte » avec ton email et un mot de passe d'au moins 6 caractères.
3. Sur ton autre appareil : même URL, mêmes identifiants → mêmes tâches.

## Créer une tâche avec l'IA

Dans l'onglet **Assistant** :

- **À la voix** : touche le bouton rond. Parle, puis touche à nouveau (ou attends la fin de la phrase). Le texte apparaît dans le champ.
- **Au clavier** : écris directement dans le champ et toucheEnvoyer.

Exemples de phrases qui donnent de bons résultats :

| Tu dis | L'IA comprend |
|---|---|
| « Prépare le client vendredi à 10h, c'est urgent » | Priorité haute, catégorie Client, échéance vendredi |
| « Rappeler le plombier lundi, c'est secondaire » | Priorité basse, échéance lundi |
| « Refaire la charte : d'abord les couleurs, puis les polices, puis logo » | Tâche + sous-tâches |

Après chaque création, l'IA affiche **son raisonnement** sous sa réponse et la dit à voix haute. Un badge « IA » apparaît sur la tâche dans la liste.

## Gérer les tâches

Onglet **Tâches** :

- Touche la case à gauche pour marquer terminé / rouvrir.
- Touche le crayon pour modifier titre, notes, priorité, échéance, catégorie ou supprimer.
- Recherche et filtres par statut, priorité et catégorie.
- « Effacer les terminées » vide uniquement les tâches cochées.

## Voix : réglages utiles

- **Autoriser le micro** quand le navigateur le demande. Si tu refuses, le clavier reste utilisable.
- **Couper la voix** : touche le bouton micro pendant que l'IA parle, ou ferme l'onglet.
- **Chrome / Edge / Safari** : reconnaissance vocale complète. **Firefox** : souvent non pris en charge pour le micro.
- La voix de lecture utilise celle de ton appareil en français, si disponible.

## Installer sur l'écran d'accueil

- **Android / Chrome** : menu ⋮ → « Installer l'application ».
- **iPhone / Safari** : bouton Partager → « Sur l'écran d'accueil ».
- **PC / Chrome ou Edge** : icône d'installation dans la barre d'adresse, ou menu → « Installer ».

Une fois installée, l'app s'ouvre en plein écran, sans barre de navigateur.

## Hors ligne

Les tâches déjà chargées restent lisibles sans réseau. La création par IA, la voix et la synchro nécessitent une connexion.

## Problèmes fréquents

| Symptôme | Solution |
|---|---|
| « Invalid API key » | Vérifie l'URL et la clé anon (pas la service_role) |
| Connexion refusée | Confirme ton email si la confirmation est activée dans Supabase |
| « GEMINI_API_KEY not configured » | Relance `supabase secrets set GEMINI_API_KEY=...` puis redéploie la fonction |
| Le micro ne répond pas | Autorise le micro dans les réglages du site, change de navigateur |
| Réponse vocale absente | Vérifie le volume et que le français est installé comme voix système |
| Tâches different entre appareils | Vérifie que tu utilises le même compte et la même URL |
