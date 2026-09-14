// Tableau de bord : l'état de la trésorerie en un coup d'oeil, au pouce.

import { anneau, evolutionSolde, jauge } from '../charts.js';
import { aujourdhui, dateFr, echappe, euros, moisDe } from '../format.js';
import {
  appelsAnnee,
  facturesEnAttente,
  nomCategorie,
  operationsExercice,
  repartitionDepenses,
  situationLots,
  soldeMensuel,
  totalBudget,
  totaux,
} from '../model.js';
import { joursDepuisSauvegarde } from '../store.js';
import { delegue } from '../ui.js';

export function rendu(conteneur, ctx) {
  const { db, annee, naviguer } = ctx;
  const t = totaux(db, annee);
  const budget = totalBudget(db, annee, 'depense');
  const anneeCourante = new Date().getFullYear() === annee;
  const moisRenseignes = anneeCourante ? moisDe(aujourdhui()) : 12;

  const impayes = situationLots(db, annee).filter((s) => s.solde > 0.005);
  const totalImpaye = impayes.reduce((s, x) => s + x.solde, 0);
  const attente = facturesEnAttente(db);
  const totalAttente = attente.reduce((s, f) => s + Math.abs(Number(f.montant) || 0), 0);
  const jours = joursDepuisSauvegarde();

  const alertes = [];
  if (attente.length) {
    alertes.push({
      route: '#/compte/factures',
      icone: '🧾',
      titre: `${attente.length} facture${attente.length > 1 ? 's' : ''} à payer`,
      detail: euros(totalAttente),
      style: 'attention',
    });
  }
  if (impayes.length) {
    alertes.push({
      route: '#/copro/appels',
      icone: '⏳',
      titre: `${impayes.length} provision${impayes.length > 1 ? 's' : ''} non réglée${impayes.length > 1 ? 's' : ''}`,
      detail: euros(totalImpaye),
      style: 'attention',
    });
  }
  if (t.solde < 0) {
    alertes.push({ route: '#/compte', icone: '⚠️', titre: 'Solde du compte négatif', detail: euros(t.solde), style: 'danger' });
  }
  if (jours === null || jours > 21) {
    alertes.push({
      route: '#/reglages',
      icone: '💾',
      titre: jours === null ? 'Aucune sauvegarde exportée' : `Dernière sauvegarde il y a ${jours} jours`,
      detail: 'Exporter',
      style: 'info',
    });
  }

  const dernieres = operationsExercice(db, annee).slice(-6).reverse();
  const appels = appelsAnnee(db, annee);

  conteneur.innerHTML = `
    <section class="carte carte--solde">
      <p class="carte--solde__legende">Solde du compte · exercice ${annee}</p>
      <p class="carte--solde__valeur ${t.solde < 0 ? 'negatif' : ''}">${echappe(euros(t.solde))}</p>
      <p class="carte--solde__detail">Ouverture ${echappe(euros(t.ouverture))} · ${t.nbOperations} opération${t.nbOperations > 1 ? 's' : ''} enregistrée${t.nbOperations > 1 ? 's' : ''}</p>
      <div class="trio">
        <div><span class="trio__label">Encaissé</span><span class="trio__valeur positif">${echappe(euros(t.recettes))}</span></div>
        <div><span class="trio__label">Dépensé</span><span class="trio__valeur negatif">${echappe(euros(t.depenses))}</span></div>
        <div><span class="trio__label">Résultat</span><span class="trio__valeur ${t.resultat < 0 ? 'negatif' : 'positif'}">${echappe(euros(t.resultat, { signe: true }))}</span></div>
      </div>
    </section>

    <div class="actions-rapides">
      <button class="action-rapide action-rapide--phare" data-route="#/scan"><span>📷</span>Scanner un relevé</button>
      <button class="action-rapide" data-action="nouvelle-operation"><span>✏️</span>Saisir</button>
      <button class="action-rapide" data-route="#/copro/appels"><span>📨</span>Appeler</button>
    </div>

    ${
      alertes.length
        ? `<section class="alertes">${alertes
            .map(
              (a) => `<button class="alerte alerte--${a.style}" data-route="${a.route}">
                <span class="alerte__icone">${a.icone}</span>
                <span class="alerte__texte">${echappe(a.titre)}</span>
                <span class="alerte__detail">${echappe(a.detail)}</span>
              </button>`,
            )
            .join('')}</section>`
        : ''
    }

    <section class="carte">
      <h2 class="carte__titre">Budget ${annee}</h2>
      ${jauge(t.depenses, budget)}
      ${
        budget
          ? `<p class="note">${echappe(euros(Math.max(0, budget - t.depenses)))} encore disponibles sur le budget voté.</p>`
          : `<p class="note">Aucun budget saisi pour ${annee}. <button class="lien" data-route="#/budget">Le définir</button></p>`
      }
    </section>

    <section class="carte">
      <h2 class="carte__titre">Répartition des dépenses</h2>
      ${anneau(repartitionDepenses(db, annee), { titre: `Dépenses ${annee}` })}
    </section>

    <section class="carte">
      <h2 class="carte__titre">Évolution du solde</h2>
      ${evolutionSolde(soldeMensuel(db, annee), { ouverture: t.ouverture, moisRenseignes })}
    </section>

    ${
      appels.length
        ? `<section class="carte">
            <h2 class="carte__titre">Appels de provisions ${annee}</h2>
            <ul class="liste liste--compacte">
              ${appels
                .map((a) => {
                  const total = (a.lignes || []).reduce((s, l) => s + (Number(l.montant) || 0), 0);
                  const paye = (a.lignes || []).filter((l) => l.paye).reduce((s, l) => s + (Number(l.montant) || 0), 0);
                  const nb = (a.lignes || []).length;
                  const nbPayes = (a.lignes || []).filter((l) => l.paye).length;
                  return `<li class="liste__ligne" data-route="#/copro/appels">
                    <div class="liste__principal">
                      <span class="liste__titre">${echappe(a.libelle || `Appel n°${a.numero}`)}</span>
                      <span class="liste__sous">${nbPayes}/${nb} réglé${nbPayes > 1 ? 's' : ''} · échéance ${echappe(dateFr(a.dateEcheance))}</span>
                    </div>
                    <div class="liste__secondaire">
                      <span class="liste__montant">${echappe(euros(paye))}</span>
                      <span class="liste__sous">sur ${echappe(euros(total))}</span>
                    </div>
                  </li>`;
                })
                .join('')}
            </ul>
          </section>`
        : ''
    }

    <section class="carte">
      <h2 class="carte__titre">Dernières opérations</h2>
      ${
        dernieres.length
          ? `<ul class="liste">${dernieres
              .map(
                (o) => `<li class="liste__ligne" data-route="#/compte">
                  <div class="liste__principal">
                    <span class="liste__titre">${echappe(o.libelle)}</span>
                    <span class="liste__sous">${echappe(dateFr(o.date))} · ${echappe(nomCategorie(db, o.categorieId))}</span>
                  </div>
                  <span class="liste__montant ${o.montant < 0 ? 'negatif' : 'positif'}">${echappe(euros(o.montant, { signe: true }))}</span>
                </li>`,
              )
              .join('')}</ul>`
          : `<p class="note">Rien pour l'instant. Commencez par <button class="lien" data-route="#/scan">scanner un relevé</button>.</p>`
      }
    </section>
  `;

  delegue(conteneur, 'click', '[data-route]', (e, cible) => naviguer(cible.dataset.route));
  delegue(conteneur, 'click', '[data-action="nouvelle-operation"]', () => ctx.actions.nouvelleOperation());
}
