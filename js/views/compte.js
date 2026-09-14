// Le compte du syndic : le relevé des opérations et le suivi des factures.

import { aujourdhui, dateFr, echappe, euros, montantDepuisTexte, MOIS, normalise, uid } from '../format.js';
import {
  arrondi,
  categorie,
  devineCategorie,
  facturesEnAttente,
  lot,
  lotsActifs,
  nomCategorie,
  nouvelleOperation,
  operationsExercice,
  totaux,
} from '../model.js';
import { maj } from '../store.js';
import { confirme, delegue, formulaire, renouvelle, toast } from '../ui.js';

let filtre = { texte: '', categorieId: '', sens: '', nonPointees: false };

// ---------------------------------------------------------------------------
// Formulaire d'opération (partagé avec le tableau de bord)
// ---------------------------------------------------------------------------

export async function editeOperation(db, operationExistante = null, valeursInitiales = {}) {
  const estNouvelle = !operationExistante;
  const op = operationExistante || nouvelleOperation({ date: aujourdhui(), ...valeursInitiales });
  const sens = op.montant > 0 ? 'recette' : 'depense';

  const donnees = await formulaire({
    titre: estNouvelle ? 'Nouvelle opération' : 'Modifier l’opération',
    valider: estNouvelle ? 'Ajouter' : 'Enregistrer',
    supprimer: estNouvelle ? null : { message: `Supprimer « ${op.libelle} » ?` },
    champs: [
      { cle: 'date', label: 'Date', type: 'date', valeur: op.date || aujourdhui(), requis: true },
      { cle: 'libelle', label: 'Libellé', type: 'text', valeur: op.libelle, requis: true, placeholder: 'Ex. Assurance immeuble — AXA' },
      {
        cle: 'sens',
        label: 'Sens',
        type: 'select',
        valeur: sens,
        options: [
          { valeur: 'depense', label: 'Dépense (débit)' },
          { valeur: 'recette', label: 'Encaissement (crédit)' },
        ],
      },
      { cle: 'montant', label: 'Montant', type: 'montant', valeur: op.montant ? String(Math.abs(op.montant)).replace('.', ',') : '', requis: true },
      {
        cle: 'categorieId',
        label: 'Catégorie',
        type: 'select',
        valeur: op.categorieId || '',
        options: [{ valeur: '', label: '— à classer —' }, ...db.categories.map((c) => ({ valeur: c.id, label: `${c.nom} (${c.type === 'recette' ? 'recette' : 'dépense'})` }))],
      },
      {
        cle: 'lotId',
        label: 'Copropriétaire concerné',
        type: 'select',
        valeur: op.lotId || '',
        options: [{ valeur: '', label: '— aucun —' }, ...lotsActifs(db).map((l) => ({ valeur: l.id, label: l.nom }))],
        aide: 'À renseigner pour un versement de provision.',
      },
      { cle: 'pointee', label: 'Pointée sur l’extrait bancaire', type: 'checkbox', valeur: op.pointee },
      { cle: 'note', label: 'Note', type: 'textarea', lignes: 2, valeur: op.note || '' },
    ],
  });

  if (!donnees) return null;

  if (donnees.__supprimer) {
    maj((d) => {
      d.operations = d.operations.filter((x) => x.id !== op.id);
      d.factures.forEach((f) => {
        if (f.operationId === op.id) {
          f.operationId = null;
          f.statut = 'a_payer';
        }
      });
      d.appels.forEach((a) =>
        (a.lignes || []).forEach((l) => {
          if (l.operationId === op.id) {
            l.operationId = null;
            l.paye = false;
            l.dateReglement = null;
          }
        }),
      );
    });
    toast('Opération supprimée');
    return 'supprimee';
  }

  const brut = Math.abs(montantDepuisTexte(donnees.montant));
  const montant = arrondi(donnees.sens === 'recette' ? brut : -brut);
  const enregistree = {
    ...op,
    date: donnees.date,
    libelle: donnees.libelle.trim(),
    montant,
    categorieId: donnees.categorieId || devineCategorie(db, donnees.libelle, montant),
    lotId: donnees.lotId || null,
    pointee: !!donnees.pointee,
    note: donnees.note.trim(),
  };

  maj((d) => {
    const index = d.operations.findIndex((x) => x.id === op.id);
    if (index >= 0) d.operations[index] = enregistree;
    else d.operations.push(enregistree);
  });
  toast(estNouvelle ? 'Opération ajoutée' : 'Opération modifiée');
  return enregistree;
}

