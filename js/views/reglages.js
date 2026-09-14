// Réglages : identité du syndic, exercices, clé Gemini, modèles de messages,
// catégories et surtout la sauvegarde des données.

import { testeCle } from '../gemini.js';
import { dateLongue, echappe, euros, montantDepuisTexte, uid } from '../format.js';
import { anneesConnues, arrondi, exerciceVierge, MODELE_MESSAGE_GROUPE, MODELE_MESSAGE_PROVISION, totaux } from '../model.js';
import { chargeJeuDemo } from '../demo.js';
import { exporteJSON, importeJSON, joursDepuisSauvegarde, maj, reinitialise } from '../store.js';
import { confirme, delegue, feuille, formulaire, toast } from '../ui.js';

async function editeIdentite(db) {
  const p = db.parametres;
  const donnees = await formulaire({
    titre: 'Identité du syndic',
    champs: [
      { cle: 'syndic', label: 'Nom du syndic', type: 'text', valeur: p.syndic, requis: true },
      { cle: 'adresse', label: "Adresse de l'immeuble", type: 'textarea', lignes: 2, valeur: p.adresse },
      { cle: 'gestionnaire', label: 'Gestionnaire', type: 'text', valeur: p.gestionnaire, aide: 'Signature des messages et des rapports.' },
      { cle: 'iban', label: 'IBAN du compte du syndic', type: 'text', valeur: p.iban, aide: 'Inséré automatiquement dans les appels de provisions.' },
      { cle: 'indicatifTelephone', label: 'Indicatif téléphonique', type: 'text', valeur: p.indicatifTelephone, aide: '33 pour la France, 32 pour la Belgique, 41 pour la Suisse.' },
    ],
  });
  if (!donnees) return;
  maj((d) => Object.assign(d.parametres, donnees));
  toast('Réglages enregistrés');
}

async function editeExercice(db, annee) {
  const ex = db.exercices.find((e) => e.annee === annee) || exerciceVierge(annee);
  const donnees = await formulaire({
    titre: `Exercice ${annee}`,
    champs: [
      {
        cle: 'soldeOuverture',
        label: 'Solde du compte au 1er janvier',
        type: 'montant',
        valeur: String(ex.soldeOuverture || 0).replace('.', ','),
        aide: "Le solde repris du relevé de décembre de l'année précédente.",
      },
      { cle: 'note', label: 'Note', type: 'textarea', lignes: 2, valeur: ex.note || '' },
    ],
  });
  if (!donnees) return;
  maj((d) => {
    let cible = d.exercices.find((e) => e.annee === annee);
    if (!cible) {
      cible = exerciceVierge(annee);
      d.exercices.push(cible);
    }
    cible.soldeOuverture = arrondi(montantDepuisTexte(donnees.soldeOuverture));
    cible.note = donnees.note.trim();
  });
  toast('Exercice mis à jour');
}

async function ouvreExerciceSuivant(db) {
  const derniere = Math.max(...db.exercices.map((e) => e.annee));
  const suivante = derniere + 1;
  const solde = totaux(db, derniere).solde;
  const ok = await confirme(
    `Créer l'exercice ${suivante} avec un solde d'ouverture de ${euros(solde)}, repris de la clôture ${derniere} ?`,
    { titre: `Ouvrir ${suivante}`, valider: 'Créer', danger: false },
  );
  if (!ok) return;
  maj((d) => {
    if (!d.exercices.some((e) => e.annee === suivante)) {
      d.exercices.push({ ...exerciceVierge(suivante), soldeOuverture: arrondi(solde) });
    }
    d.parametres.exerciceCourant = suivante;
  });
  toast(`Exercice ${suivante} ouvert`);
}

