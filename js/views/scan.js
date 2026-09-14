// Scan d'un extrait de compte : photo → Gemini → tableau à valider → import.
// C'est le raccourci qui évite de ressaisir un relevé papier à la main.

import { categorieDepuisNom, compresseImage, litReleve } from '../gemini.js';
import { arrondi, appelsAnnee, devineCategorie, devineLot, doublonProbable, lotsActifs, nouvelleOperation } from '../model.js';
import { aujourdhui, dateFr, echappe, euros, montantDepuisTexte, uid } from '../format.js';
import { maj } from '../store.js';
import { confirme, delegue, renouvelle, toast } from '../ui.js';

const etat = {
  images: [],
  releve: null,
  lignes: [],
  enCours: false,
  erreur: '',
};

export function reinitialiseScan() {
  etat.images = [];
  etat.releve = null;
  etat.lignes = [];
  etat.enCours = false;
  etat.erreur = '';
}

function prepareLignes(db) {
  etat.lignes = etat.releve.operations.map((o) => {
    const categorieId =
      categorieDepuisNom(db.categories, o.categorieSuggeree) || devineCategorie(db, o.libelle, o.montant);
    const candidat = o.montant > 0 ? devineLot(db, `${o.libelle} ${o.contrepartie}`) : null;
    const provisoire = { ...o, date: o.date || aujourdhui(), categorieId, lotId: candidat ? candidat.id : null };
    return {
      id: uid('scan'),
      ...provisoire,
      garder: true,
      doublon: !!doublonProbable(db, provisoire),
    };
  });
  // Une ligne déjà présente dans le compte est décochée d'office : on n'importe
  // jamais deux fois le même relevé par accident.
  etat.lignes.forEach((l) => {
    if (l.doublon) l.garder = false;
  });
}

async function analyse(db, rafraichir) {
  if (!etat.images.length) return;
  etat.enCours = true;
  etat.erreur = '';
  rafraichir();
  try {
    etat.releve = await litReleve({
      images: etat.images,
      cle: db.parametres.cleGemini,
      modele: db.parametres.modeleGemini,
      categories: db.categories,
      lots: lotsActifs(db),
    });
    prepareLignes(db);
    if (!etat.lignes.length) etat.erreur = "Aucune opération détectée. Reprenez la photo bien à plat, sans ombre portée.";
  } catch (err) {
    etat.erreur = err.message || String(err);
    etat.releve = null;
    etat.lignes = [];
  } finally {
    etat.enCours = false;
    rafraichir();
  }
}

/** Rapproche une provision encaissée de la ligne d'appel correspondante. */
function rapproche(d, operation, annee) {
  if (operation.montant <= 0 || !operation.lotId) return;
  const appels = appelsAnnee(d, annee);
  for (const appel of appels) {
    const ligne = (appel.lignes || []).find(
      (l) => l.lotId === operation.lotId && !l.paye && Math.abs((Number(l.montant) || 0) - operation.montant) < 0.02,
    );
    if (ligne) {
      ligne.paye = true;
      ligne.dateReglement = operation.date;
      ligne.operationId = operation.id;
      operation.appelId = appel.id;
      return;
    }
  }
}

async function importe(db, annee, naviguer) {
  const retenues = etat.lignes.filter((l) => l.garder);
  if (!retenues.length) {
    toast('Aucune ligne sélectionnée', 'erreur');
    return;
  }
  const horsExercice = retenues.filter((l) => Number(l.date.slice(0, 4)) !== annee).length;
  if (horsExercice) {
    const ok = await confirme(
      `${horsExercice} opération(s) ne sont pas datées de ${annee}. Elles seront tout de même enregistrées à leur date réelle.`,
      { titre: 'Dates hors exercice', valider: 'Continuer', danger: false },
    );
    if (!ok) return;
  }

  let rapprochees = 0;
  maj((d) => {
    retenues.forEach((l) => {
      const operation = nouvelleOperation({
        date: l.date,
        libelle: l.libelle,
        montant: arrondi(l.montant),
        categorieId: l.categorieId || null,
        lotId: l.lotId || null,
        source: 'scan',
        pointee: true,
        note: etat.releve.periode ? `Extrait ${etat.releve.periode}` : '',
      });
      const avant = operation.appelId;
      rapproche(d, operation, Number(l.date.slice(0, 4)) || annee);
      if (operation.appelId !== avant) rapprochees += 1;
      d.operations.push(operation);
    });
  });

  toast(
    `${retenues.length} opération${retenues.length > 1 ? 's' : ''} importée${retenues.length > 1 ? 's' : ''}` +
      (rapprochees ? ` · ${rapprochees} provision${rapprochees > 1 ? 's' : ''} pointée${rapprochees > 1 ? 's' : ''}` : ''),
  );
  reinitialiseScan();
  naviguer('#/compte');
}