// ---------------------------------------------------------------------------
// Vue « Opérations »
// ---------------------------------------------------------------------------

function ligneOperation(db, o) {
  const c = categorie(db, o.categorieId);
  const proprietaire = o.lotId ? lot(db, o.lotId) : null;
  return `<li class="liste__ligne" data-operation="${o.id}">
    <span class="pastille" style="background:${c ? c.couleur : '#b9bec5'}" aria-hidden="true"></span>
    <div class="liste__principal">
      <span class="liste__titre">${echappe(o.libelle)}</span>
      <span class="liste__sous">${echappe(dateFr(o.date))} · ${echappe(nomCategorie(db, o.categorieId))}${proprietaire ? ` · ${echappe(proprietaire.nom)}` : ''}${o.source === 'scan' ? ' · scan' : ''}</span>
    </div>
    <div class="liste__secondaire">
      <span class="liste__montant ${o.montant < 0 ? 'negatif' : 'positif'}">${echappe(euros(o.montant, { signe: true }))}</span>
      <button class="pointage ${o.pointee ? 'pointage--ok' : ''}" data-pointer="${o.id}" aria-label="Pointer">${o.pointee ? '✓' : '○'}</button>
    </div>
  </li>`;
}

function correspond(db, o) {
  if (filtre.sens === 'depense' && o.montant >= 0) return false;
  if (filtre.sens === 'recette' && o.montant <= 0) return false;
  if (filtre.categorieId && o.categorieId !== filtre.categorieId) return false;
  if (filtre.nonPointees && o.pointee) return false;
  if (filtre.texte) {
    const cible = normalise(`${o.libelle} ${nomCategorie(db, o.categorieId)} ${o.note || ''}`);
    if (!cible.includes(normalise(filtre.texte))) return false;
  }
  return true;
}

function renduOperations(conteneur, ctx) {
  const { db, annee, naviguer } = ctx;
  const toutes = operationsExercice(db, annee);
  const visibles = toutes.filter((o) => correspond(db, o)).reverse();
  const t = totaux(db, annee);

  const parMois = new Map();
  visibles.forEach((o) => {
    const m = Number(o.date.slice(5, 7)) || 1;
    if (!parMois.has(m)) parMois.set(m, []);
    parMois.get(m).push(o);
  });

  const sommeVisible = visibles.reduce((s, o) => s + o.montant, 0);

  conteneur.innerHTML = `
    <div class="barre-filtres">
      <input type="search" class="recherche" placeholder="Rechercher un libellé…" value="${echappe(filtre.texte)}" data-filtre="texte">
      <div class="puces">
        <button class="puce ${!filtre.sens ? 'puce--active' : ''}" data-sens="">Tout</button>
        <button class="puce ${filtre.sens === 'depense' ? 'puce--active' : ''}" data-sens="depense">Dépenses</button>
        <button class="puce ${filtre.sens === 'recette' ? 'puce--active' : ''}" data-sens="recette">Recettes</button>
        <button class="puce ${filtre.nonPointees ? 'puce--active' : ''}" data-basculer-pointage>À pointer</button>
      </div>
      <select class="select-filtre" data-filtre="categorieId">
        <option value="">Toutes les catégories</option>
        ${db.categories.map((c) => `<option value="${c.id}" ${filtre.categorieId === c.id ? 'selected' : ''}>${echappe(c.nom)}</option>`).join('')}
      </select>
    </div>

    <div class="bandeau-totaux">
      <div><span>Solde</span><strong class="${t.solde < 0 ? 'negatif' : ''}">${echappe(euros(t.solde))}</strong></div>
      <div><span>${visibles.length} ligne${visibles.length > 1 ? 's' : ''} affichée${visibles.length > 1 ? 's' : ''}</span><strong class="${sommeVisible < 0 ? 'negatif' : 'positif'}">${echappe(euros(sommeVisible, { signe: true }))}</strong></div>
    </div>

    ${
      visibles.length
        ? [...parMois.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([m, ops]) => {
              const sousTotal = ops.reduce((s, o) => s + o.montant, 0);
              return `<section class="carte carte--liste">
                <h2 class="carte__titre carte__titre--mois">${MOIS[m - 1]} ${annee}<span class="${sousTotal < 0 ? 'negatif' : 'positif'}">${echappe(euros(sousTotal, { signe: true }))}</span></h2>
                <ul class="liste">${ops.map((o) => ligneOperation(db, o)).join('')}</ul>
              </section>`;
            })
            .join('')
        : `<section class="carte"><p class="note">${toutes.length ? 'Aucune opération ne correspond au filtre.' : `Aucune opération sur l'exercice ${annee}.`}</p>
           <div class="boutons-ligne">
             <button class="bouton bouton--primaire" data-route="#/scan">Scanner un relevé</button>
             <button class="bouton" data-nouvelle>Saisir à la main</button>
           </div></section>`
    }

    <button class="bouton-flottant" data-nouvelle aria-label="Ajouter une opération">+</button>
  `;

  const champRecherche = conteneur.querySelector('[data-filtre="texte"]');
  champRecherche.addEventListener('input', (e) => {
    filtre.texte = e.target.value;
    const position = e.target.selectionStart;
    renduOperations(renouvelle(conteneur), ctx);
    const suivant = conteneur.querySelector('[data-filtre="texte"]');
    suivant.focus();
    suivant.setSelectionRange(position, position);
  });

  conteneur.querySelector('[data-filtre="categorieId"]').addEventListener('change', (e) => {
    filtre.categorieId = e.target.value;
    renduOperations(renouvelle(conteneur), ctx);
  });

  delegue(conteneur, 'click', '[data-sens]', (e, cible) => {
    filtre.sens = cible.dataset.sens;
    renduOperations(renouvelle(conteneur), ctx);
  });
  delegue(conteneur, 'click', '[data-basculer-pointage]', () => {
    filtre.nonPointees = !filtre.nonPointees;
    renduOperations(renouvelle(conteneur), ctx);
  });
  delegue(conteneur, 'click', '[data-pointer]', (e, cible) => {
    e.stopPropagation();
    const id = cible.dataset.pointer;
    maj((d) => {
      const o = d.operations.find((x) => x.id === id);
      if (o) o.pointee = !o.pointee;
    });
  });
  delegue(conteneur, 'click', '[data-operation]', async (e, cible) => {
    if (e.target.closest('[data-pointer]')) return;
    const op = db.operations.find((x) => x.id === cible.dataset.operation);
    if (op) await editeOperation(db, op);
  });
  delegue(conteneur, 'click', '[data-nouvelle]', () => editeOperation(db));
  delegue(conteneur, 'click', '[data-route]', (e, cible) => naviguer(cible.dataset.route));
}

