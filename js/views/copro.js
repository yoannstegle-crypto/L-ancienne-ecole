// Copropriétaires et appels de provisions — avec envoi nominatif par WhatsApp.

import { barreTaux } from '../charts.js';
import { aujourdhui, dateFr, dateLongue, echappe, euros, montantDepuisTexte, telephoneWhatsApp, uid } from '../format.js';
import {
  appelsAnnee,
  arrondi,
  lot as trouveLot,
  lotsActifs,
  nouvelleOperation,
  repartir,
  situationLots,
  totalAppel,
  totalBudget,
  totalEncaisseAppel,
  totalTantiemes,
} from '../model.js';
import { maj } from '../store.js';
import { confirme, copie, delegue, feuille, formulaire, ouvreWhatsApp, toast } from '../ui.js';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function construitMessage(modele, variables) {
  return String(modele || '').replace(/\{(\w+)\}/g, (correspondance, cle) =>
    variables[cle] !== undefined && variables[cle] !== null ? String(variables[cle]) : correspondance,
  );
}

function variablesProvision(db, appel, ligne) {
  const l = trouveLot(db, ligne.lotId) || {};
  const nom = l.nom || '';
  return {
    nom,
    prenom: nom.split(' ')[0] || nom,
    lot: l.numeroLot || l.nom || '',
    tantiemes: l.tantiemes || 0,
    montant: euros(ligne.montant),
    echeance: dateLongue(appel.dateEcheance) || dateFr(appel.dateEcheance),
    periode: appel.libelle || `appel n°${appel.numero}`,
    numero: appel.numero,
    iban: db.parametres.iban || '(IBAN à renseigner dans les réglages)',
    communication: `${appel.libelle || `Appel ${appel.numero}`} — ${l.numeroLot ? `lot ${l.numeroLot}` : nom}`,
    syndic: db.parametres.syndic || '',
    gestionnaire: db.parametres.gestionnaire || '',
    annee: appel.annee,
  };
}

// ---------------------------------------------------------------------------
// Copropriétaires
// ---------------------------------------------------------------------------

async function editeLot(db, lotExistant = null) {
  const estNouveau = !lotExistant;
  const l = lotExistant || { id: uid('lot'), nom: '', numeroLot: '', tantiemes: 0, telephone: '', email: '', actif: true, note: '' };

  const donnees = await formulaire({
    titre: estNouveau ? 'Nouveau copropriétaire' : 'Modifier le copropriétaire',
    valider: estNouveau ? 'Ajouter' : 'Enregistrer',
    supprimer: estNouveau ? null : { message: `Supprimer ${l.nom} ? Les appels déjà émis le conserveront.` },
    champs: [
      { cle: 'nom', label: 'Nom et prénom', type: 'text', valeur: l.nom, requis: true, placeholder: 'Ex. Marie Dupont' },
      { cle: 'numeroLot', label: 'Lot / appartement', type: 'text', valeur: l.numeroLot, placeholder: 'Ex. A2' },
      { cle: 'tantiemes', label: 'Tantièmes (sur 1000)', type: 'nombre', valeur: l.tantiemes, pas: 1, requis: true },
      { cle: 'telephone', label: 'Téléphone WhatsApp', type: 'tel', valeur: l.telephone, placeholder: '06 12 34 56 78', aide: 'Sert à ouvrir la conversation nominative.' },
      { cle: 'email', label: 'E-mail', type: 'email', valeur: l.email },
      { cle: 'actif', label: 'Copropriétaire actif', type: 'checkbox', valeur: l.actif !== false },
      { cle: 'note', label: 'Note', type: 'textarea', lignes: 2, valeur: l.note || '' },
    ],
  });
  if (!donnees) return;

  if (donnees.__supprimer) {
    maj((d) => {
      d.lots = d.lots.filter((x) => x.id !== l.id);
    });
    toast('Copropriétaire supprimé');
    return;
  }

  const enregistre = {
    ...l,
    nom: donnees.nom.trim(),
    numeroLot: donnees.numeroLot.trim(),
    tantiemes: Number(donnees.tantiemes) || 0,
    telephone: donnees.telephone.trim(),
    email: donnees.email.trim(),
    actif: !!donnees.actif,
    note: donnees.note.trim(),
  };
  maj((d) => {
    const index = d.lots.findIndex((x) => x.id === l.id);
    if (index >= 0) d.lots[index] = enregistre;
    else d.lots.push(enregistre);
  });
  toast(estNouveau ? 'Copropriétaire ajouté' : 'Fiche mise à jour');
}

