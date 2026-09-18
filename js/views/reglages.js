// Réglages : identité du syndic, exercices, clé Gemini, modèles de messages,
// catégories et surtout la sauvegarde des données.

import { listeModeles, modeleRecommande, testeCle } from '../gemini.js';
import { dateLongue, echappe, euros, montantDepuisTexte, uid } from '../format.js';
import { anneesConnues, arrondi, exerciceVierge, MODELE_MESSAGE_GROUPE, MODELE_MESSAGE_PROVISION, totaux, VERSION_APPLI } from '../model.js';
import { chargeJeuDemo } from '../demo.js';
import { connecte as connecteDrive, deconnecte as deconnecteDrive, etatSync, lienFichier, synchronise } from '../sync.js';
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
    valider: 'Continuer',
    champs: [
      {
        cle: 'cleGemini',
        label: 'Clé API',
        type: 'text',
        valeur: db.parametres.cleGemini,
        placeholder: 'AIza…',
        aide: 'Créez-la gratuitement sur aistudio.google.com/apikey. Elle reste sur ce téléphone.',
      },
    ],
  });
  if (!donnees) return;

  const cle = donnees.cleGemini.trim();
  maj((d) => {
    d.parametres.cleGemini = cle;
  });
  if (!cle) {
    toast('Clé effacée');
    return;
  }

  toast('Recherche des modèles disponibles…');
  try {
    const modeles = await listeModeles(cle);
    if (!modeles.length) {
      toast('Aucun modèle utilisable pour cette clé', 'erreur');
      return;
    }
    await choisitModele(db, modeles, cle);
  } catch (err) {
    toast(err.message || 'Vérification impossible', 'erreur');
  }
}

/**
 * Google retire régulièrement ses anciens modèles : on propose donc ceux que
 * la clé peut réellement utiliser aujourd'hui, plutôt qu'une liste figée.
 */