function controleCoherence() {
  const r = etat.releve;
  if (!r || r.soldeInitial == null || r.soldeFinal == null) return null;
  const somme = arrondi(etat.lignes.filter((l) => l.garder).reduce((s, l) => s + l.montant, 0));
  const attendu = arrondi(r.soldeFinal - r.soldeInitial);
  return { somme, attendu, ecart: arrondi(somme - attendu), ok: Math.abs(somme - attendu) < 0.02 };
}

export function rendu(conteneur, ctx) {
  const { db, annee, naviguer } = ctx;
  const rafraichir = () => rendu(renouvelle(conteneur), ctx);
  const sansCle = !db.parametres.cleGemini;
  const coherence = controleCoherence();
  const retenues = etat.lignes.filter((l) => l.garder);

  conteneur.innerHTML = `
    ${
      sansCle
        ? `<section class="carte carte--avertissement">
            <h2 class="carte__titre">Clé Gemini manquante</h2>
            <p class="note">La lecture automatique des relevés a besoin d'une clé API Google AI Studio (gratuite). Renseignez-la une fois pour toutes dans les réglages.</p>
            <button class="bouton bouton--primaire" data-route="#/reglages">Ouvrir les réglages</button>
          </section>`
        : ''
    }

    <section class="carte">
      <h2 class="carte__titre">1 · Photographier l'extrait</h2>
      <p class="note">Une photo par page, bien à plat. Vous pouvez en ajouter plusieurs : elles seront lues comme un seul relevé.</p>
      <div class="boutons-ligne">
        <label class="bouton bouton--primaire">
          📷 Prendre une photo
          <input type="file" accept="image/*" capture="environment" hidden data-ajout-photo>
        </label>
        <label class="bouton">
          🖼 Photothèque
          <input type="file" accept="image/*" multiple hidden data-ajout-photo>
        </label>
      </div>
      ${
        etat.images.length
          ? `<div class="vignettes">${etat.images
              .map(
                (img, i) => `<figure class="vignette">
                  <img src="${img.apercu}" alt="Page ${i + 1}">
                  <button class="vignette__retirer" data-retirer="${i}" aria-label="Retirer">✕</button>
                </figure>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        etat.images.length
          ? `<button class="bouton bouton--primaire bouton--large" data-analyser ${etat.enCours || sansCle ? 'disabled' : ''}>
              ${etat.enCours ? '<span class="rotation"></span> Lecture en cours…' : `🔎 Analyser ${etat.images.length} page${etat.images.length > 1 ? 's' : ''}`}
            </button>`
          : ''
      }
      ${etat.erreur ? `<p class="message-erreur">${echappe(etat.erreur)}</p>` : ''}
    </section>

    ${
      etat.releve
        ? `<section class="carte">
            <h2 class="carte__titre">2 · Vérifier</h2>
            <div class="resume-releve">
              ${etat.releve.banque ? `<div><span>Banque</span><strong>${echappe(etat.releve.banque)}</strong></div>` : ''}
              ${etat.releve.periode ? `<div><span>Période</span><strong>${echappe(etat.releve.periode)}</strong></div>` : ''}
              ${etat.releve.soldeInitial != null ? `<div><span>Ancien solde</span><strong>${echappe(euros(etat.releve.soldeInitial))}</strong></div>` : ''}
              ${etat.releve.soldeFinal != null ? `<div><span>Nouveau solde</span><strong>${echappe(euros(etat.releve.soldeFinal))}</strong></div>` : ''}
            </div>
            ${
              coherence
                ? `<p class="controle ${coherence.ok ? 'controle--ok' : 'controle--ko'}">
                    ${
                      coherence.ok
                        ? `✓ Contrôle de cohérence : les lignes retenues expliquent exactement la variation du solde (${echappe(euros(coherence.attendu, { signe: true }))}).`
                        : `⚠︎ Écart de ${echappe(euros(coherence.ecart, { signe: true }))} entre les lignes retenues (${echappe(euros(coherence.somme, { signe: true }))}) et la variation du solde (${echappe(euros(coherence.attendu, { signe: true }))}). Une ligne a peut-être été mal lue.`
                    }
                  </p>`
                : ''
            }
            <ul class="liste liste--scan">
              ${etat.lignes
                .map(
                  (l) => `<li class="liste__ligne ${l.garder ? '' : 'liste__ligne--exclue'}" data-ligne="${l.id}">
                    <button class="case ${l.garder ? 'case--cochee' : ''}" data-basculer="${l.id}" aria-label="Retenir cette ligne">${l.garder ? '✓' : ''}</button>
                    <div class="liste__principal">
                      <span class="liste__titre">${echappe(l.libelle)}</span>
                      <span class="liste__sous">${echappe(dateFr(l.date))} · ${echappe(nomCat(db, l.categorieId))}${l.lotId ? ` · ${echappe(nomLot(db, l.lotId))}` : ''}${l.doublon ? ' · <b>déjà enregistrée</b>' : ''}</span>
                    </div>
                    <span class="liste__montant ${l.montant < 0 ? 'negatif' : 'positif'}">${echappe(euros(l.montant, { signe: true }))}</span>
                  </li>`,
                )
                .join('')}
            </ul>
            <p class="note">Touchez une ligne pour corriger la date, le libellé, le montant ou la catégorie.</p>
            <div class="boutons-ligne">
              <button class="bouton" data-tout-cocher>Tout retenir</button>
              <button class="bouton" data-tout-decocher>Tout retirer</button>
            </div>
            <button class="bouton bouton--primaire bouton--large" data-importer ${retenues.length ? '' : 'disabled'}>
              Importer ${retenues.length} opération${retenues.length > 1 ? 's' : ''}
            </button>
          </section>`
        : ''
    }
  `;

  conteneur.querySelectorAll('[data-ajout-photo]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const fichiers = [...e.target.files];
      e.target.value = '';
      for (const fichier of fichiers) {
        try {
          etat.images.push(await compresseImage(fichier));
        } catch (err) {
          toast(err.message, 'erreur');
        }
      }
      rafraichir();
    });
  });

  delegue(conteneur, 'click', '[data-retirer]', (e, cible) => {
    etat.images.splice(Number(cible.dataset.retirer), 1);
    rafraichir();
  });
  delegue(conteneur, 'click', '[data-analyser]', () => analyse(db, rafraichir));
  delegue(conteneur, 'click', '[data-route]', (e, cible) => naviguer(cible.dataset.route));
  delegue(conteneur, 'click', '[data-basculer]', (e, cible) => {
    e.stopPropagation();
    const ligne = etat.lignes.find((l) => l.id === cible.dataset.basculer);
    if (ligne) ligne.garder = !ligne.garder;
    rafraichir();
  });
  delegue(conteneur, 'click', '[data-tout-cocher]', () => {
    etat.lignes.forEach((l) => {
      l.garder = true;
    });
    rafraichir();
  });
  delegue(conteneur, 'click', '[data-tout-decocher]', () => {
    etat.lignes.forEach((l) => {
      l.garder = false;
    });
    rafraichir();
  });
  delegue(conteneur, 'click', '[data-importer]', () => importe(db, annee, naviguer));
  delegue(conteneur, 'click', '[data-ligne]', async (e, cible) => {
    if (e.target.closest('[data-basculer]')) return;
    const ligne = etat.lignes.find((l) => l.id === cible.dataset.ligne);
    if (ligne) await corrige(db, ligne, rafraichir);
  });
}