function ficheLot(db, annee, situation) {
  const l = situation.lot;
  const tel = telephoneWhatsApp(l.telephone, db.parametres.indicatifTelephone);
  const html = `
    <div class="fiche">
      <div class="fiche__entete">
        <div>
          <strong>${echappe(l.nom)}</strong>
          <span>${l.numeroLot ? `Lot ${echappe(l.numeroLot)} · ` : ''}${l.tantiemes}/1000 tantièmes</span>
        </div>
        <div class="fiche__solde ${situation.solde > 0 ? 'negatif' : 'positif'}">
          ${echappe(euros(situation.solde))}
          <span>${situation.solde > 0 ? 'reste dû' : 'à jour'}</span>
        </div>
      </div>
      <div class="trio trio--encadre">
        <div><span class="trio__label">Appelé ${annee}</span><span class="trio__valeur">${echappe(euros(situation.appele))}</span></div>
        <div><span class="trio__label">Réglé</span><span class="trio__valeur positif">${echappe(euros(situation.regle))}</span></div>
        <div><span class="trio__label">Taux</span><span class="trio__valeur">${situation.appele ? Math.round((situation.regle / situation.appele) * 100) : 0} %</span></div>
      </div>
      ${
        situation.detail.length
          ? `<ul class="liste liste--compacte">${situation.detail
              .map(
                (d) => `<li class="liste__ligne">
                  <div class="liste__principal"><span class="liste__titre">${echappe(d.libelle || `Appel n°${d.numero}`)}</span>
                  <span class="liste__sous">${d.paye ? `réglé le ${echappe(dateFr(d.dateReglement))}` : 'en attente'}</span></div>
                  <span class="liste__montant ${d.paye ? 'positif' : ''}">${echappe(euros(d.montant))}</span>
                </li>`,
              )
              .join('')}</ul>`
          : '<p class="note">Aucun appel de provision sur cet exercice.</p>'
      }
      ${tel ? '' : '<p class="note">Aucun numéro WhatsApp enregistré pour ce copropriétaire.</p>'}
    </div>`;

  return feuille({
    titre: l.nom,
    contenu: html,
    actions: [
      { label: 'Modifier', style: 'discret', action: () => editeLot(db, l) },
      ...(tel
        ? [
            {
              label: '💬 WhatsApp',
              style: 'primaire',
              action: () => {
                const rappel =
                  situation.solde > 0
                    ? `Bonjour ${l.nom.split(' ')[0]},\n\nPetit rappel : il reste ${euros(situation.solde)} à régler sur les provisions ${annee}.\n\nMerci d'avance,\n${db.parametres.gestionnaire} — ${db.parametres.syndic}`
                    : `Bonjour ${l.nom.split(' ')[0]},\n\nVotre situation ${annee} est à jour, merci !\n\n${db.parametres.gestionnaire} — ${db.parametres.syndic}`;
                ouvreWhatsApp(tel, rappel);
              },
            },
          ]
        : []),
    ],
  });
}