// ---------------------------------------------------------------------------
// Vue « Factures »
// ---------------------------------------------------------------------------

async function editeFacture(db, factureExistante = null) {
  const estNouvelle = !factureExistante;
  const f = factureExistante || {
    id: uid('fac'),
    date: aujourdhui(),
    echeance: '',
    fournisseur: '',
    montant: 0,
    categorieId: '',
    reference: '',
    statut: 'a_payer',
    operationId: null,
    note: '',
  };

  const donnees = await formulaire({
    titre: estNouvelle ? 'Nouvelle facture' : 'Modifier la facture',
    valider: estNouvelle ? 'Ajouter' : 'Enregistrer',
    supprimer: estNouvelle ? null : { message: `Supprimer la facture ${f.fournisseur} ?` },
    champs: [
      { cle: 'fournisseur', label: 'Fournisseur', type: 'text', valeur: f.fournisseur, requis: true },
      { cle: 'date', label: 'Date de la facture', type: 'date', valeur: f.date, requis: true },
      { cle: 'echeance', label: 'Échéance de paiement', type: 'date', valeur: f.echeance || '' },
      { cle: 'montant', label: 'Montant TTC', type: 'montant', valeur: f.montant ? String(Math.abs(f.montant)).replace('.', ',') : '', requis: true },
      {
        cle: 'categorieId',
        label: 'Catégorie',
        type: 'select',
        valeur: f.categorieId || '',
        options: [{ valeur: '', label: '— à classer —' }, ...db.categories.filter((c) => c.type === 'depense').map((c) => ({ valeur: c.id, label: c.nom }))],
      },
      { cle: 'reference', label: 'Référence / n° de facture', type: 'text', valeur: f.reference || '' },
      { cle: 'note', label: 'Note', type: 'textarea', lignes: 2, valeur: f.note || '' },
    ],
  });

  if (!donnees) return;

  if (donnees.__supprimer) {
    maj((d) => {
      d.factures = d.factures.filter((x) => x.id !== f.id);
    });
    toast('Facture supprimée');
    return;
  }

  const enregistree = {
    ...f,
    fournisseur: donnees.fournisseur.trim(),
    date: donnees.date,
    echeance: donnees.echeance || '',
    montant: Math.abs(montantDepuisTexte(donnees.montant)),
    categorieId: donnees.categorieId || devineCategorie(db, donnees.fournisseur, -1),
    reference: donnees.reference.trim(),
    note: donnees.note.trim(),
  };

  maj((d) => {
    const index = d.factures.findIndex((x) => x.id === f.id);
    if (index >= 0) d.factures[index] = enregistree;
    else d.factures.push(enregistree);
  });
  toast(estNouvelle ? 'Facture ajoutée' : 'Facture modifiée');
}

