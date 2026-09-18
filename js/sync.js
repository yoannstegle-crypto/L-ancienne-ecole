// Synchronisation des données avec Google Drive.
//
// Le principe tient en une phrase : chaque modification fait avancer un
// compteur de révision, et on retient la révision de la dernière synchro
// réussie. En comparant trois nombres — local, distant, dernière synchro —
// on sait sans ambiguïté qui a bougé, et si les deux ont bougé en même temps.

import * as drive from './drive.js';
import { etat, maj, remplaceTout } from './store.js';

const ETAT = {
  enCours: false,
  message: '',
  erreur: '',
  connecte: false,
};

const abonnes = new Set();
let minuteur = null;

export function abonneSync(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

function annonce(message = '', erreur = '') {
  ETAT.message = message;
  ETAT.erreur = erreur;
  ETAT.connecte = drive.jetonValide();
  abonnes.forEach((fn) => {
    try {
      fn(etatSync());
    } catch (err) {
      console.error(err);
    }
  });
}

export function etatSync() {
  const db = etat();
  const sync = db.sync || {};
  return {
    ...ETAT,
    actif: !!sync.actif,
    configure: !!db.parametres.googleClientId,
    fichierId: sync.fichierId || null,
    dateSync: sync.dateSync || null,
    revision: Number(db.revision) || 0,
    revisionSynchronisee: Number(sync.revisionSynchronisee) || 0,
    enAttente: (Number(db.revision) || 0) > (Number(sync.revisionSynchronisee) || 0),
  };
}

function enregistreSynchro({ fichierId, revision }) {
  maj(
    (d) => {
      d.sync = {
        ...d.sync,
        actif: true,
        fichierId,
        revisionSynchronisee: revision,
        dateSync: new Date().toISOString(),
        derniereErreur: null,
      };
    },
    { sansRevision: true },
  );
}

function enregistreErreur(message) {
  maj(
    (d) => {
      d.sync = { ...d.sync, derniereErreur: message };
    },
    { sansRevision: true, silencieux: true },
  );
}

/** Ouvre la fenêtre de connexion Google puis fait une première synchronisation. */
export async function connecte({ interactif = true } = {}) {
  const db = etat();
  const clientId = db.parametres.googleClientId;
  if (!clientId) throw new drive.ErreurDrive("Renseignez d'abord l'identifiant client Google dans les réglages.");
  await drive.connecte(clientId, { interactif });
  annonce('Connecté à Google Drive');
  return synchronise({ interactif });
}

export function deconnecte() {
  drive.deconnecte();
  maj(
    (d) => {
      d.sync = { ...d.sync, actif: false };
    },
    { sansRevision: true },
  );
  annonce('Déconnecté de Google Drive');
}

/**
 * Compare l'état local et l'état distant, et agit en conséquence.
 *
 * `resolution` tranche un conflit : 'local' écrase le Drive avec le
 * téléphone, 'distant' fait l'inverse. Sans résolution, un conflit est
 * signalé et rien n'est écrit — jamais de perte silencieuse.
 */
export async function synchronise({ interactif = false, resolution = null } = {}) {
  if (ETAT.enCours) return { etat: 'en_cours' };
  const db = etat();
  const clientId = db.parametres.googleClientId;
  if (!clientId) return { etat: 'non_configure' };

  ETAT.enCours = true;
  annonce('Synchronisation…');

  try {
    await drive.connecte(clientId, { interactif });

    const revisionLocale = Number(db.revision) || 0;
    const revisionSynchro = Number((db.sync || {}).revisionSynchronisee) || 0;

    let distant = null;
    const idConnu = (db.sync || {}).fichierId;
    if (idConnu) {
      // Le fichier peut avoir été supprimé ou mis à la corbeille entre-temps.
      distant = await drive.metadonnees(idConnu).catch(() => null);
    }
    if (!distant) distant = await drive.chercheFichier();

    // Premier envoi : le fichier n'existe pas encore dans le Drive.
    if (!distant) {
      const cree = await drive.cree(etat(), revisionLocale);
      enregistreSynchro({ fichierId: cree.id, revision: revisionLocale });
      ETAT.enCours = false;
      annonce('Fichier créé dans votre Drive');
      return { etat: 'cree', fichierId: cree.id };
    }

    const revisionDistante = distant.revision;
    const localModifie = revisionLocale > revisionSynchro;
    const distantModifie = revisionDistante !== revisionSynchro;

    if (!localModifie && !distantModifie) {
      enregistreSynchro({ fichierId: distant.id, revision: revisionSynchro });
      ETAT.enCours = false;
      annonce('Déjà à jour');
      return { etat: 'a_jour' };
    }

    if (localModifie && distantModifie && !resolution) {
      ETAT.enCours = false;
      const details = {
        etat: 'conflit',
        local: { revision: revisionLocale, modifieLe: db.modifieLe },
        distant: { revision: revisionDistante, modifieLe: distant.modifieLe },
      };
      annonce('', 'Les deux versions ont été modifiées depuis la dernière synchronisation.');
      return details;
    }

    const envoyer = resolution === 'local' || (localModifie && !distantModifie);

    if (envoyer) {
      const aJour = etat();
      const revision = Number(aJour.revision) || 0;
      await drive.ecrit(distant.id, aJour, revision);
      enregistreSynchro({ fichierId: distant.id, revision });
      ETAT.enCours = false;
      annonce('Données envoyées vers le Drive');
      return { etat: 'envoye' };
    }

    const contenu = await drive.lit(distant.id);
    if (!contenu || typeof contenu !== 'object' || !Array.isArray(contenu.operations)) {
      throw new drive.ErreurDrive('Le fichier du Drive est illisible ou ne contient pas de données valides.');
    }
    const revision = Number(contenu.revision) || distant.revision || 0;
    contenu.revision = revision;
    contenu.sync = {
      ...(etat().sync || {}),
      actif: true,
      fichierId: distant.id,
      revisionSynchronisee: revision,
      dateSync: new Date().toISOString(),
      derniereErreur: null,
    };
    remplaceTout(contenu);
    ETAT.enCours = false;
    annonce('Données récupérées depuis le Drive');
    return { etat: 'recu' };
  } catch (err) {
    ETAT.enCours = false;
    const message = err && err.message ? err.message : String(err);
    enregistreErreur(message);
    annonce('', message);
    if (err instanceof drive.ErreurDrive) return { etat: 'erreur', message, reconnexion: err.reconnexion };
    return { etat: 'erreur', message };
  }
}

/**
 * Envoi différé après une saisie : on attend que l'utilisateur ait fini de
 * pianoter plutôt que d'écrire dans le Drive à chaque frappe.
 */
export function programmeSync(delai = 4000) {
  const { actif, configure } = etatSync();
  if (!actif || !configure) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => {
    if (!etatSync().enAttente) return;
    synchronise({ interactif: false }).catch(() => {
      /* l'erreur est déjà consignée et affichée */
    });
  }, delai);
}

/** Reprise silencieuse au démarrage, si une synchro était active. */
export async function reprend() {
  const { actif, configure } = etatSync();
  if (!actif || !configure) return null;
  try {
    return await synchronise({ interactif: false });
  } catch {
    return null;
  }
}

export const lienFichier = drive.lienFichier;
