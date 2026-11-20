/**
 * Jeu de données de démonstration.
 * Généré de façon déterministe autour de « aujourd'hui » pour que le tableau
 * de bord soit immédiatement parlant, même sans microphone.
 */
import { uid } from '../lib/utils.js'
import { dateUtils } from '../nlu/dates.js'

const DAY = 86400000

function at(base, dayOffset, hour = 9, minute = 0) {
  const date = dateUtils.addDays(dateUtils.startOfDay(base), dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date
}

export function seedDemoTasks(base = new Date()) {
  const now = base
  const stamp = (offsetDays) => new Date(now.getTime() - offsetDays * DAY).toISOString()

  const raw = [
    {
      title: 'Préparer la réunion client Alpha',
      notes: 'Revoir les chiffres du trimestre et préparer 3 propositions.',
      priority: 'critical',
      category: 'travail',
      due: at(now, -1, 17, 30),
      tags: ['reunion', 'client'],
      estimate: 90,
      subtasks: ['Consolider les slides', 'Relancer Karim pour les KPI', 'Réserver la salle B'],
      created: 4,
      source: 'voice',
    },
    {
      title: 'Envoyer le devis au client Dupont',
      priority: 'high',
      category: 'travail',
      due: at(now, 0, 11, 0),
      tags: ['email', 'client'],
      estimate: 20,
      created: 2,
      source: 'voice',
    },
    {
      title: 'Payer la facture d’électricité',
      priority: 'high',
      category: 'finance',
      due: at(now, 0, 9, 0),
      tags: ['paiement'],
      recurrence: { rrule: 'monthly', label: 'Chaque mois' },
      created: 9,
      source: 'voice',
    },
    {
      title: 'Rendez-vous dentiste',
      priority: 'medium',
      category: 'sante',
      due: at(now, 2, 14, 15),
      tags: ['rdv', 'sante'],
      created: 6,
      source: 'text',
    },
    {
      title: 'Faire les courses de la semaine',
      priority: 'medium',
      category: 'courses',
      due: at(now, 1, 10, 0),
      tags: ['achat'],
      subtasks: ['Légumes et fruits', 'Riz, pâtes, huile', 'Lessive'],
      created: 1,
      source: 'voice',
    },
    {
      title: 'Renouveler la carte d’identité',
      priority: 'high',
      category: 'admin',
      due: at(now, 5, 9, 0),
      tags: ['document'],
      notes: 'Prévoir justificatif de domicile de moins de 3 mois.',
      created: 12,
      source: 'text',
    },
    {
      title: 'Séance de sport',
      priority: 'low',
      category: 'sante',
      due: at(now, 0, 19, 0),
      tags: ['sante'],
      recurrence: { rrule: 'weekly-day', label: 'Hebdomadaire (jour fixe)' },
      estimate: 60,
      created: 3,
      source: 'voice',
    },
    {
      title: 'Appeler maman pour son anniversaire',
      priority: 'high',
      category: 'famille',
      due: at(now, 3, 18, 30),
      tags: ['appel', 'famille'],
      created: 5,
      source: 'voice',
    },
    {
      title: 'Réviser le chapitre de statistiques',
      priority: 'medium',
      category: 'etudes',
      due: at(now, 4, 20, 0),
      tags: ['revision'],
      estimate: 120,
      created: 7,
      source: 'text',
    },
    {
      title: 'Contrôle technique de la voiture',
      priority: 'medium',
      category: 'transport',
      due: at(now, 9, 8, 30),
      tags: ['rdv'],
      created: 15,
      source: 'voice',
    },
    {
      title: 'Réparer la fuite sous l’évier',
      priority: 'high',
      category: 'maison',
      due: at(now, 1, 16, 0),
      tags: ['maison'],
      created: 2,
      source: 'voice',
    },
    {
      title: 'Réserver le billet de train pour Cotonou',
      priority: 'medium',
      category: 'transport',
      due: at(now, 6, 12, 0),
      tags: ['achat'],
      created: 4,
      source: 'text',
    },
    {
      title: 'Lire 30 pages du livre en cours',
      priority: 'low',
      category: 'loisir',
      due: null,
      tags: ['detente'],
      created: 8,
      source: 'voice',
    },
    {
      title: 'Trier les papiers administratifs',
      priority: 'low',
      category: 'admin',
      due: null,
      tags: ['document'],
      created: 20,
      source: 'text',
    },
    {
      title: 'Faire le compte rendu du sprint',
      priority: 'medium',
      category: 'travail',
      due: at(now, 2, 17, 0),
      tags: ['document'],
      estimate: 45,
      created: 1,
      source: 'voice',
    },
    {
      title: 'Nettoyer la cuisine à fond',
      priority: 'low',
      category: 'maison',
      due: at(now, -3, 10, 0),
      tags: ['maison'],
      created: 10,
      source: 'text',
      done: true,
    },
    {
      title: 'Envoyer la note de frais',
      priority: 'medium',
      category: 'finance',
      due: at(now, -2, 9, 0),
      tags: ['paiement', 'document'],
      created: 6,
      source: 'voice',
      done: true,
    },
    {
      title: 'Commander le cadeau d’anniversaire',
      priority: 'medium',
      category: 'perso',
      due: at(now, -1, 20, 0),
      tags: ['achat'],
      created: 5,
      source: 'text',
      done: true,
    },
    {
      title: 'Séance de yoga',
      priority: 'low',
      category: 'sante',
      due: at(now, -4, 7, 30),
      tags: ['sante'],
      created: 9,
      source: 'voice',
      done: true,
    },
  ]

  return raw.map((item) => ({
    id: uid('task'),
    title: item.title,
    notes: item.notes || '',
    done: Boolean(item.done),
    priority: item.priority || 'medium',
    category: item.category || 'divers',
    tags: item.tags || [],
    dueAt: item.due ? item.due.toISOString() : null,
    dueHasTime: Boolean(item.due),
    recurrence: item.recurrence || null,
    estimateMinutes: item.estimate || null,
    subtasks: (item.subtasks || []).map((title) => ({ id: uid('sub'), title, done: false })),
    assignee: null,
    pinned: item.priority === 'critical' && !item.done,
    createdAt: stamp(item.created || 1),
    updatedAt: stamp(item.created || 1),
    completedAt: item.done ? stamp(Math.max(0, (item.created || 1) - 1)) : null,
    source: item.source || 'demo',
    auto: { priorityFromVoice: null, categoryAlternatives: [] },
  }))
}

export const VOICE_EXAMPLES = [
  'Ajoute une tâche appeler le client Dupont demain à 15h, c’est urgent',
  'Je dois préparer la présentation de lundi avec les étapes : faire les slides, envoyer l’invitation',
  'Crée une tâche payer la facture d’eau tous les mois',
  'Faire les courses samedi matin',
  'Qu’est-ce que j’ai à faire aujourd’hui ?',
  'Liste mes tâches en retard par priorité',
  'Montre-moi mes tâches de la catégorie travail',
  'Combien de tâches j’ai cette semaine ?',
  'Cherche tout ce qui concerne la facture',
  'J’ai fini envoyer le devis au client Dupont',
  'Reporte le rendez-vous dentiste à vendredi',
  'Supprime la tâche lire 30 pages',
]

export const QUICK_ADD_EXAMPLES = [
  'Demain 15h appeler le banquier #urgent',
  'Vendredi rendre le rapport annuel',
  'Dans 3 jours renouveler le passeport',
  'Samedi matin marché + courses',
]