/** Marquer payée : crée l'opération correspondante au débit et relie les deux. */
async function payeFacture(db, facture) {
  const ok = await confirme(
    `Enregistrer le paiement de ${euros(facture.montant)} à ${facture.fournisseur} ? Une opération au débit sera créée.`,
    { titre: 'Marquer comme payée', valider: 'Enregistrer le paiement', danger: false },
  );
  if (!ok) return;
  const operation = nouvelleOperation({
    date: aujourdhui(),
    libelle: `${facture.fournisseur}${facture.reference ? ` — ${facture.reference}` : ''}`,
    montant: -Math.abs(facture.montant),
    categorieId: facture.categorieId,
    factureId: facture.id,
    note: 'Règlement de facture',
  });
  maj((d) => {
    d.operations.push(operation);
    const f = d.factures.find((x) => x.id === facture.id);
    if (f) {
      f.statut = 'payee';
      f.operationId = operation.id;
    }
  });
  toast('Paiement enregistré');
}

function renduFactures(conteneur, ctx) {
  const { db } = ctx;
  const enAttente = facturesEnAttente(db);
  const payees = db.factures.filter((f) => f.statut === 'payee').sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalAttente = enAttente.reduce((s, f) => s + Math.abs(Number(f.montant) || 0), 0);

  const carteFacture = (f, payee) => `<li class="liste__ligne" data-facture="${f.id}">
      <span class="pastille" style="background:${categorie(db, f.categorieId)?.couleur || '#b9bec5'}" aria-hidden="true"></span>
      <div class="liste__principal">
        <span class="liste__titre">${echappe(f.fournisseur)}</span>
        <span class="liste__sous">${echappe(dateFr(f.date))}${f.echeance ? ` · échéance ${echappe(dateFr(f.echeance))}` : ''} · ${echappe(nomCategorie(db, f.categorieId))}</span>
      </div>
      <div class="liste__secondaire">
        <span class="liste__montant">${echappe(euros(f.montant))}</span>
        ${payee ? '<span class="badge badge--ok">Payée</span>' : `<button class="bouton bouton--mini" data-payer="${f.id}">Payer</button>`}
      </div>
    </li>`;

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">À payer<span>${echappe(euros(totalAttente))}</span></h2>
      ${enAttente.length ? `<ul class="liste">${enAttente.map((f) => carteFacture(f, false)).join('')}</ul>` : '<p class="note">Aucune facture en attente. 👌</p>'}
    </section>

    ${
      payees.length
        ? `<section class="carte carte--liste">
            <h2 class="carte__titre">Réglées</h2>
            <ul class="liste">${payees.slice(0, 30).map((f) => carteFacture(f, true)).join('')}</ul>
          </section>`
        : ''
    }

    <button class="bouton-flottant" data-nouvelle-facture aria-label="Ajouter une facture">+</button>
  `;

  delegue(conteneur, 'click', '[data-payer]', async (e, cible) => {
    e.stopPropagation();
    const f = db.factures.find((x) => x.id === cible.dataset.payer);
    if (f) await payeFacture(db, f);
  });
  delegue(conteneur, 'click', '[data-facture]', async (e, cible) => {
    if (e.target.closest('[data-payer]')) return;
    const f = db.factures.find((x) => x.id === cible.dataset.facture);
    if (f) await editeFacture(db, f);
  });
  delegue(conteneur, 'click', '[data-nouvelle-facture]', () => editeFacture(db));
}

// ---------------------------------------------------------------------------

export function rendu(conteneur, ctx) {
  if (ctx.sousVue === 'factures') renduFactures(conteneur, ctx);
  else renduOperations(renouvelle(conteneur), ctx);
}

export const segments = [
  { cle: '', label: 'Opérations', route: '#/compte' },
  { cle: 'factures', label: 'Factures', route: '#/compte/factures' },
];
