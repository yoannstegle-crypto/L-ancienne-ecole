// Budget voté en assemblée, confronté en permanence au réalisé.

import { budgetVsRealise } from '../charts.js';
import { echappe, euros, montantDepuisTexte, pourcent, uid } from '../format.js';
import {
  arrondi,
  budgetAnnee,
  comparatifBudget,
  lotsActifs,
  propositionBudget,
  repartir,
  totalBudget,
  totaux,
  totalTantiemes,
} from '../model.js';
import { maj } from '../store.js';
import { confirme, delegue, feuille, formulaire, toast } from '../ui.js';

async function editeLigne(db, annee, categorieId = null) {
  const existante = categorieId ? db.budget.find((b) => b.annee === annee && b.categorieId === categorieId) : null;
  const dejaBudgetees = new Set(budgetAnnee(db, annee).map((b) => b.categorieId));

  const options = db.categories
    .filter((c) => c.id === categorieId || !dejaBudgetees.has(c.id))
    .map((c) => ({ valeur: c.id, label: `${c.nom} (${c.type === 'recette' ? 'recette' : 'dépense'})` }));

  if (!options.length) {
    toast('Toutes les catégories sont déjà budgétées');
    return;
  }

  const donnees = await formulaire({
    titre: existante ? 'Modifier la ligne de budget' : 'Ajouter une ligne de budget',
    supprimer: existante ? { message: 'Retirer cette ligne du budget ?' } : null,
    champs: [
      { cle: 'categorieId', label: 'Poste', type: 'select', valeur: categorieId || options[0].valeur, options },
      {
        cle: 'montant',
        label: `Montant budgété ${annee}`,
        type: 'montant',
        valeur: existante ? String(existante.montant).replace('.', ',') : '',
        requis: true,
      },
      { cle: 'commentaire', label: 'Commentaire', type: 'text', valeur: existante ? existante.commentaire || '' : '' },
    ],
  });
  if (!donnees) return;

  if (donnees.__supprimer && existante) {
    maj((d) => {
      d.budget = d.budget.filter((b) => b.id !== existante.id);
    });
    toast('Ligne retirée');
    return;
  }

  const montant = arrondi(Math.abs(montantDepuisTexte(donnees.montant)));
  maj((d) => {
    const cible = d.budget.find((b) => b.annee === annee && b.categorieId === donnees.categorieId);
    if (cible) {
      cible.montant = montant;
      cible.commentaire = donnees.commentaire.trim();
    } else {
      d.budget.push({
        id: uid('bud'),
        annee,
        categorieId: donnees.categorieId,
        montant,
        commentaire: donnees.commentaire.trim(),
      });
    }
  });
  toast('Budget mis à jour');
}

async function reprendExercicePrecedent(db, annee) {
  const precedent = annee - 1;
  const proposition = propositionBudget(db, precedent, 0.02).filter((l) => l.propose > 0);
  if (!proposition.length) {
    toast(`Aucune dépense enregistrée en ${precedent}`, 'erreur');
    return;
  }
  const total = proposition.reduce((s, l) => s + l.propose, 0);
  const html = `<p class="texte-modale">Budget ${annee} calculé sur le réalisé ${precedent}, indexé de 2 % et arrondi à la dizaine.</p>
    <ul class="liste liste--compacte">
      ${proposition
        .map(
          (l) => `<li class="liste__ligne">
            <div class="liste__principal"><span class="liste__titre">${echappe(l.nom)}</span>
            <span class="liste__sous">réalisé ${echappe(euros(l.realise))}</span></div>
            <span class="liste__montant">${echappe(euros(l.propose))}</span>
          </li>`,
        )
        .join('')}
    </ul>
    <p class="total-modale">Total proposé <strong>${echappe(euros(total))}</strong></p>`;

  const ok = await feuille({
    titre: `Reprendre ${precedent}`,
    contenu: html,
    actions: [
      { label: 'Annuler', style: 'discret', valeur: false },
      { label: 'Appliquer ce budget', style: 'primaire', valeur: true },
    ],
  });
  if (!ok) return;

  maj((d) => {
    d.budget = d.budget.filter((b) => b.annee !== annee);
    proposition.forEach((l) => {
      d.budget.push({ id: uid('bud'), annee, categorieId: l.categorieId, montant: l.propose, commentaire: `Base ${precedent} +2 %` });
    });
  });
  toast(`Budget ${annee} créé`);
}

