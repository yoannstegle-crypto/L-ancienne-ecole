// Les deux documents de fin d'exercice : le bilan des dépenses et le rapport
// d'assemblée générale. Les deux sont directement imprimables (« Partager →
// Imprimer → Enregistrer en PDF » depuis Safari).

import { anneau, budgetVsRealise, evolutionSolde, fluxMensuels } from '../charts.js';
import { aujourdhui, dateLongue, echappe, euros, pourcent, uid } from '../format.js';
import {
  appelsAnnee,
  comparatifBudget,
  propositionBudget,
  repartir,
  situationLots,
  soldeMensuel,
  totalAppel,
  totalBudget,
  totalEncaisseAppel,
  totaux,
} from '../model.js';
import { maj } from '../store.js';
import { confirme, delegue, formulaire, toast } from '../ui.js';

// ---------------------------------------------------------------------------
// Bilan de l'exercice
// ---------------------------------------------------------------------------

function renduBilan(conteneur, ctx) {
  const { db, annee } = ctx;
  const t = totaux(db, annee);
  const depenses = comparatifBudget(db, annee, 'depense');
  const recettes = comparatifBudget(db, annee, 'recette');
  const budget = totalBudget(db, annee, 'depense');
  const mois = soldeMensuel(db, annee);
  const situations = situationLots(db, annee);
  const appels = appelsAnnee(db, annee);
  const proposition = propositionBudget(db, annee, 0.02);
  const totalPropose = proposition.reduce((s, l) => s + l.propose, 0);
  const partsProposees = repartir(db, totalPropose, 'tantiemes');

  const ligneTableau = (l) => `<tr>
      <td><span class="pastille" style="background:${l.couleur}"></span>${echappe(l.nom)}</td>
      <td class="droite">${echappe(euros(l.budget))}</td>
      <td class="droite">${echappe(euros(l.realise))}</td>
      <td class="droite ${l.ecart < 0 ? 'negatif' : 'positif'}">${echappe(euros(l.ecart, { signe: true }))}</td>
      <td class="droite">${l.budget ? echappe(pourcent(l.realise, l.budget, 0)) : '—'}</td>
    </tr>`;

  conteneur.innerHTML = `
    <div class="boutons-ligne sans-impression">
      <button class="bouton bouton--primaire" data-imprimer>🖨 Imprimer / PDF</button>
    </div>

    <article class="document">
      <header class="document__entete">
        <h1>${echappe(db.parametres.syndic || 'Syndic')}</h1>
        ${db.parametres.adresse ? `<p>${echappe(db.parametres.adresse)}</p>` : ''}
        <h2>Bilan financier de l'exercice ${annee}</h2>
        <p class="document__date">Établi le ${echappe(dateLongue(aujourdhui()))}${db.parametres.gestionnaire ? ` par ${echappe(db.parametres.gestionnaire)}` : ''}</p>
      </header>

      <section class="document__section">
        <h3>1. Synthèse de trésorerie</h3>
        <div class="zone-tableau"><table class="tableau tableau--synthese">
          <tbody>
            <tr><td>Solde au 1er janvier ${annee}</td><td class="droite">${echappe(euros(t.ouverture))}</td></tr>
            <tr><td>Total des encaissements</td><td class="droite positif">${echappe(euros(t.recettes, { signe: true }))}</td></tr>
            <tr><td>Total des décaissements</td><td class="droite negatif">${echappe(euros(-t.depenses, { signe: true }))}</td></tr>
            <tr class="ligne-forte"><td>Solde au 31 décembre ${annee}</td><td class="droite">${echappe(euros(t.solde))}</td></tr>
          </tbody>
        </table></div>
        <p class="document__commentaire">
          L'exercice se solde par un résultat de <strong>${echappe(euros(t.resultat, { signe: true }))}</strong>
          sur ${t.nbOperations} opération${t.nbOperations > 1 ? 's' : ''} enregistrée${t.nbOperations > 1 ? 's' : ''}.
          ${budget ? `Les dépenses représentent ${echappe(pourcent(t.depenses, budget, 0))} du budget voté de ${echappe(euros(budget))}.` : ''}
        </p>
      </section>

      <section class="document__section">
        <h3>2. Évolution du solde bancaire</h3>
        ${evolutionSolde(mois, { ouverture: t.ouverture })}
      </section>

      <section class="document__section">
        <h3>3. Encaissements et décaissements par mois</h3>
        ${fluxMensuels(mois)}
      </section>

      <section class="document__section saut-page">
        <h3>4. Dépenses : budgété contre réalisé</h3>
        ${budgetVsRealise(depenses)}
        <div class="zone-tableau"><table class="tableau">
          <thead><tr><th>Poste de dépense</th><th class="droite">Budgété</th><th class="droite">Réalisé</th><th class="droite">Écart</th><th class="droite">%</th></tr></thead>
          <tbody>${depenses.map(ligneTableau).join('') || '<tr><td colspan="5">Aucune dépense.</td></tr>'}</tbody>
          <tfoot><tr>
            <th>Total des dépenses</th>
            <th class="droite">${echappe(euros(depenses.reduce((s, l) => s + l.budget, 0)))}</th>
            <th class="droite">${echappe(euros(depenses.reduce((s, l) => s + l.realise, 0)))}</th>
            <th class="droite">${echappe(euros(depenses.reduce((s, l) => s + l.ecart, 0), { signe: true }))}</th>
            <th class="droite">${budget ? echappe(pourcent(t.depenses, budget, 0)) : '—'}</th>
          </tr></tfoot>
        </table></div>
      </section>

      <section class="document__section">
        <h3>5. Répartition des dépenses</h3>
        <div class="deux-colonnes">
          ${anneau(depenses.filter((l) => l.realise > 0).map((l) => ({ label: l.nom, valeur: l.realise, couleur: l.couleur })), { titre: `Dépenses ${annee}` })}
        </div>
      </section>

      ${
        recettes.length
          ? `<section class="document__section">
              <h3>6. Recettes de l'exercice</h3>
              <div class="zone-tableau"><table class="tableau">
                <thead><tr><th>Poste</th><th class="droite">Budgété</th><th class="droite">Réalisé</th><th class="droite">Écart</th><th class="droite">%</th></tr></thead>
                <tbody>${recettes.map(ligneTableau).join('')}</tbody>
              </table></div>
            </section>`
          : ''
      }

      <section class="document__section saut-page">
        <h3>7. Situation des copropriétaires au 31 décembre ${annee}</h3>
        ${
          situations.length
            ? `<div class="zone-tableau"><table class="tableau">
                <thead><tr><th>Copropriétaire</th><th class="droite">Tantièmes</th><th class="droite">Appelé</th><th class="droite">Réglé</th><th class="droite">Reste dû</th></tr></thead>
                <tbody>
                  ${situations
                    .map(
                      (s) => `<tr>
                        <td>${echappe(s.lot.nom)}${s.lot.numeroLot ? ` <span class="sous-info">lot ${echappe(s.lot.numeroLot)}</span>` : ''}</td>
                        <td class="droite">${s.lot.tantiemes}</td>
                        <td class="droite">${echappe(euros(s.appele))}</td>
                        <td class="droite">${echappe(euros(s.regle))}</td>
                        <td class="droite ${s.solde > 0.005 ? 'negatif' : ''}">${echappe(euros(s.solde))}</td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
                <tfoot><tr>
                  <th>Total</th>
                  <th class="droite">${situations.reduce((s, x) => s + (Number(x.lot.tantiemes) || 0), 0)}</th>
                  <th class="droite">${echappe(euros(situations.reduce((s, x) => s + x.appele, 0)))}</th>
                  <th class="droite">${echappe(euros(situations.reduce((s, x) => s + x.regle, 0)))}</th>
                  <th class="droite">${echappe(euros(situations.reduce((s, x) => s + x.solde, 0)))}</th>
                </tr></tfoot>
              </table></div>`
            : '<p>Aucun copropriétaire enregistré.</p>'
        }
        ${
          appels.length
            ? `<p class="document__commentaire">${appels.length} appel${appels.length > 1 ? 's' : ''} de provisions émis sur l'exercice, pour ${echappe(euros(appels.reduce((s, a) => s + totalAppel(a), 0)))}, dont ${echappe(euros(appels.reduce((s, a) => s + totalEncaisseAppel(a), 0)))} encaissés.</p>`
            : ''
        }
      </section>

      <section class="document__section saut-page">
        <h3>8. Proposition de budget ${annee + 1}</h3>
        <p class="document__commentaire">Établie sur la base du réalisé ${annee}, indexée de 2 % et arrondie à la dizaine d'euros. À soumettre au vote de l'assemblée générale.</p>
        <div class="zone-tableau"><table class="tableau">
          <thead><tr><th>Poste</th><th class="droite">Réalisé ${annee}</th><th class="droite">Proposé ${annee + 1}</th></tr></thead>
          <tbody>
            ${proposition.map((l) => `<tr><td>${echappe(l.nom)}</td><td class="droite">${echappe(euros(l.realise))}</td><td class="droite"><strong>${echappe(euros(l.propose))}</strong></td></tr>`).join('') || '<tr><td colspan="3">Aucune donnée.</td></tr>'}
          </tbody>
          <tfoot><tr><th>Total</th><th class="droite">${echappe(euros(t.depenses))}</th><th class="droite">${echappe(euros(totalPropose))}</th></tr></tfoot>
        </table></div>
        ${
          partsProposees.length
            ? `<h4>Quote-part ${annee + 1} par copropriétaire</h4>
              <div class="zone-tableau"><table class="tableau">
                <thead><tr><th>Copropriétaire</th><th class="droite">Tantièmes</th><th class="droite">Annuel</th><th class="droite">Trimestre</th></tr></thead>
                <tbody>
                  ${partsProposees
                    .map((p) => {
                      const l = db.lots.find((x) => x.id === p.lotId);
                      return `<tr><td>${echappe(l ? l.nom : '')}</td><td class="droite">${l ? l.tantiemes : ''}</td><td class="droite">${echappe(euros(p.montant))}</td><td class="droite">${echappe(euros(Math.round((p.montant / 4) * 100) / 100))}</td></tr>`;
                    })
                    .join('')}
                </tbody>
              </table></div>`
            : ''
        }
      </section>

      <footer class="document__pied">
        <p>${echappe(db.parametres.syndic || '')} — bilan de l'exercice ${annee}. Document établi par le gestionnaire${db.parametres.gestionnaire ? ` ${echappe(db.parametres.gestionnaire)}` : ''}.</p>
      </footer>
    </article>
  `;

  delegue(conteneur, 'click', '[data-imprimer]', () => window.print());
}

// ---------------------------------------------------------------------------
// Rapport d'assemblée générale
// ---------------------------------------------------------------------------

function rapportAG(db, annee) {
  return db.rapports.find((r) => r.annee === annee && r.type === 'ag') || null;
}

function rapportVierge(annee) {
  return {
    id: uid('ag'),
    type: 'ag',
    annee,
    date: `${annee + 1}-03-15`,
    heure: '19:00',
    lieu: '',
    president: '',
    secretaire: '',
    presents: '',
    representes: '',
    absents: '',
    introduction: '',
    ordreDuJour: [
      { id: uid('odj'), titre: "Approbation des comptes de l'exercice écoulé" },
      { id: uid('odj'), titre: "Vote du budget prévisionnel" },
      { id: uid('odj'), titre: 'Travaux envisagés' },
      { id: uid('odj'), titre: 'Questions diverses' },
    ],
    resolutions: [],
    travaux: '',
    conclusion: '',
  };
}

async function editeEntete(db, rapport) {
  const donnees = await formulaire({
    titre: "Informations de l'assemblée",
    champs: [
      { cle: 'date', label: 'Date', type: 'date', valeur: rapport.date, requis: true },
      { cle: 'heure', label: 'Heure', type: 'text', valeur: rapport.heure },
      { cle: 'lieu', label: 'Lieu', type: 'text', valeur: rapport.lieu, placeholder: "Ex. hall de l'immeuble" },
      { cle: 'president', label: 'Président de séance', type: 'text', valeur: rapport.president },
      { cle: 'secretaire', label: 'Secrétaire', type: 'text', valeur: rapport.secretaire },
      { cle: 'presents', label: 'Présents', type: 'textarea', lignes: 3, valeur: rapport.presents },
      { cle: 'representes', label: 'Représentés (pouvoirs)', type: 'textarea', lignes: 2, valeur: rapport.representes },
      { cle: 'absents', label: 'Absents', type: 'textarea', lignes: 2, valeur: rapport.absents },
    ],
  });
  if (!donnees) return;
  enregistre(db, rapport.annee, (r) => Object.assign(r, donnees));
  toast('Assemblée mise à jour');
}

async function editeTexte(db, rapport, cle, label, lignes = 6) {
  const donnees = await formulaire({
    titre: label,
    champs: [{ cle: 'texte', label, type: 'textarea', lignes, valeur: rapport[cle] || '' }],
  });
  if (!donnees) return;
  enregistre(db, rapport.annee, (r) => {
    r[cle] = donnees.texte;
  });
}

async function editeResolution(db, rapport, resolutionId = null) {
  const r = resolutionId ? rapport.resolutions.find((x) => x.id === resolutionId) : null;
  const donnees = await formulaire({
    titre: r ? 'Modifier la résolution' : 'Nouvelle résolution',
    supprimer: r ? { message: 'Supprimer cette résolution ?' } : null,
    champs: [
      { cle: 'titre', label: 'Intitulé', type: 'text', valeur: r ? r.titre : '', requis: true },
      { cle: 'texte', label: 'Texte soumis au vote', type: 'textarea', lignes: 4, valeur: r ? r.texte : '' },
      { cle: 'pour', label: 'Tantièmes POUR', type: 'nombre', valeur: r ? r.pour : 0 },
      { cle: 'contre', label: 'Tantièmes CONTRE', type: 'nombre', valeur: r ? r.contre : 0 },
      { cle: 'abstention', label: 'Abstentions', type: 'nombre', valeur: r ? r.abstention : 0 },
      { cle: 'adoptee', label: 'Résolution adoptée', type: 'checkbox', valeur: r ? r.adoptee : true },
    ],
  });
  if (!donnees) return;

  if (donnees.__supprimer && r) {
    enregistre(db, rapport.annee, (cible) => {
      cible.resolutions = cible.resolutions.filter((x) => x.id !== r.id);
    });
    return;
  }

  const valeurs = {
    titre: donnees.titre.trim(),
    texte: donnees.texte.trim(),
    pour: Number(donnees.pour) || 0,
    contre: Number(donnees.contre) || 0,
    abstention: Number(donnees.abstention) || 0,
    adoptee: !!donnees.adoptee,
  };
  enregistre(db, rapport.annee, (cible) => {
    if (r) Object.assign(cible.resolutions.find((x) => x.id === r.id), valeurs);
    else cible.resolutions.push({ id: uid('res'), ...valeurs });
  });
}

async function editeOrdreDuJour(db, rapport) {
  const donnees = await formulaire({
    titre: "Ordre du jour",
    champs: [
      {
        cle: 'lignes',
        label: 'Un point par ligne',
        type: 'textarea',
        lignes: 8,
        valeur: rapport.ordreDuJour.map((p) => p.titre).join('\n'),
      },
    ],
  });
  if (!donnees) return;
  const points = donnees.lignes
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((titre) => ({ id: uid('odj'), titre }));
  enregistre(db, rapport.annee, (r) => {
    r.ordreDuJour = points;
  });
}

function enregistre(db, annee, modifier) {
  maj((d) => {
    let r = d.rapports.find((x) => x.annee === annee && x.type === 'ag');
    if (!r) {
      r = rapportVierge(annee);
      d.rapports.push(r);
    }
    modifier(r);
  });
}

function renduAG(conteneur, ctx) {
  const { db, annee } = ctx;
  const rapport = rapportAG(db, annee);

  if (!rapport) {
    conteneur.innerHTML = `<section class="carte">
      <h2 class="carte__titre">Assemblée générale ${annee}</h2>
      <p class="note">Aucun rapport commencé pour cet exercice. L'application pré-remplit l'ordre du jour habituel et reprend automatiquement les chiffres du bilan.</p>
      <button class="bouton bouton--primaire bouton--large" data-creer>Commencer le rapport ${annee}</button>
    </section>`;
    delegue(conteneur, 'click', '[data-creer]', () => {
      enregistre(db, annee, () => {});
      toast('Rapport créé');
    });
    return;
  }

  const t = totaux(db, annee);
  const budget = totalBudget(db, annee, 'depense');
  const proposition = propositionBudget(db, annee, 0.02);
  const totalPropose = proposition.reduce((s, l) => s + l.propose, 0);
  const impayes = situationLots(db, annee).filter((s) => s.solde > 0.005);

  conteneur.innerHTML = `
    <div class="boutons-ligne sans-impression">
      <button class="bouton" data-entete>Informations</button>
      <button class="bouton" data-odj>Ordre du jour</button>
      <button class="bouton" data-resolution>+ Résolution</button>
      <button class="bouton bouton--primaire" data-imprimer>🖨 PDF</button>
    </div>

    <article class="document">
      <header class="document__entete">
        <h1>${echappe(db.parametres.syndic || 'Syndic')}</h1>
        ${db.parametres.adresse ? `<p>${echappe(db.parametres.adresse)}</p>` : ''}
        <h2>Procès-verbal de l'assemblée générale ordinaire</h2>
        <p class="document__date">Exercice ${annee} · réunion du ${echappe(dateLongue(rapport.date))}${rapport.heure ? ` à ${echappe(rapport.heure)}` : ''}${rapport.lieu ? `, ${echappe(rapport.lieu)}` : ''}</p>
      </header>

      <section class="document__section" data-modifiable="entete">
        <h3>Composition de l'assemblée</h3>
        <dl class="definitions">
          ${rapport.president ? `<div><dt>Président de séance</dt><dd>${echappe(rapport.president)}</dd></div>` : ''}
          ${rapport.secretaire ? `<div><dt>Secrétaire</dt><dd>${echappe(rapport.secretaire)}</dd></div>` : ''}
          ${rapport.presents ? `<div><dt>Présents</dt><dd>${echappe(rapport.presents)}</dd></div>` : ''}
          ${rapport.representes ? `<div><dt>Représentés</dt><dd>${echappe(rapport.representes)}</dd></div>` : ''}
          ${rapport.absents ? `<div><dt>Absents</dt><dd>${echappe(rapport.absents)}</dd></div>` : ''}
        </dl>
        ${!rapport.president && !rapport.presents ? '<p class="note sans-impression">Touchez « Informations » pour renseigner la composition de l\'assemblée.</p>' : ''}
      </section>

      <section class="document__section" data-modifiable="ordreDuJour">
        <h3>Ordre du jour</h3>
        <ol class="liste-numerotee">
          ${rapport.ordreDuJour.map((p) => `<li>${echappe(p.titre)}</li>`).join('')}
        </ol>
      </section>

      ${
        rapport.introduction
          ? `<section class="document__section" data-texte="introduction"><h3>Propos introductifs</h3><p class="texte-libre">${echappe(rapport.introduction)}</p></section>`
          : '<section class="document__section sans-impression"><button class="lien" data-texte="introduction">+ Ajouter des propos introductifs</button></section>'
      }

      <section class="document__section">
        <h3>Rapport financier de l'exercice ${annee}</h3>
        <div class="zone-tableau"><table class="tableau tableau--synthese">
          <tbody>
            <tr><td>Solde au 1er janvier</td><td class="droite">${echappe(euros(t.ouverture))}</td></tr>
            <tr><td>Provisions et recettes encaissées</td><td class="droite positif">${echappe(euros(t.recettes, { signe: true }))}</td></tr>
            <tr><td>Charges payées</td><td class="droite negatif">${echappe(euros(-t.depenses, { signe: true }))}</td></tr>
            <tr class="ligne-forte"><td>Solde au 31 décembre</td><td class="droite">${echappe(euros(t.solde))}</td></tr>
          </tbody>
        </table></div>
        ${budget ? `<p class="document__commentaire">Le budget voté s'élevait à ${echappe(euros(budget))} ; les charges réelles atteignent ${echappe(euros(t.depenses))}, soit ${echappe(pourcent(t.depenses, budget, 0))} du budget${t.depenses <= budget ? ', sans dépassement' : ', soit un dépassement de ' + echappe(euros(t.depenses - budget))}.</p>` : ''}
        ${anneau(comparatifBudget(db, annee, 'depense').filter((l) => l.realise > 0).map((l) => ({ label: l.nom, valeur: l.realise, couleur: l.couleur })), { titre: `Charges ${annee}` })}
        ${
          impayes.length
            ? `<p class="document__commentaire">${impayes.length} copropriétaire${impayes.length > 1 ? 's présentent' : ' présente'} un solde débiteur au 31 décembre, pour un total de ${echappe(euros(impayes.reduce((s, x) => s + x.solde, 0)))}.</p>`
            : '<p class="document__commentaire">Tous les copropriétaires sont à jour de leurs provisions au 31 décembre.</p>'
        }
      </section>

      <section class="document__section">
        <h3>Budget prévisionnel ${annee + 1} soumis au vote</h3>
        <div class="zone-tableau"><table class="tableau">
          <thead><tr><th>Poste</th><th class="droite">Réalisé ${annee}</th><th class="droite">Proposé ${annee + 1}</th></tr></thead>
          <tbody>${proposition.map((l) => `<tr><td>${echappe(l.nom)}</td><td class="droite">${echappe(euros(l.realise))}</td><td class="droite"><strong>${echappe(euros(l.propose))}</strong></td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th><th class="droite">${echappe(euros(t.depenses))}</th><th class="droite">${echappe(euros(totalPropose))}</th></tr></tfoot>
        </table></div>
      </section>

      <section class="document__section saut-page">
        <h3>Résolutions</h3>
        ${
          rapport.resolutions.length
            ? rapport.resolutions
                .map(
                  (r, i) => `<div class="resolution" data-resolution="${r.id}">
                    <h4>Résolution n°${i + 1} — ${echappe(r.titre)}</h4>
                    ${r.texte ? `<p class="texte-libre">${echappe(r.texte)}</p>` : ''}
                    <p class="resolution__vote">
                      Pour : <strong>${r.pour}</strong> · Contre : <strong>${r.contre}</strong> · Abstention : <strong>${r.abstention}</strong>
                      <span class="badge ${r.adoptee ? 'badge--ok' : 'badge--ko'}">${r.adoptee ? 'Adoptée' : 'Rejetée'}</span>
                    </p>
                  </div>`,
                )
                .join('')
            : '<p class="note">Aucune résolution enregistrée. Ajoutez-en depuis le bouton « + Résolution ».</p>'
        }
      </section>

      ${
        rapport.travaux
          ? `<section class="document__section" data-texte="travaux"><h3>Travaux et projets</h3><p class="texte-libre">${echappe(rapport.travaux)}</p></section>`
          : '<section class="document__section sans-impression"><button class="lien" data-texte="travaux">+ Ajouter une section « Travaux et projets »</button></section>'
      }

      ${
        rapport.conclusion
          ? `<section class="document__section" data-texte="conclusion"><h3>Questions diverses et clôture</h3><p class="texte-libre">${echappe(rapport.conclusion)}</p></section>`
          : '<section class="document__section sans-impression"><button class="lien" data-texte="conclusion">+ Ajouter une conclusion</button></section>'
      }

      <footer class="document__pied">
        <p>L'ordre du jour étant épuisé, la séance est levée.</p>
        <div class="signatures">
          <div><span>Le président de séance</span><br>${echappe(rapport.president || '')}</div>
          <div><span>Le secrétaire</span><br>${echappe(rapport.secretaire || '')}</div>
        </div>
      </footer>
    </article>

    <div class="boutons-ligne sans-impression">
      <button class="bouton bouton--danger-discret" data-supprimer>Supprimer ce rapport</button>
    </div>
  `;

  delegue(conteneur, 'click', '[data-entete]', () => editeEntete(db, rapport));
  delegue(conteneur, 'click', '[data-odj], [data-modifiable="ordreDuJour"]', () => editeOrdreDuJour(db, rapport));
  delegue(conteneur, 'click', '[data-modifiable="entete"]', () => editeEntete(db, rapport));
  delegue(conteneur, 'click', '[data-resolution]', (e, cible) =>
    editeResolution(db, rapport, cible.dataset.resolution === '' ? null : cible.dataset.resolution || null),
  );
  delegue(conteneur, 'click', '[data-texte]', (e, cible) => {
    const cle = cible.dataset.texte;
    const libelles = { introduction: 'Propos introductifs', travaux: 'Travaux et projets', conclusion: 'Questions diverses et clôture' };
    editeTexte(db, rapport, cle, libelles[cle] || cle);
  });
  delegue(conteneur, 'click', '[data-imprimer]', () => window.print());
  delegue(conteneur, 'click', '[data-supprimer]', async () => {
    const ok = await confirme(`Supprimer le rapport d'assemblée ${annee} ?`, { valider: 'Supprimer' });
    if (!ok) return;
    maj((d) => {
      d.rapports = d.rapports.filter((r) => !(r.annee === annee && r.type === 'ag'));
    });
    toast('Rapport supprimé');
  });
}

// ---------------------------------------------------------------------------

export function rendu(conteneur, ctx) {
  if (ctx.sousVue === 'ag') renduAG(conteneur, ctx);
  else renduBilan(conteneur, ctx);
}

export const segments = [
  { cle: '', label: 'Bilan annuel', route: '#/rapport' },
  { cle: 'ag', label: 'Assemblée générale', route: '#/rapport/ag' },
];
