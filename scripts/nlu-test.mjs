/**
 * Batterie de tests du moteur NLU français.
 * Lancer : node scripts/nlu-test.mjs
 */
import { interpret } from '../src/nlu/parser.js'
import { buildAnswer, filterTasks } from '../src/nlu/answers.js'
import { seedDemoTasks } from '../src/data/demo.js'
import { fromISODate } from '../src/nlu/dates.js'
import { CATEGORIES } from '../src/nlu/lexicon.js'

const NOW = new Date(2026, 10, 19, 8, 30) // jeudi 19 novembre 2026, 08:30
let passed = 0
let failed = 0

function show(label, value) {
  console.log(`   ${label.padEnd(12)} ${value}`)
}

function check(description, fn) {
  try {
    const result = fn()
    if (result === true || result === undefined) {
      passed += 1
      console.log(`✓ ${description}`)
    } else {
      failed += 1
      console.log(`✗ ${description}\n   → ${result}`)
    }
  } catch (error) {
    failed += 1
    console.log(`✗ ${description}\n   → ERREUR : ${error.message}`)
  }
}

function assert(condition, message) {
  return condition ? true : message
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : 'aucune')

console.log('\n═══ 1. CRÉATION + ENTITÉS ═══\n')

const creationCases = [
  {
    text: "Ajoute une tâche appeler le client Dupont demain à 15h, c'est urgent",
    expect: (r) => {
      const t = r.tasks[0]
      if (r.intent !== 'create') return `intent=${r.intent}`
      if (!t) return 'aucune tâche'
      return assert(
        /appeler le client dupont/i.test(t.title) &&
        t.priority === 'high' &&
        fromISODate(t.dueAt).getDate() === 20 &&
        fromISODate(t.dueAt).getHours() === 15 &&
        t.category === 'travail',
        `titre="${t.title}" prio=${t.priority} cat=${t.category} due=${fmt(t.dueAt)}`,
      )
    },
  },
  {
    text: 'Je dois faire les courses samedi matin',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.category === 'courses' && fromISODate(t.dueAt).getDay() === 6, `cat=${t?.category} due=${fmt(t?.dueAt)} titre="${t?.title}"`)
    },
  },
  {
    text: 'Crée une tâche payer la facture d’électricité tous les mois, prioritaire',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.recurrence?.rrule === 'monthly' && t.priority === 'high' && t.category === 'finance', `rec=${t?.recurrence?.rrule} prio=${t?.priority} cat=${t?.category}`)
    },
  },
  {
    text: 'Préparer la réunion de lundi avec les étapes : faire les slides, inviter l’équipe, réserver la salle',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.subtasks.length === 3 && t.category === 'travail', `sous-tâches=${t?.subtasks?.length} cat=${t?.category} titre="${t?.title}"`)
    },
  },
  {
    text: 'Note qu’il faut renouveler la carte d’identité à la préfecture dans 3 jours, c’est critique',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.priority === 'critical' && t.category === 'admin' && fromISODate(t.dueAt).getDate() === 22, `prio=${t?.priority} cat=${t?.category} due=${fmt(t?.dueAt)} titre="${t?.title}"`)
    },
  },
  {
    text: 'Ajoute une tâche rendez-vous chez le dentiste le 12 décembre à 14h30',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(
        t && t.category === 'sante' && fromISODate(t.dueAt).getDate() === 12 && fromISODate(t.dueAt).getMonth() === 11 && fromISODate(t.dueAt).getHours() === 14 && fromISODate(t.dueAt).getMinutes() === 30,
        `cat=${t?.category} due=${fmt(t?.dueAt)} titre="${t?.title}"`,
      )
    },
  },
  {
    text: 'Rappelle-moi de sortir les poubelles ce soir vers 20h',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.category === 'maison' && fromISODate(t.dueAt).getHours() === 20, `cat=${t?.category} due=${fmt(t?.dueAt)} titre="${t?.title}"`)
    },
  },
  {
    text: 'Il faut que je révise mes cours de statistiques pour l’examen de vendredi, pas urgent',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.category === 'etudes' && t.priority === 'low', `cat=${t?.category} prio=${t?.priority} titre="${t?.title}"`)
    },
  },
  {
    text: 'Ajoute faire le plein d’essence demain et appeler maman samedi',
    expect: (r) => assert(r.tasks.length === 2, `${r.tasks.length} tâches : ${r.tasks.map((t) => t.title).join(' | ')}`),
  },
  {
    text: 'Crée une tâche contrôle technique de la voiture dans deux semaines, environ 1 heure',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.category === 'transport' && t.estimateMinutes === 60, `cat=${t?.category} estime=${t?.estimateMinutes} due=${fmt(t?.dueAt)}`)
    },
  },
  {
    text: 'Ajoute une tâche #projet-alpha envoyer le rapport annuel au directeur vendredi prochain',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.tags.includes('projet-alpha'), `tags=${JSON.stringify(t?.tags)} titre="${t?.title}"`)
    },
  },
  {
    text: 'Ajoute une tâche aller à la pharmacie acheter des médicaments, dans la catégorie Santé',
    expect: (r) => {
      const t = r.tasks[0]
      return assert(t && t.category === 'sante', `cat=${t?.category} titre="${t?.title}"`)
    },
  },
]