function apercuQuotesParts(db, total) {
  const lots = lotsActifs(db);
  if (!lots.length || total <= 0) return '';
  const parts = repartir(db, total, 'tantiemes');
  const base = totalTantiemes(db) || lots.length;
  return `<section class="carte">
    <h2 class="carte__titre">Quote-part annuelle par lot</h2>
    <p class="note">Répartition du budget aux tantièmes (${base}/1000 répartis). C'est la base des appels de provisions.</p>
    <div class="zone-tableau"><table class="tableau">
      <thead><tr><th>Copropriétaire</th><th class="droite">Tantièmes</th><th class="droite">Annuel</th><th class="droite">Trimestre</th></tr></thead>
      <tbody>
        ${parts
          .map((p) => {
            const l = lots.find((x) => x.id === p.lotId);
            return `<tr>
              <td>${echappe(l ? l.nom : '')}</td>
              <td class="droite">${echappe(String(l ? l.tantiemes : ''))}</td>
              <td class="droite">${echappe(euros(p.montant))}</td>
              <td class="droite">${echappe(euros(arrondi(p.montant / 4)))}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
      <tfoot><tr><th>Total</th><th class="droite">${base}</th><th class="droite">${echappe(euros(total))}</th><th class="droite">${echappe(euros(arrondi(total / 4)))}</th></tr></tfoot>
    </table></div>
  </section>`;
}

export function rendu(conteneur, ctx) {
  const { db, annee } = ctx;
  const lignes = comparatifBudget(db, annee, 'depense');
  const budget = totalBudget(db, annee, 'depense');
  const t = totaux(db, annee);
  const recettesBudget = totalBudget(db, annee, 'recette');
  const lignesRecettes = comparatifBudget(db, annee, 'recette');

  const tableau = (donnees, titre) =>
    donnees.length
      ? `<section class="carte carte--liste">
          <h2 class="carte__titre">${echappe(titre)}</h2>
          <div class="zone-tableau"><table class="tableau tableau--budget">
            <thead><tr><th>Poste</th><th class="droite">Budget</th><th class="droite">Réalisé</th><th class="droite">Écart</th></tr></thead>
            <tbody>
              ${donnees
                .map(
                  (l) => `<tr data-poste="${echappe(l.categorieId)}">
                    <td><span class="pastille" style="background:${l.couleur}"></span>${echappe(l.nom)}
                      ${l.budget ? `<span class="sous-info">${echappe(pourcent(l.realise, l.budget, 0))} consommé</span>` : '<span class="sous-info">hors budget</span>'}
                    </td>
                    <td class="droite">${echappe(euros(l.budget))}</td>
                    <td class="droite"><strong>${echappe(euros(l.realise))}</strong></td>
                    <td class="droite ${l.ecart < 0 ? 'negatif' : 'positif'}">${echappe(euros(l.ecart, { signe: true }))}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
            <tfoot><tr>
              <th>Total</th>
              <th class="droite">${echappe(euros(donnees.reduce((s, l) => s + l.budget, 0)))}</th>
              <th class="droite">${echappe(euros(donnees.reduce((s, l) => s + l.realise, 0)))}</th>
              <th class="droite ${donnees.reduce((s, l) => s + l.ecart, 0) < 0 ? 'negatif' : 'positif'}">${echappe(euros(donnees.reduce((s, l) => s + l.ecart, 0), { signe: true }))}</th>
            </tr></tfoot>
          </table></div>
          <p class="note">Touchez une ligne pour ajuster le montant budgété.</p>
        </section>`
      : '';

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">Budget ${annee}</h2>
      <div class="trio trio--encadre">
        <div><span class="trio__label">Budgété</span><span class="trio__valeur">${echappe(euros(budget))}</span></div>
        <div><span class="trio__label">Réalisé</span><span class="trio__valeur">${echappe(euros(t.depenses))}</span></div>
        <div><span class="trio__label">Reste</span><span class="trio__valeur ${budget - t.depenses < 0 ? 'negatif' : 'positif'}">${echappe(euros(budget - t.depenses, { signe: true }))}</span></div>
      </div>
      ${budgetVsRealise(lignes)}
    </section>

    ${tableau(lignes, 'Dépenses par poste')}
    ${tableau(lignesRecettes, 'Recettes par poste')}
    ${apercuQuotesParts(db, budget || recettesBudget)}

    <section class="carte">
      <h2 class="carte__titre">Outils</h2>
      <div class="boutons-ligne">
        <button class="bouton" data-reprendre>Reprendre ${annee - 1} + 2 %</button>
        <button class="bouton" data-vider>Vider le budget ${annee}</button>
      </div>
    </section>

    <button class="bouton-flottant" data-ajouter aria-label="Ajouter une ligne de budget">+</button>
  `;

  delegue(conteneur, 'click', '[data-poste]', (e, cible) => editeLigne(db, annee, cible.dataset.poste));
  delegue(conteneur, 'click', '[data-ajouter]', () => editeLigne(db, annee));
  delegue(conteneur, 'click', '[data-reprendre]', () => reprendExercicePrecedent(db, annee));
  delegue(conteneur, 'click', '[data-vider]', async () => {
    const ok = await confirme(`Supprimer toutes les lignes de budget de ${annee} ?`, { valider: 'Vider' });
    if (!ok) return;
    maj((d) => {
      d.budget = d.budget.filter((b) => b.annee !== annee);
    });
    toast('Budget vidé');
  });
}
