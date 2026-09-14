// Modèle métier : structure des données, valeurs par défaut et tous les calculs
// (solde, budget vs réalisé, situation des copropriétaires, répartition aux tantièmes).

import { anneeDe, normalise, uid } from './format.js';

export const VERSION_DONNEES = 1;

/** Palette des catégories : lisible à l'écran comme à l'impression. */
export const CATEGORIES_DEFAUT = [
  { code: 'assurance', nom: 'Assurance immeuble', type: 'depense', couleur: '#2f6f8f' },
  { code: 'eau', nom: 'Eau', type: 'depense', couleur: '#4aa3c7' },
  { code: 'electricite', nom: 'Électricité parties communes', type: 'depense', couleur: '#e2a83b' },
  { code: 'chauffage', nom: 'Chauffage', type: 'depense', couleur: '#d4703a' },
  { code: 'menage', nom: 'Nettoyage / entretien', type: 'depense', couleur: '#6a9a5b' },
  { code: 'ascenseur', nom: 'Ascenseur', type: 'depense', couleur: '#8a6fa8' },
  { code: 'jardin', nom: 'Espaces verts', type: 'depense', couleur: '#4f8f6a' },
  { code: 'travaux', nom: 'Travaux et réparations', type: 'depense', couleur: '#b4534b' },
  { code: 'honoraires', nom: 'Honoraires et gestion', type: 'depense', couleur: '#7a7f87' },
  { code: 'banque', nom: 'Frais bancaires', type: 'depense', couleur: '#9a8c6f' },
  { code: 'taxes', nom: 'Taxes et impôts', type: 'depense', couleur: '#59636e' },
  { code: 'divers', nom: 'Divers', type: 'depense', couleur: '#a0a6ad' },
  { code: 'provisions', nom: 'Provisions sur charges', type: 'recette', couleur: '#2e7d5b' },
  { code: 'travaux_appel', nom: 'Appel de fonds travaux', type: 'recette', couleur: '#3f9c72' },
  { code: 'autres_recettes', nom: 'Autres recettes', type: 'recette', couleur: '#6fbf9a' },
];

export const MODELE_MESSAGE_PROVISION = `Bonjour {prenom},

Appel de provision {numero} — {periode}
Lot {lot} · {tantiemes}/1000 tantièmes

Montant à régler : {montant}
Échéance : {echeance}

Virement sur le compte du syndic :
{iban}
Communication : {communication}

Merci d'avance,
{gestionnaire} — {syndic}`;

export const MODELE_MESSAGE_GROUPE = `📊 {syndic} — Point de trésorerie au {date}

Solde du compte : {solde}
Dépenses réalisées : {depenses} sur {budget} budgétés ({consommation})
Provisions encaissées : {provisions}

{commentaire}`;

export function baseVierge(annee = new Date().getFullYear()) {
  return {
    version: VERSION_DONNEES,
    modifieLe: new Date().toISOString(),
    sauvegardeLe: null,
    parametres: {
      syndic: "Syndic L'Ancienne École",
      adresse: '',
      gestionnaire: '',
      iban: '',
      indicatifTelephone: '33',
      exerciceCourant: annee,
      cleGemini: '',
      modeleGemini: 'gemini-2.5-flash',
      messageProvision: MODELE_MESSAGE_PROVISION,
      messageGroupe: MODELE_MESSAGE_GROUPE,
    },
    exercices: [exerciceVierge(annee)],
    categories: CATEGORIES_DEFAUT.map((c) => ({ id: c.code, ...c })),
    lots: [],
    budget: [],
    operations: [],
    factures: [],
    appels: [],
    rapports: [],
  };
}