creationCases.forEach((testCase) => {
  check(`« ${testCase.text} »`, () => {
    const result = interpret(testCase.text, { now: NOW })
    console.log(`   → [${result.intent}] ${result.tasks.map((t) => `"${t.title}" (${CATEGORIES[t.category].label}, ${t.priority}, ${fmt(t.dueAt)})`).join(' + ')}`)
    return testCase.expect(result)
  })
})

console.log('\n═══ 2. REQUÊTES / LISTES ═══\n')

const demo = seedDemoTasks(NOW)

const queryCases = [
  { text: "Qu'est-ce que j'ai à faire aujourd'hui ?", range: 'today' },
  { text: 'Liste mes tâches en retard', range: 'overdue' },
  { text: 'Montre-moi mes tâches de cette semaine', range: 'week' },
  { text: 'Quelles sont mes tâches terminées ?', status: 'done' },
  { text: 'Affiche mes tâches sans date', range: 'someday' },
  { text: 'Liste mes tâches de la catégorie travail', category: 'travail' },
  { text: 'Quelles sont mes tâches urgentes ?', priority: 'high' },
  { text: 'Montre mon agenda', range: 'week' },
]

queryCases.forEach((testCase) => {
  check(`« ${testCase.text} »`, () => {
    const result = interpret(testCase.text, { now: NOW })
    if (result.intent !== 'list' && result.intent !== 'search') return `intent=${result.intent}`
    const matched = filterTasks(demo, result.filters, NOW)
    console.log(`   → filtres=${JSON.stringify(result.filters)} · ${matched.length} résultat(s)`)
    if (testCase.range) return assert(result.filters.range === testCase.range, `range=${result.filters.range}`)
    if (testCase.category) return assert(result.filters.category === testCase.category, `category=${result.filters.category}`)
    if (testCase.priority) return assert(result.filters.priority === testCase.priority, `priority=${result.filters.priority}`)
    if (testCase.status) return assert(result.filters.status === testCase.status, `status=${result.filters.status}`)
    return true
  })
})

check('Réponse structurée pour « qu’est-ce que j’ai à faire aujourd’hui ? »', () => {
  const result = interpret("Qu'est-ce que j'ai à faire aujourd'hui ?", { now: NOW })
  const matched = filterTasks(demo, result.filters, NOW)
  const answer = buildAnswer(result, matched, NOW)
  console.log(`   → groupes : ${answer.groups.map((g) => `${g.title}(${g.tasks.length})`).join(', ')}`)
  console.log(`   → parlé  : ${answer.spoken}`)
  return assert(answer.groups.length > 0 && answer.stats.length > 0, 'réponse vide')
})