async function editeGemini(db) {
  const donnees = await formulaire({
    titre: 'Lecture des relevés (Gemini)',
    champs: [
      {
        cle: 'cleGemini',
        label: 'Clé API',
        type: 'text',
        valeur: db.parametres.cleGemini,
        placeholder: 'AIza…',
        aide: 'Créez-la gratuitement sur aistudio.google.com/apikey. Elle reste sur ce téléphone.',
      },
      {
        cle: 'modeleGemini',
        label: 'Modèle',
        type: 'select',
        valeur: db.parametres.modeleGemini,
        options: [
          { valeur: 'gemini-2.5-flash', label: 'gemini-2.5-flash (rapide, recommandé)' },
          { valeur: 'gemini-2.5-pro', label: 'gemini-2.5-pro (plus fin, plus lent)' },
          { valeur: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
        ],
      },
    ],
  });
  if (!donnees) return;
  maj((d) => Object.assign(d.parametres, { cleGemini: donnees.cleGemini.trim(), modeleGemini: donnees.modeleGemini }));
  if (!donnees.cleGemini.trim()) return;
  toast('Vérification de la clé…');
  try {
    await testeCle(donnees.cleGemini.trim(), donnees.modeleGemini);
    toast('Clé valide ✓');
  } catch (err) {
    toast(`Clé refusée : ${err.message}`, 'erreur');
  }
}

async function editeModeles(db) {
  const donnees = await formulaire({
    titre: 'Modèles de messages',
    champs: [
      {
        cle: 'messageProvision',
        label: 'Appel de provision (nominatif)',
        type: 'textarea',
        lignes: 12,
        valeur: db.parametres.messageProvision,
      },
      {
        cle: 'messageGroupe',
        label: 'Message au groupe WhatsApp',
        type: 'textarea',
        lignes: 8,
        valeur: db.parametres.messageGroupe,
      },
    ],
    apres: `<p class="champ__aide champ__aide--bloc">Variables disponibles : {nom} {prenom} {lot} {tantiemes} {montant} {echeance} {periode} {numero} {communication} {iban} {syndic} {gestionnaire} {annee} — et pour le groupe : {date} {solde} {depenses} {budget} {consommation} {provisions} {commentaire}.</p>`,
  });
  if (!donnees) return;
  maj((d) => Object.assign(d.parametres, donnees));
  toast('Modèles enregistrés');
}

async function reinitialiseModeles(db) {
  const ok = await confirme('Revenir aux modèles de messages fournis par défaut ?', { valider: 'Réinitialiser' });
  if (!ok) return;
  maj((d) => {
    d.parametres.messageProvision = MODELE_MESSAGE_PROVISION;
    d.parametres.messageGroupe = MODELE_MESSAGE_GROUPE;
  });
  toast('Modèles réinitialisés');
}

async function editeCategorie(db, id = null) {
  const c = id ? db.categories.find((x) => x.id === id) : null;
  const utilisee = c ? db.operations.some((o) => o.categorieId === c.id) || db.budget.some((b) => b.categorieId === c.id) : false;

  const donnees = await formulaire({
    titre: c ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    supprimer: c && !utilisee ? { message: `Supprimer « ${c.nom} » ?` } : null,
    champs: [
      { cle: 'nom', label: 'Nom', type: 'text', valeur: c ? c.nom : '', requis: true },
      {
        cle: 'type',
        label: 'Type',
        type: 'select',
        valeur: c ? c.type : 'depense',
        options: [
          { valeur: 'depense', label: 'Dépense' },
          { valeur: 'recette', label: 'Recette' },
        ],
      },
      { cle: 'couleur', label: 'Couleur', type: 'color', valeur: c ? c.couleur : '#2f6f8f' },
    ],
    apres: utilisee ? '<p class="champ__aide champ__aide--bloc">Cette catégorie est utilisée : elle ne peut pas être supprimée, seulement renommée.</p>' : '',
  });
  if (!donnees) return;

  if (donnees.__supprimer && c) {
    maj((d) => {
      d.categories = d.categories.filter((x) => x.id !== c.id);
    });
    toast('Catégorie supprimée');
    return;
  }

  maj((d) => {
    if (c) {
      const cible = d.categories.find((x) => x.id === c.id);
      Object.assign(cible, { nom: donnees.nom.trim(), type: donnees.type, couleur: donnees.couleur });
    } else {
      d.categories.push({ id: uid('cat'), nom: donnees.nom.trim(), type: donnees.type, couleur: donnees.couleur });
    }
  });
  toast('Catégories mises à jour');
}

function gereCategories(db) {
  const contenu = `<ul class="liste">
      ${db.categories
        .map(
          (c) => `<li class="liste__ligne" data-categorie="${c.id}">
            <span class="pastille" style="background:${c.couleur}"></span>
            <div class="liste__principal">
              <span class="liste__titre">${echappe(c.nom)}</span>
              <span class="liste__sous">${c.type === 'recette' ? 'Recette' : 'Dépense'}</span>
            </div>
          </li>`,
        )
        .join('')}
    </ul>`;

  return feuille({
    titre: 'Catégories',
    contenu,
    pleinEcran: true,
    surMontage: ({ corps }) => {
      delegue(corps, 'click', '[data-categorie]', (e, cible) => editeCategorie(db, cible.dataset.categorie));
    },
    actions: [{ label: '+ Ajouter', style: 'primaire', action: () => editeCategorie(db) }],
  });
}

export function rendu(conteneur, ctx) {
  const { db } = ctx;
  const jours = joursDepuisSauvegarde();
  const annees = anneesConnues(db);

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">Sauvegarde</h2>
      <p class="note ${jours === null || jours > 21 ? 'note--alerte' : ''}">
        ${
          db.sauvegardeLe
            ? `Dernière sauvegarde exportée le ${echappe(dateLongue(db.sauvegardeLe.slice(0, 10)))}${jours !== null ? ` (il y a ${jours} jour${jours > 1 ? 's' : ''})` : ''}.`
            : "Aucune sauvegarde n'a encore été exportée."
        }
        Les données vivent dans la mémoire de ce navigateur : exportez un fichier régulièrement et rangez-le dans Fichiers ou iCloud.
      </p>
      <div class="boutons-ligne">
        <button class="bouton bouton--primaire" data-exporter>⬇︎ Exporter une sauvegarde</button>
        <label class="bouton">⬆︎ Restaurer<input type="file" accept="application/json,.json" hidden data-importer></label>
      </div>
    </section>

    <section class="carte carte--liste">
      <h2 class="carte__titre">Syndic</h2>
      <ul class="liste">
        <li class="liste__ligne" data-identite>
          <div class="liste__principal"><span class="liste__titre">${echappe(db.parametres.syndic || 'Nom à renseigner')}</span>
          <span class="liste__sous">${echappe(db.parametres.adresse || 'Adresse, gestionnaire, IBAN')}</span></div>
          <span class="chevron">›</span>
        </li>
      </ul>
    </section>

    <section class="carte carte--liste">
      <h2 class="carte__titre">Exercices</h2>
      <ul class="liste">
        ${annees
          .map((a) => {
            const t = totaux(db, a);
            return `<li class="liste__ligne" data-exercice="${a}">
              <div class="liste__principal">
                <span class="liste__titre">Exercice ${a}${a === db.parametres.exerciceCourant ? ' · courant' : ''}</span>
                <span class="liste__sous">ouverture ${echappe(euros(t.ouverture))} · clôture ${echappe(euros(t.solde))}</span>
              </div>
              <span class="chevron">›</span>
            </li>`;
          })
          .join('')}
      </ul>
      <div class="boutons-ligne">
        <button class="bouton" data-nouvel-exercice>Ouvrir l'exercice suivant</button>
      </div>
    </section>

    <section class="carte carte--liste">
      <h2 class="carte__titre">Lecture automatique des relevés</h2>
      <ul class="liste">
        <li class="liste__ligne" data-gemini>
          <div class="liste__principal"><span class="liste__titre">Clé API Gemini</span>
          <span class="liste__sous">${db.parametres.cleGemini ? `enregistrée (${echappe(db.parametres.modeleGemini)})` : 'non renseignée'}</span></div>
          <span class="chevron">›</span>
        </li>
      </ul>
    </section>

    <section class="carte carte--liste">
      <h2 class="carte__titre">Messages WhatsApp</h2>
      <ul class="liste">
        <li class="liste__ligne" data-modeles>
          <div class="liste__principal"><span class="liste__titre">Modèles d'appel et de groupe</span>
          <span class="liste__sous">Texte envoyé nominativement aux copropriétaires</span></div>
          <span class="chevron">›</span>
        </li>
      </ul>
      <div class="boutons-ligne">
        <button class="bouton" data-modeles-defaut>Rétablir les modèles par défaut</button>
      </div>
    </section>

    <section class="carte carte--liste">
      <h2 class="carte__titre">Catégories</h2>
      <ul class="liste">
        <li class="liste__ligne" data-categories>
          <div class="liste__principal"><span class="liste__titre">${db.categories.length} catégories</span>
          <span class="liste__sous">Postes de dépenses et de recettes</span></div>
          <span class="chevron">›</span>
        </li>
      </ul>
    </section>

    <section class="carte">
      <h2 class="carte__titre">Données</h2>
      <div class="boutons-ligne">
        <button class="bouton" data-demo>Charger un jeu d'essai</button>
        <button class="bouton bouton--danger-discret" data-effacer>Tout effacer</button>
      </div>
      <p class="note">Le jeu d'essai remplace les données actuelles par une copropriété fictive de 6 lots, utile pour se familiariser avant la vraie saisie.</p>
    </section>

    <section class="carte carte--apropos">
      <p><strong>Syndic L'Ancienne École</strong> — gestion de copropriété hors ligne.</p>
      <p class="note">Aucune donnée n'est envoyée sur un serveur, à l'exception des photos de relevés transmises à l'API Gemini au moment de l'analyse.</p>
    </section>
  `;

  delegue(conteneur, 'click', '[data-exporter]', () => exporteJSON());
  conteneur.querySelector('[data-importer]').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    const fusion = await feuille({
      titre: 'Restaurer',
      contenu: '<p class="texte-modale">Remplacer intégralement les données actuelles, ou compléter avec ce qui manque ?</p>',
      actions: [
        { label: 'Annuler', style: 'discret', valeur: null },
        { label: 'Compléter', style: 'discret', valeur: 'fusion' },
        { label: 'Remplacer', style: 'primaire', valeur: 'remplace' },
      ],
    });
    if (!fusion) return;
    try {
      await importeJSON(fichier, { fusion: fusion === 'fusion' });
      toast('Données restaurées');
    } catch (err) {
      toast(`Import impossible : ${err.message}`, 'erreur');
    }
  });

  delegue(conteneur, 'click', '[data-identite]', () => editeIdentite(db));
  delegue(conteneur, 'click', '[data-exercice]', (e, cible) => editeExercice(db, Number(cible.dataset.exercice)));
  delegue(conteneur, 'click', '[data-nouvel-exercice]', () => ouvreExerciceSuivant(db));
  delegue(conteneur, 'click', '[data-gemini]', () => editeGemini(db));
  delegue(conteneur, 'click', '[data-modeles]', () => editeModeles(db));
  delegue(conteneur, 'click', '[data-modeles-defaut]', () => reinitialiseModeles(db));
  delegue(conteneur, 'click', '[data-categories]', () => gereCategories(db));
  delegue(conteneur, 'click', '[data-demo]', async () => {
    const ok = await confirme("Remplacer les données actuelles par le jeu d'essai ?", { valider: 'Charger' });
    if (ok) {
      chargeJeuDemo();
      toast("Jeu d'essai chargé");
    }
  });
  delegue(conteneur, 'click', '[data-effacer]', async () => {
    const ok = await confirme(
      'Effacer définitivement toutes les données de cette application ? Exportez une sauvegarde avant si besoin.',
      { valider: 'Tout effacer' },
    );
    if (ok) {
      reinitialise();
      toast('Données effacées');
    }
  });
}
