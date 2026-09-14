// Jeu d'essai : une copropriété fictive de six lots, deux exercices remplis.
// Sert à découvrir l'application (et à vérifier les graphiques) sans risquer
// les vraies données.

import { arrondi, baseVierge, repartir } from './model.js';
import { uid } from './format.js';
import { maj } from './store.js';

const PROPRIETAIRES = [
  { nom: 'Marie Dupont', numeroLot: 'A1', tantiemes: 210, telephone: '06 12 34 56 78' },
  { nom: 'Jean Moreau', numeroLot: 'A2', tantiemes: 185, telephone: '06 23 45 67 89' },
  { nom: 'Sophie Bernard', numeroLot: 'B1', tantiemes: 165, telephone: '06 34 56 78 90' },
  { nom: 'Ahmed Benali', numeroLot: 'B2', tantiemes: 160, telephone: '06 45 67 89 01' },
  { nom: 'Claire Lefèvre', numeroLot: 'C1', tantiemes: 145, telephone: '06 56 78 90 12' },
  { nom: 'Paul Girard', numeroLot: 'C2', tantiemes: 135, telephone: '06 67 89 01 23' },
];

const BUDGET = [
  ['assurance', 1450],
  ['eau', 2100],
  ['electricite', 1250],
  ['chauffage', 3400],
  ['menage', 2880],
  ['jardin', 960],
  ['travaux', 2500],
  ['honoraires', 600],
  ['banque', 180],
  ['taxes', 520],
];

const DEPENSES_RECURRENTES = [
  { categorie: 'assurance', libelle: 'AXA Assurances — police immeuble', mois: [3], montant: 1432.8 },
  { categorie: 'eau', libelle: 'Veolia Eau — facture trimestrielle', mois: [2, 5, 8, 11], montant: 528.4 },
  { categorie: 'electricite', libelle: 'EDF — parties communes', mois: [1, 3, 5, 7, 9, 11], montant: 208.15 },
  { categorie: 'chauffage', libelle: 'Chauffage collectif — livraison', mois: [1, 10], montant: 1680.0 },
  { categorie: 'menage', libelle: 'Net Services — entretien parties communes', mois: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], montant: 240.0 },
  { categorie: 'jardin', libelle: 'Vert & Cie — entretien espaces verts', mois: [3, 6, 9], montant: 320.0 },
  { categorie: 'banque', libelle: 'Frais de tenue de compte', mois: [2, 5, 8, 11], montant: 15.0 },
  { categorie: 'taxes', libelle: 'Taxe ordures ménagères', mois: [9], montant: 512.0 },
  { categorie: 'honoraires', libelle: 'Frais de gestion et fournitures', mois: [5], montant: 580.0 },
];

const TRAVAUX = [
  { categorie: 'travaux', libelle: 'Plomberie Martin — fuite colonne B', mois: 2, montant: 486.0 },
  { categorie: 'travaux', libelle: 'Serrurerie Dubois — remplacement interphone', mois: 5, montant: 1240.0 },
  { categorie: 'travaux', libelle: 'Peinture cage d’escalier — acompte', mois: 8, montant: 900.0 },
];

function jour(annee, mois, j) {
  const p = (n) => String(n).padStart(2, '0');
  return `${annee}-${p(mois + 1)}-${p(j)}`;
}

function operationsExercice(base, annee, moisMax) {
  const operations = [];
  DEPENSES_RECURRENTES.forEach((d) => {
    d.mois.forEach((m) => {
      if (m > moisMax) return;
      const variation = 1 + ((m * 7) % 11) / 100 - 0.05;
      operations.push({
        id: uid('op'),
        date: jour(annee, m, 5 + (m % 12)),
        libelle: d.libelle,
        montant: -arrondi(d.montant * variation),
        categorieId: d.categorie,
        lotId: null,
        appelId: null,
        factureId: null,
        pointee: true,
        source: 'manuel',
        note: '',
      });
    });
  });
  TRAVAUX.forEach((t) => {
    if (t.mois > moisMax) return;
    operations.push({
      id: uid('op'),
      date: jour(annee, t.mois, 18),
      libelle: t.libelle,
      montant: -t.montant,
      categorieId: t.categorie,
      lotId: null,
      appelId: null,
      factureId: null,
      pointee: true,
      source: 'manuel',
      note: '',
    });
  });
  return operations;
}