check('Bilan chiffré « donne-moi mes statistiques »', () => {
  const result = interpret('Donne-moi mes statistiques', { now: NOW })
  if (result.intent !== 'stats') return `intent=${result.intent}`
  const answer = buildAnswer(result, demo, NOW)
  console.log(`   → ${answer.spoken}`)
  return assert(answer.breakdown?.byCategory?.length > 0, 'pas de répartition')
})

console.log('\n═══ 3. RECHERCHE ═══\n')

;['Cherche tout ce qui concerne la facture', 'Trouve mes tâches sur le client', 'Recherche dentiste'].forEach((text) => {
  check(`« ${text} »`, () => {
    const result = interpret(text, { now: NOW })
    if (result.intent !== 'search') return `intent=${result.intent}`
    const matched = filterTasks(demo, result.filters, NOW)
    console.log(`   → query="${result.filters.query}" · ${matched.length} résultat(s) : ${matched.map((t) => t.title).join(' | ')}`)
    return assert(matched.length > 0, 'aucun résultat')
  })
})

console.log('\n═══ 4. ACTIONS (terminer / modifier / supprimer) ═══\n')

check('« J’ai fini envoyer le devis au client Dupont »', () => {
  const result = interpret("J'ai fini envoyer le devis au client Dupont", { now: NOW })
  console.log(`   → [${result.intent}] query="${result.filters.query}"`)
  const matched = filterTasks(demo, { ...result.filters, status: 'open' }, NOW)
  return assert(result.intent === 'complete' && matched.length >= 1, `intent=${result.intent} matched=${matched.length}`)
})

check('« Termine toutes mes tâches en retard »', () => {
  const result = interpret('Termine toutes mes tâches en retard', { now: NOW })
  return assert(result.intent === 'complete' && result.filters.range === 'overdue', `intent=${result.intent} range=${result.filters.range}`)
})

check('« Supprime la tâche lire 30 pages du livre en cours »', () => {
  const result = interpret('Supprime la tâche lire 30 pages du livre en cours', { now: NOW })
  console.log(`   → [${result.intent}] query="${result.filters.query}"`)
  const matched = filterTasks(demo, result.filters, NOW)
  return assert(result.intent === 'delete' && matched.length >= 1, `intent=${result.intent} matched=${matched.length} : ${matched.map((t) => t.title).join('|')}`)
})

check('« Reporte le rendez-vous dentiste à vendredi »', () => {
  const result = interpret('Reporte le rendez-vous dentiste à vendredi', { now: NOW })
  console.log(`   → [${result.intent}] patch=${JSON.stringify(result.patch)} query="${result.filters.query}"`)
  return assert(result.intent === 'update' && result.patch?.dueAt, `intent=${result.intent} patch=${JSON.stringify(result.patch)}`)
})

check('« Passe préparer la réunion client Alpha en priorité critique »', () => {
  const result = interpret('Passe préparer la réunion client Alpha en priorité critique', { now: NOW })
  console.log(`   → [${result.intent}] patch=${JSON.stringify(result.patch)} query="${result.filters.query}"`)
  return assert(result.intent === 'update' && result.patch?.priority === 'critical', `intent=${result.intent} patch=${JSON.stringify(result.patch)}`)
})

console.log('\n═══ 5. AIDE / INCONNU ═══\n')

check('« Aide, que sais-tu faire ? »', () => {
  const result = interpret("Aide, qu'est-ce que tu sais faire ?", { now: NOW })
  return assert(result.intent === 'help', `intent=${result.intent}`)
})

check('« Annule ça »', () => {
  const result = interpret('Annule ça', { now: NOW })
  return assert(result.intent === 'undo', `intent=${result.intent}`)
})

check('Phrase bruitée de dictée vocale', () => {
  const result = interpret('euh bon ben ajoute une tâche pour demain dix-sept heures trente préparer le compte rendu stp', { now: NOW })
  const t = result.tasks[0]
  console.log(`   → [${result.intent}] "${t?.title}" · ${fmt(t?.dueAt)}`)
  return assert(t && fromISODate(t.dueAt).getHours() === 17 && fromISODate(t.dueAt).getMinutes() === 30, `due=${fmt(t?.dueAt)} titre="${t?.title}"`)
})