function nomCat(db, id) {
  const c = db.categories.find((x) => x.id === id);
  return c ? c.nom : 'à classer';
}

function nomLot(db, id) {
  const l = db.lots.find((x) => x.id === id);
  return l ? l.nom : '';
}

async function corrige(db, ligne, rafraichir) {
  const { formulaire } = await import('../ui.js');
  const donnees = await formulaire({
    titre: 'Corriger la ligne',
    champs: [
      { cle: 'date', label: 'Date', type: 'date', valeur: ligne.date, requis: true },
      { cle: 'libelle', label: 'Libellé', type: 'text', valeur: ligne.libelle, requis: true },
      { cle: 'montant', label: 'Montant (négatif pour un débit)', type: 'montant', valeur: String(ligne.montant).replace('.', ','), requis: true },
      {
        cle: 'categorieId',
        label: 'Catégorie',
        type: 'select',
        valeur: ligne.categorieId || '',
        options: [{ valeur: '', label: '— à classer —' }, ...db.categories.map((c) => ({ valeur: c.id, label: c.nom }))],
      },
      {
        cle: 'lotId',
        label: 'Copropriétaire',
        type: 'select',
        valeur: ligne.lotId || '',
        options: [{ valeur: '', label: '— aucun —' }, ...lotsActifs(db).map((l) => ({ valeur: l.id, label: l.nom }))],
      },
    ],
  });
  if (!donnees) return;
  ligne.date = donnees.date;
  ligne.libelle = donnees.libelle.trim();
  ligne.montant = arrondi(montantDepuisTexte(donnees.montant));
  ligne.categorieId = donnees.categorieId || null;
  ligne.lotId = donnees.lotId || null;
  ligne.doublon = !!doublonProbable(db, ligne);
  rafraichir();
}