/** Crée les appels trimestriels et les encaissements correspondants. */
function appelsExercice(base, annee, moisMax, tauxReglement) {
  const appels = [];
  const operations = [];
  const budgetTotal = BUDGET.reduce((s, [, m]) => s + m, 0);
  const parTrimestre = arrondi(budgetTotal / 4);

  [0, 3, 6, 9].forEach((moisAppel, index) => {
    if (moisAppel > moisMax) return;
    const parts = repartir(base, parTrimestre, 'tantiemes');
    const appel = {
      id: uid('app'),
      annee,
      numero: index + 1,
      libelle: `Provisions T${index + 1} ${annee}`,
      dateEmission: jour(annee, moisAppel, 2),
      dateEcheance: jour(annee, moisAppel, 28),
      repartition: 'tantiemes',
      lignes: [],
    };
    parts.forEach((p, rang) => {
      // Sur le dernier appel, tout le monde n'a pas encore payé : c'est plus réaliste.
      const paye = rang / parts.length < tauxReglement(index);
      let operationId = null;
      if (paye) {
        const proprietaire = base.lots.find((l) => l.id === p.lotId);
        const operation = {
          id: uid('op'),
          date: jour(annee, moisAppel, 12 + (rang % 10)),
          libelle: `Virement provision — ${proprietaire.nom}`,
          montant: p.montant,
          categorieId: 'provisions',
          lotId: p.lotId,
          appelId: appel.id,
          factureId: null,
          pointee: true,
          source: 'manuel',
          note: '',
        };
        operations.push(operation);
        operationId = operation.id;
      }
      appel.lignes.push({
        lotId: p.lotId,
        montant: p.montant,
        paye,
        dateReglement: paye ? jour(annee, moisAppel, 12 + (rang % 10)) : null,
        operationId,
      });
    });
    appels.push(appel);
  });
  return { appels, operations };
}

export function chargeJeuDemo() {
  const anneeCourante = new Date().getFullYear();
  const moisCourant = new Date().getMonth();
  const precedente = anneeCourante - 1;

  const base = baseVierge(anneeCourante);
  base.parametres.syndic = "Syndic L'Ancienne École";
  base.parametres.adresse = "12, rue de l'Ancienne École\n69000 Lyon";
  base.parametres.gestionnaire = 'Le gestionnaire';
  base.parametres.iban = 'FR76 3000 1007 9412 3456 7890 185';

  base.lots = PROPRIETAIRES.map((p) => ({
    id: uid('lot'),
    nom: p.nom,
    numeroLot: p.numeroLot,
    tantiemes: p.tantiemes,
    telephone: p.telephone,
    email: '',
    actif: true,
    note: '',
  }));

  base.exercices = [
    { annee: precedente, soldeOuverture: 4120.55, cloture: true, note: '' },
    { annee: anneeCourante, soldeOuverture: 0, cloture: false, note: '' },
  ];

  [precedente, anneeCourante].forEach((annee) => {
    BUDGET.forEach(([categorieId, montant]) => {
      base.budget.push({
        id: uid('bud'),
        annee,
        categorieId,
        montant: annee === anneeCourante ? Math.ceil((montant * 1.02) / 10) * 10 : montant,
        commentaire: '',
      });
    });
    // Les provisions appelées équilibrent le budget de charges.
    const charges = base.budget
      .filter((b) => b.annee === annee)
      .reduce((s, b) => s + b.montant, 0);
    base.budget.push({ id: uid('bud'), annee, categorieId: 'provisions', montant: charges, commentaire: 'Équilibre du budget' });
  });

  const moisMaxPrecedent = 11;
  const moisMaxCourant = moisCourant;

  base.operations.push(...operationsExercice(base, precedente, moisMaxPrecedent));
  const precedents = appelsExercice(base, precedente, moisMaxPrecedent, () => 1);
  base.appels.push(...precedents.appels);
  base.operations.push(...precedents.operations);

  base.operations.push(...operationsExercice(base, anneeCourante, moisMaxCourant));
  const courants = appelsExercice(base, anneeCourante, moisMaxCourant, (index) => (index >= 2 ? 0.7 : 1));
  base.appels.push(...courants.appels);
  base.operations.push(...courants.operations);

  // Clôture de l'exercice précédent reprise en ouverture de l'exercice courant.
  const soldePrecedent =
    4120.55 +
    base.operations
      .filter((o) => o.date.startsWith(String(precedente)))
      .reduce((s, o) => s + o.montant, 0);
  base.exercices[1].soldeOuverture = arrondi(soldePrecedent);

  base.factures = [
    {
      id: uid('fac'),
      date: jour(anneeCourante, Math.max(0, moisCourant - 1), 22),
      echeance: jour(anneeCourante, moisCourant, 20),
      fournisseur: 'Ravalement Sud — devis façade',
      montant: 3200,
      categorieId: 'travaux',
      reference: 'DEV-2291',
      statut: 'a_payer',
      operationId: null,
      note: 'Soumis au vote de la prochaine assemblée',
    },
    {
      id: uid('fac'),
      date: jour(anneeCourante, moisCourant, 3),
      echeance: jour(anneeCourante, moisCourant, 30),
      fournisseur: 'Veolia Eau',
      montant: 531.2,
      categorieId: 'eau',
      reference: 'F-88213',
      statut: 'a_payer',
      operationId: null,
      note: '',
    },
  ];

  maj((d) => {
    Object.keys(base).forEach((cle) => {
      d[cle] = base[cle];
    });
  });
  return base;
}