function renduLots(conteneur, ctx) {
  const { db, annee } = ctx;
  const situations = situationLots(db, annee);
  const total = totalTantiemes(db);
  const totalAppele = situations.reduce((s, x) => s + x.appele, 0);
  const totalRegle = situations.reduce((s, x) => s + x.regle, 0);

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">Copropriété</h2>
      <div class="trio trio--encadre">
        <div><span class="trio__label">Lots</span><span class="trio__valeur">${situations.length}</span></div>
        <div><span class="trio__label">Tantièmes</span><span class="trio__valeur ${total !== 1000 && total !== 0 ? 'negatif' : ''}">${total}</span></div>
        <div><span class="trio__label">Recouvré ${annee}</span><span class="trio__valeur">${totalAppele ? Math.round((totalRegle / totalAppele) * 100) : 0} %</span></div>
      </div>
      ${total !== 1000 && total !== 0 ? `<p class="note note--alerte">La somme des tantièmes vaut ${total} au lieu de 1000. La répartition reste proportionnelle, mais vérifiez le règlement de copropriété.</p>` : ''}
    </section>

    ${
      situations.length
        ? `<section class="carte carte--liste">
            <ul class="liste">
              ${situations
                .map(
                  (s) => `<li class="liste__ligne" data-lot="${s.lot.id}">
                    <div class="liste__principal">
                      <span class="liste__titre">${echappe(s.lot.nom)}</span>
                      <span class="liste__sous">${s.lot.numeroLot ? `Lot ${echappe(s.lot.numeroLot)} · ` : ''}${s.lot.tantiemes}/1000${s.lot.telephone ? ' · 💬' : ''}</span>
                      ${s.appele ? barreTaux(s.regle / s.appele, s.solde > 0.005 ? 'var(--attention)' : 'var(--positif)') : ''}
                    </div>
                    <div class="liste__secondaire">
                      <span class="liste__montant ${s.solde > 0.005 ? 'negatif' : 'positif'}">${echappe(euros(s.solde))}</span>
                      <span class="liste__sous">${s.solde > 0.005 ? 'reste dû' : 'à jour'}</span>
                    </div>
                  </li>`,
                )
                .join('')}
            </ul>
          </section>`
        : `<section class="carte"><p class="note">Aucun copropriétaire enregistré. Commencez par les ajouter : c'est la base des appels de provisions et de la répartition aux tantièmes.</p></section>`
    }

    <button class="bouton-flottant" data-nouveau-lot aria-label="Ajouter un copropriétaire">+</button>
  `;

  delegue(conteneur, 'click', '[data-lot]', (e, cible) => {
    const s = situations.find((x) => x.lot.id === cible.dataset.lot);
    if (s) ficheLot(db, annee, s);
  });
  delegue(conteneur, 'click', '[data-nouveau-lot]', () => editeLot(db));
}

// ---------------------------------------------------------------------------
// Appels de provisions
// ---------------------------------------------------------------------------

async function creeAppel(db, annee) {
  const lots = lotsActifs(db);
  if (!lots.length) {
    toast("Ajoutez d'abord les copropriétaires", 'erreur');
    return;
  }
  const existants = appelsAnnee(db, annee);
  const numero = existants.length + 1;
  const budget = totalBudget(db, annee, 'depense');
  const suggestion = budget ? arrondi(budget / 4) : 0;

  const donnees = await formulaire({
    titre: `Appel de provisions n°${numero}`,
    valider: 'Créer et répartir',
    champs: [
      { cle: 'libelle', label: 'Libellé', type: 'text', valeur: `Provisions ${trimestre(numero)} ${annee}`, requis: true },
      { cle: 'dateEmission', label: 'Date d’émission', type: 'date', valeur: aujourdhui(), requis: true },
      { cle: 'dateEcheance', label: 'Date d’échéance', type: 'date', valeur: dansUnMois(), requis: true },
      {
        cle: 'montantTotal',
        label: 'Montant total à appeler',
        type: 'montant',
        valeur: suggestion ? String(suggestion).replace('.', ',') : '',
        requis: true,
        aide: budget ? `Suggestion : un quart du budget ${annee} (${euros(budget)}).` : 'Aucun budget saisi pour cet exercice.',
      },
      {
        cle: 'repartition',
        label: 'Répartition',
        type: 'select',
        valeur: 'tantiemes',
        options: [
          { valeur: 'tantiemes', label: 'Aux tantièmes' },
          { valeur: 'egale', label: 'Parts égales' },
        ],
      },
    ],
  });
  if (!donnees) return;

  const total = arrondi(Math.abs(montantDepuisTexte(donnees.montantTotal)));
  const parts = repartir(db, total, donnees.repartition);
  const appel = {
    id: uid('app'),
    annee,
    numero,
    libelle: donnees.libelle.trim(),
    dateEmission: donnees.dateEmission,
    dateEcheance: donnees.dateEcheance,
    repartition: donnees.repartition,
    lignes: parts.map((p) => ({ lotId: p.lotId, montant: p.montant, paye: false, dateReglement: null, operationId: null })),
  };
  maj((d) => {
    d.appels.push(appel);
  });
  toast(`Appel n°${numero} créé · ${euros(total)}`);
  ficheAppel(db, appel.id);
}

function trimestre(n) {
  return ['T1', 'T2', 'T3', 'T4'][(n - 1) % 4] || `n°${n}`;
}

function dansUnMois() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bascule le règlement d'une quote-part, et crée/supprime l'encaissement associé. */
function basculeReglement(db, appelId, lotId) {
  maj((d) => {
    const appel = d.appels.find((a) => a.id === appelId);
    if (!appel) return;
    const ligne = appel.lignes.find((l) => l.lotId === lotId);
    if (!ligne) return;
    if (ligne.paye) {
      if (ligne.operationId) d.operations = d.operations.filter((o) => o.id !== ligne.operationId);
      ligne.paye = false;
      ligne.dateReglement = null;
      ligne.operationId = null;
    } else {
      const proprietaire = d.lots.find((x) => x.id === lotId);
      const categorieProvisions = d.categories.find((c) => c.id === 'provisions') || d.categories.find((c) => c.type === 'recette');
      const operation = nouvelleOperation({
        date: aujourdhui(),
        libelle: `Provision ${appel.libelle} — ${proprietaire ? proprietaire.nom : ''}`.trim(),
        montant: arrondi(ligne.montant),
        categorieId: categorieProvisions ? categorieProvisions.id : null,
        lotId,
        appelId,
        note: 'Encaissement de provision',
      });
      d.operations.push(operation);
      ligne.paye = true;
      ligne.dateReglement = operation.date;
      ligne.operationId = operation.id;
    }
  });
}

function ficheAppel(db, appelId) {
  const rendreContenu = () => {
    const appel = db.appels.find((a) => a.id === appelId);
    if (!appel) return '<p class="note">Appel introuvable.</p>';
    const total = totalAppel(appel);
    const encaisse = totalEncaisseAppel(appel);
    return `
      <div class="fiche">
        <div class="trio trio--encadre">
          <div><span class="trio__label">Appelé</span><span class="trio__valeur">${echappe(euros(total))}</span></div>
          <div><span class="trio__label">Encaissé</span><span class="trio__valeur positif">${echappe(euros(encaisse))}</span></div>
          <div><span class="trio__label">Reste</span><span class="trio__valeur ${total - encaisse > 0.005 ? 'negatif' : 'positif'}">${echappe(euros(total - encaisse))}</span></div>
        </div>
        <p class="note">Émis le ${echappe(dateFr(appel.dateEmission))} · échéance le ${echappe(dateFr(appel.dateEcheance))}</p>
        <ul class="liste">
          ${appel.lignes
            .map((l) => {
              const proprietaire = trouveLot(db, l.lotId);
              const tel = telephoneWhatsApp(proprietaire ? proprietaire.telephone : '', db.parametres.indicatifTelephone);
              return `<li class="liste__ligne">
                <button class="case ${l.paye ? 'case--cochee' : ''}" data-regler="${l.lotId}" aria-label="Marquer réglé">${l.paye ? '✓' : ''}</button>
                <div class="liste__principal">
                  <span class="liste__titre">${echappe(proprietaire ? proprietaire.nom : 'Lot supprimé')}</span>
                  <span class="liste__sous">${l.paye ? `réglé le ${echappe(dateFr(l.dateReglement))}` : 'en attente'}</span>
                </div>
                <div class="liste__secondaire">
                  <span class="liste__montant">${echappe(euros(l.montant))}</span>
                  ${tel ? `<button class="bouton bouton--mini" data-envoyer="${l.lotId}">💬</button>` : '<span class="sous-info">pas de n°</span>'}
                </div>
              </li>`;
            })
            .join('')}
        </ul>
      </div>`;
  };

  return feuille({
    titre: (db.appels.find((a) => a.id === appelId) || {}).libelle || 'Appel de provisions',
    contenu: rendreContenu(),
    pleinEcran: true,
    surMontage: ({ corps, fermer }) => {
      const redessine = () => {
        corps.innerHTML = rendreContenu();
      };
      delegue(corps, 'click', '[data-regler]', (e, cible) => {
        basculeReglement(db, appelId, cible.dataset.regler);
        redessine();
      });
      delegue(corps, 'click', '[data-envoyer]', (e, cible) => {
        const appel = db.appels.find((a) => a.id === appelId);
        const ligne = appel.lignes.find((l) => l.lotId === cible.dataset.envoyer);
        const proprietaire = trouveLot(db, ligne.lotId);
        const message = construitMessage(db.parametres.messageProvision, variablesProvision(db, appel, ligne));
        ouvreWhatsApp(telephoneWhatsApp(proprietaire.telephone, db.parametres.indicatifTelephone), message);
      });
      corps.dataset.fermeture = fermer ? '1' : '0';
    },
    actions: [
      {
        label: '📤 Envoyer à tous',
        style: 'primaire',
        action: async () => {
          const appel = db.appels.find((a) => a.id === appelId);
          await envoiEnSerie(db, appel);
          return false;
        },
      },
      {
        label: 'Supprimer',
        style: 'danger-discret',
        action: async ({ fermer }) => {
          const ok = await confirme('Supprimer cet appel et les encaissements qui lui sont rattachés ?', { valider: 'Supprimer' });
          if (!ok) return false;
          maj((d) => {
            const appel = d.appels.find((a) => a.id === appelId);
            const operations = new Set((appel ? appel.lignes : []).map((l) => l.operationId).filter(Boolean));
            d.operations = d.operations.filter((o) => !operations.has(o.id));
            d.appels = d.appels.filter((a) => a.id !== appelId);
          });
          toast('Appel supprimé');
          fermer();
          return false;
        },
      },
    ],
  });
}

/**
 * Envoi nominatif en série : WhatsApp n'autorise qu'une conversation à la fois,
 * on présente donc la file d'attente et on l'avance message par message.
 */
async function envoiEnSerie(db, appel) {
  const cibles = appel.lignes
    .map((l) => ({ ligne: l, proprietaire: trouveLot(db, l.lotId) }))
    .filter((x) => x.proprietaire && telephoneWhatsApp(x.proprietaire.telephone, db.parametres.indicatifTelephone));

  if (!cibles.length) {
    toast('Aucun numéro WhatsApp enregistré', 'erreur');
    return;
  }

  let index = 0;
  const envoyes = new Set();

  const contenu = () => `
    <p class="texte-modale">Chaque copropriétaire reçoit son propre message, avec son montant. Touchez « Envoyer » pour ouvrir la conversation, revenez ici, puis passez au suivant.</p>
    <ul class="liste">
      ${cibles
        .map(
          (c, i) => `<li class="liste__ligne ${i === index ? 'liste__ligne--active' : ''}">
            <div class="liste__principal">
              <span class="liste__titre">${echappe(c.proprietaire.nom)}</span>
              <span class="liste__sous">${envoyes.has(c.ligne.lotId) ? '✓ envoyé' : c.ligne.paye ? 'déjà réglé' : 'à envoyer'}</span>
            </div>
            <span class="liste__montant">${echappe(euros(c.ligne.montant))}</span>
          </li>`,
        )
        .join('')}
    </ul>`;

  await feuille({
    titre: 'Envoi des appels',
    contenu: contenu(),
    pleinEcran: true,
    surMontage: ({ corps }) => {
      const pied = corps.parentElement.querySelector('.feuille__pied');
      const majAffichage = () => {
        corps.innerHTML = contenu();
        const bouton = pied.querySelector('[data-suivant]');
        if (!bouton) return;
        if (index >= cibles.length) {
          bouton.textContent = 'Terminé';
          bouton.disabled = true;
        } else {
          bouton.textContent = `Envoyer à ${cibles[index].proprietaire.nom.split(' ')[0]}`;
        }
      };
      const bouton = document.createElement('button');
      bouton.className = 'bouton bouton--primaire';
      bouton.dataset.suivant = '1';
      bouton.addEventListener('click', () => {
        if (index >= cibles.length) return;
        const c = cibles[index];
        const message = construitMessage(db.parametres.messageProvision, variablesProvision(db, appel, c.ligne));
        ouvreWhatsApp(telephoneWhatsApp(c.proprietaire.telephone, db.parametres.indicatifTelephone), message);
        envoyes.add(c.ligne.lotId);
        index += 1;
        majAffichage();
      });
      pied.insertBefore(bouton, pied.firstChild);
      majAffichage();
    },
    actions: [{ label: 'Fermer', style: 'discret', valeur: true }],
  });
}

function renduAppels(conteneur, ctx) {
  const { db, annee } = ctx;
  const appels = appelsAnnee(db, annee);
  const totalAppele = appels.reduce((s, a) => s + totalAppel(a), 0);
  const totalEncaisse = appels.reduce((s, a) => s + totalEncaisseAppel(a), 0);

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">Provisions ${annee}</h2>
      <div class="trio trio--encadre">
        <div><span class="trio__label">Appelé</span><span class="trio__valeur">${echappe(euros(totalAppele))}</span></div>
        <div><span class="trio__label">Encaissé</span><span class="trio__valeur positif">${echappe(euros(totalEncaisse))}</span></div>
        <div><span class="trio__label">Reste dû</span><span class="trio__valeur ${totalAppele - totalEncaisse > 0.005 ? 'negatif' : 'positif'}">${echappe(euros(totalAppele - totalEncaisse))}</span></div>
      </div>
    </section>

    ${
      appels.length
        ? `<section class="carte carte--liste"><ul class="liste">
            ${appels
              .map((a) => {
                const total = totalAppel(a);
                const encaisse = totalEncaisseAppel(a);
                const nbPayes = a.lignes.filter((l) => l.paye).length;
                return `<li class="liste__ligne" data-appel="${a.id}">
                  <div class="liste__principal">
                    <span class="liste__titre">${echappe(a.libelle)}</span>
                    <span class="liste__sous">échéance ${echappe(dateFr(a.dateEcheance))} · ${nbPayes}/${a.lignes.length} réglés</span>
                    ${barreTaux(total ? encaisse / total : 0, encaisse >= total ? 'var(--positif)' : 'var(--attention)')}
                  </div>
                  <div class="liste__secondaire">
                    <span class="liste__montant">${echappe(euros(total))}</span>
                    <span class="liste__sous">${echappe(euros(encaisse))} reçus</span>
                  </div>
                </li>`;
              })
              .join('')}
          </ul></section>`
        : `<section class="carte"><p class="note">Aucun appel émis pour ${annee}. Créez-en un : l'application répartit le montant aux tantièmes et prépare un message WhatsApp nominatif pour chaque copropriétaire.</p></section>`
    }

    <section class="carte">
      <h2 class="carte__titre">Message au groupe</h2>
      <p class="note">Un point de trésorerie prêt à coller dans le groupe WhatsApp de la copropriété.</p>
      <div class="boutons-ligne">
        <button class="bouton" data-message-groupe>Préparer le message</button>
      </div>
    </section>

    <button class="bouton-flottant" data-nouvel-appel aria-label="Nouvel appel de provisions">+</button>
  `;

  delegue(conteneur, 'click', '[data-appel]', (e, cible) => ficheAppel(db, cible.dataset.appel));
  delegue(conteneur, 'click', '[data-nouvel-appel]', () => creeAppel(db, annee));
  delegue(conteneur, 'click', '[data-message-groupe]', () => messageGroupe(db, annee));
}

async function messageGroupe(db, annee) {
  const { totaux, totalBudget: tb } = await import('../model.js');
  const t = totaux(db, annee);
  const budget = tb(db, annee, 'depense');
  const message = construitMessage(db.parametres.messageGroupe, {
    syndic: db.parametres.syndic,
    date: dateLongue(aujourdhui()),
    solde: euros(t.solde),
    depenses: euros(t.depenses),
    budget: euros(budget),
    consommation: budget ? `${Math.round((t.depenses / budget) * 100)} %` : '—',
    provisions: euros(t.recettes),
    annee,
    commentaire: '',
  });

  await feuille({
    titre: 'Message au groupe',
    contenu: `<textarea class="zone-message" rows="14">${echappe(message)}</textarea>
      <p class="note">Modifiez librement avant d'envoyer. Le modèle se règle dans les réglages.</p>`,
    actions: [
      {
        label: 'Copier',
        style: 'discret',
        action: async ({ corps }) => {
          await copie(corps.querySelector('textarea').value);
          return false;
        },
      },
      {
        label: '💬 Ouvrir WhatsApp',
        style: 'primaire',
        action: ({ corps }) => {
          ouvreWhatsApp('', corps.querySelector('textarea').value);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------

export function rendu(conteneur, ctx) {
  if (ctx.sousVue === 'appels') renduAppels(conteneur, ctx);
  else renduLots(conteneur, ctx);
}

export const segments = [
  { cle: '', label: 'Copropriétaires', route: '#/copro' },
  { cle: 'appels', label: 'Provisions', route: '#/copro/appels' },
];