console.log('\n═══ 6. DATES ═══\n')

const dateCases = [
  ['Ajoute une tâche test aujourd’hui', 19],
  ['Ajoute une tâche test demain', 20],
  ['Ajoute une tâche test après-demain', 21],
  ['Ajoute une tâche test dans 5 jours', 24],
  ['Ajoute une tâche test lundi prochain', 23],
  ['Ajoute une tâche test le 25 novembre', 25],
  ['Ajoute une tâche test le 3 janvier', 3],
  ['Ajoute une tâche test ce week-end', 21],
  ['Ajoute une tâche test dans deux semaines', 3],
]

dateCases.forEach(([text, expectedDay]) => {
  check(`« ${text} » → jour ${expectedDay}`, () => {
    const result = interpret(text, { now: NOW })
    const t = result.tasks[0]
    const actual = t?.dueAt ? fromISODate(t.dueAt).getDate() : null
    console.log(`   → ${fmt(t?.dueAt)}`)
    return assert(actual === expectedDay, `attendu=${expectedDay} obtenu=${actual}`)
  })
})

console.log('\n═══ 7. DEMANDES COURANTES ET CLASSEMENT ═══\n')
for (const [text, expected] of [
  ['Je dois aller au marché', 'courses'],
  ['Acheter médicaments', 'sante'],
  ['Je veux payer ma facture demain', 'finance'],
  ['Je dois envoyer un message au client', 'travail'],
]) {
  check(`Classement : ${text}`, () => {
    const task = interpret(text, { now: NOW }).tasks[0]
    return assert(task?.category === expected, `attendu=${expected}, obtenu=${task?.category}`)
  })
}
for (const [text, range, category] of [
  ['Donne moi toutes mes tâches', null, null],
  ['Montre moi ce que je dois faire demain', 'tomorrow', null],
  ['Trouve mes tâches de travail', null, 'travail'],
]) {
  check(`Demande : ${text}`, () => {
    const result = interpret(text, { now: NOW })
    return assert(result.intent === 'list' && result.filters.range === range && result.filters.category === category,
      `intent=${result.intent}, filtres=${JSON.stringify(result.filters)}`)
  })
}

console.log('\n═══ 8. PHRASES NON-TÂCHES ═══\n')

for (const phrase of ['est-ce que tu me comprends', 'tu me comprends ?', 'comment ça va', 'bonjour', 'merci']) {
  check(`« ${phrase} » ne crée pas de tâche`, () => {
    const result = interpret(phrase, { now: NOW })
    return assert(result.intent === 'unknown' && result.tasks.length === 0 && result.notice === 'conversation',
      `intent=${result.intent}, tâches=${result.tasks.length}, notice=${result.notice}`)
  })
}

for (const phrase of ['Acheter médicaments', 'Prendre rendez-vous chez le dentiste']) {
  check(`« ${phrase} » reste une création implicite`, () => {
    const result = interpret(phrase, { now: NOW })
    return assert(result.intent === 'create' && result.tasks.length === 1, `intent=${result.intent}, tâches=${result.tasks.length}`)
  })
}

console.log('\n═══ 9. PRÉFIXES AVEC TIRET ═══\n')

for (const [phrase, expected] of [
  ['Crée-moi une tâche en gestion de tâches application de gestion de stage', 'Application de gestion de stage'],
  ['Ajoute-moi une tâche appeler le client demain', 'Appeler le client'],
  ['Note-moi de faire les courses', 'Faire les courses'],
  ['Crée une tâche tester le modèle', 'Tester le modèle'],
]) {
  check(`« ${phrase} » → "${expected}"`, () => {
    const result = interpret(phrase, { now: NOW })
    return assert(result.intent === 'create' && result.tasks[0]?.title === expected,
      `intent=${result.intent}, titre="${result.tasks[0]?.title}"`)
  })
}

console.log(`\n${'═'.repeat(46)}`)
console.log(`  Résultat : ${passed} réussis · ${failed} échoués`)
console.log('═'.repeat(46))
process.exit(failed > 0 ? 1 : 0)