export function exerciceVierge(annee) {
  return {
    annee,
    soldeOuverture: 0,
    cloture: false,
    note: '',
  };
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export function exercice(db, annee) {
  return db.exercices.find((e) => e.annee === annee) || exerciceVierge(annee);
}

export function anneesConnues(db) {
  const set = new Set(db.exercices.map((e) => e.annee));
  db.operations.forEach((o) => set.add(anneeDe(o.date)));
  if (!set.size) set.add(new Date().getFullYear());
  return [...set].sort((a, b) => b - a);
}

export function categorie(db, id) {
  return db.categories.find((c) => c.id === id) || null;
}

export function nomCategorie(db, id) {
  const c = categorie(db, id);
  return c ? c.nom : 'Non classé';
}

export function couleurCategorie(db, id) {
  const c = categorie(db, id);
  return c ? c.couleur : '#b9bec5';
}

export function lot(db, id) {
  return db.lots.find((l) => l.id === id) || null;
}

export function lotsActifs(db) {
  return db.lots.filter((l) => l.actif !== false);
}

export function totalTantiemes(db) {
  return lotsActifs(db).reduce((s, l) => s + (Number(l.tantiemes) || 0), 0);
}

// ---------------------------------------------------------------------------
// Trésorerie
// ---------------------------------------------------------------------------

export function operationsExercice(db, annee) {
  return db.operations
    .filter((o) => anneeDe(o.date) === annee)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function totaux(db, annee) {
  const ops = operationsExercice(db, annee);
  const recettes = ops.filter((o) => o.montant > 0).reduce((s, o) => s + o.montant, 0);
  const depenses = ops.filter((o) => o.montant < 0).reduce((s, o) => s + Math.abs(o.montant), 0);
  const ouverture = exercice(db, annee).soldeOuverture || 0;
  return {
    ouverture,
    recettes,
    depenses,
    resultat: recettes - depenses,
    solde: ouverture + recettes - depenses,
    nbOperations: ops.length,
  };
}

/** Solde du compte à date (utile pour le « temps réel » du tableau de bord). */
export function soldeCourant(db) {
  const annee = db.parametres.exerciceCourant;
  return totaux(db, annee).solde;
}

/** Série cumulée du solde, un point par opération, pour la courbe annuelle. */
export function courbeSolde(db, annee) {
  const ops = operationsExercice(db, annee);
  let solde = exercice(db, annee).soldeOuverture || 0;
  const points = [{ date: `${annee}-01-01`, valeur: solde, libelle: "Solde d'ouverture" }];
  ops.forEach((o) => {
    solde += o.montant;
    points.push({ date: o.date, valeur: solde, libelle: o.libelle });
  });
  return points;
}

/** Solde en fin de chaque mois — plus lisible que le point-à-point sur un rapport. */
export function soldeMensuel(db, annee) {
  const ops = operationsExercice(db, annee);
  let solde = exercice(db, annee).soldeOuverture || 0;
  const mois = Array.from({ length: 12 }, () => ({ recettes: 0, depenses: 0, solde: 0 }));
  let curseur = 0;
  for (let m = 0; m < 12; m += 1) {
    while (curseur < ops.length && Number(ops[curseur].date.slice(5, 7)) === m + 1) {
      const o = ops[curseur];
      if (o.montant > 0) mois[m].recettes += o.montant;
      else mois[m].depenses += Math.abs(o.montant);
      solde += o.montant;
      curseur += 1;
    }
    mois[m].solde = solde;
  }
  return mois;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export function budgetAnnee(db, annee) {
  return db.budget.filter((b) => b.annee === annee);
}

export function totalBudget(db, annee, type = 'depense') {
  return budgetAnnee(db, annee)
    .filter((b) => {
      const c = categorie(db, b.categorieId);
      return c ? c.type === type : type === 'depense';
    })
    .reduce((s, b) => s + (Number(b.montant) || 0), 0);
}

/**
 * Le cœur du bilan annuel : pour chaque catégorie, le budgété, le réalisé,
 * l'écart et le taux de consommation. Les catégories hors budget apparaissent
 * aussi (budget à 0) — c'est précisément ce qu'il faut voir en AG.
 */
export function comparatifBudget(db, annee, type = 'depense') {
  const lignesBudget = budgetAnnee(db, annee);
  const ops = operationsExercice(db, annee);
  const parCategorie = new Map();

  const assure = (categorieId) => {
    if (!parCategorie.has(categorieId)) {
      const c = categorie(db, categorieId);
      parCategorie.set(categorieId, {
        categorieId,
        nom: c ? c.nom : 'Non classé',
        couleur: c ? c.couleur : '#b9bec5',
        type: c ? c.type : 'depense',
        budget: 0,
        realise: 0,
      });
    }
    return parCategorie.get(categorieId);
  };

  lignesBudget.forEach((b) => {
    assure(b.categorieId).budget += Number(b.montant) || 0;
  });

  ops.forEach((o) => {
    const c = categorie(db, o.categorieId);
    const typeOp = c ? c.type : o.montant > 0 ? 'recette' : 'depense';
    if (typeOp !== type) return;
    assure(o.categorieId || 'divers').realise += Math.abs(o.montant);
  });

  return [...parCategorie.values()]
    .filter((l) => l.type === type && (l.budget || l.realise))
    .map((l) => ({
      ...l,
      // Un écart positif est toujours une bonne nouvelle : moins dépensé que
      // prévu sur une charge, plus encaissé que prévu sur une recette.
      ecart: type === 'recette' ? l.realise - l.budget : l.budget - l.realise,
      consommation: l.budget ? l.realise / l.budget : null,
    }))
    .sort((a, b) => b.realise - a.realise || b.budget - a.budget);
}

/** Répartition des dépenses réalisées — c'est le camembert du tableau de bord. */
export function repartitionDepenses(db, annee) {
  const lignes = comparatifBudget(db, annee, 'depense')
    .filter((l) => l.realise > 0)
    .map((l) => ({ label: l.nom, valeur: l.realise, couleur: l.couleur }));
  return lignes.sort((a, b) => b.valeur - a.valeur);
}

/** Proposition de budget N+1 : réalisé de l'exercice, arrondi, avec indexation. */
export function propositionBudget(db, annee, indexation = 0.02) {
  return comparatifBudget(db, annee, 'depense').map((l) => {
    const base = l.realise || l.budget;
    const propose = Math.ceil((base * (1 + indexation)) / 10) * 10;
    return { ...l, propose };
  });
}

// ---------------------------------------------------------------------------
// Copropriétaires et appels de provisions
// ---------------------------------------------------------------------------

/**
 * Répartit un montant total entre les lots. Aux tantièmes par défaut ;
 * l'arrondi résiduel tombe sur le plus gros lot pour que la somme
 * des quotes-parts égale toujours le total appelé, au centime près.
 */
export function repartir(db, total, mode = 'tantiemes', lotsCibles = null) {
  const lots = (lotsCibles || lotsActifs(db)).slice();
  if (!lots.length) return [];
  let parts;
  if (mode === 'egale') {
    const part = total / lots.length;
    parts = lots.map((l) => ({ lotId: l.id, montant: arrondi(part) }));
  } else {
    const base = lots.reduce((s, l) => s + (Number(l.tantiemes) || 0), 0) || lots.length;
    parts = lots.map((l) => ({
      lotId: l.id,
      montant: arrondi((total * (Number(l.tantiemes) || 1)) / base),
    }));
  }
  const somme = parts.reduce((s, p) => s + p.montant, 0);
  const residu = arrondi(total - somme);
  if (residu !== 0) {
    let indexMax = 0;
    parts.forEach((p, i) => {
      if (p.montant > parts[indexMax].montant) indexMax = i;
    });
    parts[indexMax].montant = arrondi(parts[indexMax].montant + residu);
  }
  return parts;
}

export function arrondi(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function appelsAnnee(db, annee) {
  return db.appels
    .filter((a) => a.annee === annee)
    .sort((a, b) => (a.dateEmission < b.dateEmission ? -1 : 1));
}

export function totalAppel(appel) {
  return arrondi((appel.lignes || []).reduce((s, l) => s + (Number(l.montant) || 0), 0));
}

export function totalEncaisseAppel(appel) {
  return arrondi((appel.lignes || []).filter((l) => l.paye).reduce((s, l) => s + (Number(l.montant) || 0), 0));
}

/**
 * Situation de chaque copropriétaire sur l'exercice : appelé, réglé, reste dû.
 * C'est le tableau qu'on projette en assemblée générale.
 */
export function situationLots(db, annee) {
  const appels = appelsAnnee(db, annee);
  return lotsActifs(db).map((l) => {
    let appele = 0;
    let regle = 0;
    const detail = [];
    appels.forEach((a) => {
      const ligne = (a.lignes || []).find((x) => x.lotId === l.id);
      if (!ligne) return;
      appele += Number(ligne.montant) || 0;
      if (ligne.paye) regle += Number(ligne.montant) || 0;
      detail.push({ appelId: a.id, numero: a.numero, libelle: a.libelle, ...ligne });
    });
    return {
      lot: l,
      appele: arrondi(appele),
      regle: arrondi(regle),
      solde: arrondi(appele - regle),
      detail,
    };
  });
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export function facturesEnAttente(db) {
  return db.factures
    .filter((f) => f.statut !== 'payee')
    .sort((a, b) => (a.echeance || a.date) < (b.echeance || b.date) ? -1 : 1);
}

// ---------------------------------------------------------------------------
// Rapprochement automatique après un scan
// ---------------------------------------------------------------------------

/**
 * Devine la catégorie d'une opération à partir de son libellé bancaire.
 * Complète l'IA : si Gemini n'a pas tranché, les mots-clés le font.
 */
const MOTS_CLES = [
  [/assuranc|axa|maif|allianz|generali|macif|ethias|mutuel/, 'assurance'],
  [/\beau\b|veolia|suez|saur|vivaqua|swde|distribution d.?eau/, 'eau'],
  [/edf|engie|electr|enedis|total ?energ|luminus|eneco|mega/, 'electricite'],
  [/gaz|mazout|fioul|chauff|chaudiere|ramonage/, 'chauffage'],
  [/nettoy|menage|proprete|onet|concierge|entretien/, 'menage'],
  [/ascenseur|otis|kone|schindler|thyssen/, 'ascenseur'],
  [/jardin|espaces? verts?|elagage|tonte|paysag/, 'jardin'],
  [/travaux|plomb|electricien|toiture|couvreur|peinture|serrur|macon|reparation|depannage/, 'travaux'],
  [/honoraire|syndic|gestion|comptab|avocat|huissier|expert/, 'honoraires'],
  [/frais bancaire|cotisation carte|agios|commission|tenue de compte/, 'banque'],
  [/taxe|impot|precompte|contribution|redevance|ordures/, 'taxes'],
  [/provision|appel de fonds|charge trimestre|charges? copro/, 'provisions'],
];

export function devineCategorie(db, libelle, montant) {
  const texte = normalise(libelle);
  for (const [regex, code] of MOTS_CLES) {
    if (regex.test(texte)) {
      const c = db.categories.find((x) => x.id === code || x.code === code);
      if (c && (montant == null || (c.type === 'recette') === montant > 0)) return c.id;
    }
  }
  if (montant > 0) {
    const rec = db.categories.find((c) => c.type === 'recette');
    return rec ? rec.id : null;
  }
  const div = db.categories.find((c) => c.id === 'divers');
  return div ? div.id : null;
}

/**
 * Cherche à quel copropriétaire rattacher une recette : on compare le libellé
 * bancaire au nom des lots (un virement porte presque toujours le nom du payeur).
 */
export function devineLot(db, libelle) {
  const texte = normalise(libelle);
  if (!texte) return null;
  let meilleur = null;
  lotsActifs(db).forEach((l) => {
    const mots = normalise(l.nom).split(' ').filter((m) => m.length >= 3);
    const trouves = mots.filter((m) => texte.includes(m)).length;
    if (trouves && (!meilleur || trouves > meilleur.score)) meilleur = { lot: l, score: trouves };
  });
  return meilleur ? meilleur.lot : null;
}

/** Une opération déjà présente ? (même date, même montant, libellé proche) */
export function doublonProbable(db, operation) {
  const cible = normalise(operation.libelle).slice(0, 18);
  return db.operations.find(
    (o) =>
      o.date === operation.date &&
      Math.abs(o.montant - operation.montant) < 0.005 &&
      normalise(o.libelle).slice(0, 18) === cible,
  ) || null;
}

export function nouvelleOperation(partiel = {}) {
  return {
    id: uid('op'),
    date: '',
    libelle: '',
    montant: 0,
    categorieId: null,
    lotId: null,
    appelId: null,
    factureId: null,
    pointee: false,
    source: 'manuel',
    note: '',
    ...partiel,
  };
}