async function choisitModele(db, modeles, cle) {
  const actuel = db.parametres.modeleGemini;
  const disponible = modeles.some((m) => m.id === actuel);
  const suggere = modeleRecommande(modeles);

  const donnees = await formulaire({
    titre: 'Modèle de lecture',
    valider: 'Enregistrer',
    champs: [
      {
        cle: 'modeleGemini',
        label: 'Modèle',
        type: 'select',
        valeur: disponible ? actuel : suggere,
        options: modeles.map((m) => ({
          valeur: m.id,
          label: m.id === suggere ? `${m.libelle} — recommandé` : m.libelle,
        })),
      },
    ],
    apres: `<p class="champ__aide champ__aide--bloc">${modeles.length} modèles proposés par Google pour votre clé.${
      actuel && !disponible
        ? ` Le modèle précédemment enregistré (« ${echappe(actuel)} ») n'est plus proposé : il a probablement été retiré.`
        : ''
    } En cas de doute, gardez celui marqué « recommandé » : c'est le plus récent adapté à la lecture d'un relevé.</p>`,
  });
  if (!donnees) return;

  maj((d) => {
    d.parametres.modeleGemini = donnees.modeleGemini;
  });
  toast('Vérification du modèle…');
  try {
    await testeCle(cle, donnees.modeleGemini);
    toast('Clé et modèle valides ✓');
  } catch (err) {
    toast(`Modèle refusé : ${err.message}`, 'erreur');
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

// ---------------------------------------------------------------------------
// Synchronisation Google Drive
// ---------------------------------------------------------------------------

function depuis(iso) {
  if (!iso) return 'jamais';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} jour${jours > 1 ? 's' : ''}`;
}

async function configureDrive(db) {
  const donnees = await formulaire({
    titre: 'Connexion à Google Drive',
    valider: 'Enregistrer',
    champs: [
      {
        cle: 'googleClientId',
        label: 'Identifiant client Google',
        type: 'text',
        valeur: db.parametres.googleClientId,
        placeholder: '1234567890-abc….apps.googleusercontent.com',
        aide: "Se termine par .apps.googleusercontent.com. Ce n'est pas un secret : il est prévu pour figurer dans une page web.",
      },
    ],
    apres: `<p class="champ__aide champ__aide--bloc">Pour l'obtenir : console.cloud.google.com → créer un projet → « API et services » → activer l'<b>API Google Drive</b> → « Identifiants » → créer un <b>ID client OAuth</b> de type <b>Application Web</b>, en ajoutant <b>${echappe(window.location.origin)}</b> dans les origines JavaScript autorisées. La marche à suivre détaillée est dans le README du dépôt.</p>`,
  });
  if (!donnees) return;
  maj((d) => {
    d.parametres.googleClientId = donnees.googleClientId.trim();
  });
  toast(donnees.googleClientId.trim() ? 'Identifiant enregistré' : 'Identifiant effacé');
}

/** Traite le résultat d'une synchro, y compris le cas du conflit. */
async function traite(resultat) {
  if (!resultat) return;
  if (resultat.etat === 'conflit') {
    const choix = await feuille({
      titre: 'Deux versions différentes',
      contenu: `<p class="texte-modale">Les données ont été modifiées des deux côtés depuis la dernière synchronisation. Choisissez celle à conserver — l'autre sera écrasée.</p>
        <ul class="liste">
          <li class="liste__ligne">
            <div class="liste__principal"><span class="liste__titre">Cet appareil</span>
            <span class="liste__sous">modifié ${echappe(depuis(resultat.local.modifieLe))} · révision ${resultat.local.revision}</span></div>
          </li>
          <li class="liste__ligne">
            <div class="liste__principal"><span class="liste__titre">Google Drive</span>
            <span class="liste__sous">modifié ${echappe(depuis(resultat.distant.modifieLe))} · révision ${resultat.distant.revision}</span></div>
          </li>
        </ul>
        <p class="note note--alerte">Dans le doute, annulez et exportez d'abord une sauvegarde : elle vous permettra de récupérer la version perdue.</p>`,
      actions: [
        { label: 'Annuler', style: 'discret', valeur: null },
        { label: 'Garder le Drive', style: 'discret', valeur: 'distant' },
        { label: 'Garder cet appareil', style: 'primaire', valeur: 'local' },
      ],
    });
    if (!choix) return;
    return traite(await synchronise({ interactif: true, resolution: choix }));
  }
  if (resultat.etat === 'erreur') {
    toast(resultat.message, 'erreur');
    return;
  }
  const messages = {
    cree: 'Fichier créé dans votre Drive',
    envoye: 'Données envoyées vers le Drive',
    recu: 'Données récupérées depuis le Drive',
    a_jour: 'Déjà à jour',
  };
  if (messages[resultat.etat]) toast(messages[resultat.etat]);
  return undefined;
}

function carteDrive(db) {
  const sync = etatSync();
  const erreur = (db.sync || {}).derniereErreur;

  if (!sync.configure) {
    return `<section class="carte">
      <h2 class="carte__titre">Google Drive</h2>
      <p class="note">Vos données ne vivent aujourd'hui que dans ce navigateur. En les reliant à votre Drive, vous les retrouvez sur le téléphone comme sur l'ordinateur, et la sauvegarde devient automatique.</p>
      <p class="note">Il faut d'abord créer un identifiant client chez Google — une dizaine de minutes, une seule fois.</p>
      <div class="boutons-ligne">
        <button class="bouton bouton--primaire" data-drive-config>Configurer</button>
      </div>
    </section>`;
  }

  if (!sync.actif) {
    return `<section class="carte">
      <h2 class="carte__titre">Google Drive</h2>
      <p class="note">Identifiant enregistré. Connectez-vous pour activer la synchronisation.</p>
      ${erreur ? `<p class="message-erreur">${echappe(erreur)}</p>` : ''}
      <div class="boutons-ligne">
        <button class="bouton bouton--primaire" data-drive-connexion>Se connecter à Google</button>
        <button class="bouton" data-drive-config>Modifier l'identifiant</button>
      </div>
    </section>`;
  }

  return `<section class="carte">
    <h2 class="carte__titre">Google Drive<span>${sync.enAttente ? 'modifications en attente' : 'à jour'}</span></h2>
    <div class="trio trio--encadre">
      <div><span class="trio__label">Dernière synchro</span><span class="trio__valeur">${echappe(depuis(sync.dateSync))}</span></div>
      <div><span class="trio__label">État</span><span class="trio__valeur ${sync.enAttente ? 'negatif' : 'positif'}">${sync.enAttente ? 'à envoyer' : 'synchronisé'}</span></div>
    </div>
    ${erreur ? `<p class="message-erreur">${echappe(erreur)}</p>` : ''}
    <p class="note">Les modifications partent automatiquement quelques secondes après chaque saisie.</p>
    <div class="boutons-ligne">
      <button class="bouton bouton--primaire" data-drive-sync>Synchroniser maintenant</button>
      ${sync.fichierId ? `<a class="bouton" href="${lienFichier(sync.fichierId)}" target="_blank" rel="noopener">Voir le fichier</a>` : ''}
      <button class="bouton bouton--danger-discret" data-drive-deconnexion>Se déconnecter</button>
    </div>
  </section>`;
}

export function rendu(conteneur, ctx) {
  const { db } = ctx;
  const jours = joursDepuisSauvegarde();
  const annees = anneesConnues(db);
  const syncActive = etatSync().actif;

  conteneur.innerHTML = `
    <section class="carte">
      <h2 class="carte__titre">Sauvegarde</h2>
      <p class="note ${!syncActive && (jours === null || jours > 21) ? 'note--alerte' : ''}">
        ${
          syncActive
            ? 'Vos données sont sauvegardées en continu dans Google Drive. Un export reste utile avant une manipulation risquée : il fige une copie que rien ne viendra écraser.'
            : `${
                db.sauvegardeLe
                  ? `Dernière sauvegarde exportée le ${echappe(dateLongue(db.sauvegardeLe.slice(0, 10)))}${jours !== null ? ` (il y a ${jours} jour${jours > 1 ? 's' : ''})` : ''}.`
                  : "Aucune sauvegarde n'a encore été exportée."
              } Les données vivent dans la mémoire de ce navigateur : exportez un fichier régulièrement et rangez-le dans Fichiers ou iCloud.`
        }
      </p>
      <div class="boutons-ligne">
        <button class="bouton bouton--primaire" data-exporter>⬇︎ Exporter une sauvegarde</button>
        <label class="bouton">⬆︎ Restaurer<input type="file" accept="application/json,.json" hidden data-importer></label>
      </div>
    </section>

    ${carteDrive(db)}

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
          <span class="liste__sous">${
            db.parametres.cleGemini
              ? db.parametres.modeleGemini
                ? `enregistrée · ${echappe(db.parametres.modeleGemini)}`
                : 'clé enregistrée, modèle à choisir'
              : 'non renseignée'
          }</span></div>
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
      <p><strong>Syndic L'Ancienne École</strong> — version ${VERSION_APPLI}</p>
      <p class="note">${
        syncActive
          ? "Vos données sont stockées dans ce navigateur et dans votre Google Drive personnel. Les photos de relevés sont transmises à l'API Gemini le temps de l'analyse. Aucun autre serveur n'y a accès."
          : "Aucune donnée n'est envoyée sur un serveur, à l'exception des photos de relevés transmises à l'API Gemini au moment de l'analyse."
      }</p>
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

  delegue(conteneur, 'click', '[data-drive-config]', () => configureDrive(db));
  delegue(conteneur, 'click', '[data-drive-connexion]', async () => {
    toast('Ouverture de la fenêtre Google…');
    try {
      await traite(await connecteDrive({ interactif: true }));
    } catch (err) {
      toast(err.message || 'Connexion impossible', 'erreur');
    }
  });
  delegue(conteneur, 'click', '[data-drive-sync]', async () => {
    await traite(await synchronise({ interactif: true }));
  });
  delegue(conteneur, 'click', '[data-drive-deconnexion]', async () => {
    const ok = await confirme(
      'Se déconnecter de Google Drive ? Les données restent sur cet appareil et dans le Drive, mais elles ne seront plus synchronisées.',
      { valider: 'Se déconnecter' },
    );
    if (ok) deconnecteDrive();
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
