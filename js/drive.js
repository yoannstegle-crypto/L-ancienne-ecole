// Accès à Google Drive depuis le navigateur, sans serveur.
//
// Le mot de passe ne transite jamais par l'application : l'utilisateur
// s'authentifie chez Google, qui renvoie un jeton temporaire (une heure).
// La permission demandée est `drive.file` : l'application ne voit QUE les
// fichiers qu'elle a elle-même créés, jamais le reste du Drive.

const PORTEE = 'https://www.googleapis.com/auth/drive.file';
const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';
const NOM_FICHIER = 'syndic-ancienne-ecole.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const API_ENVOI = 'https://www.googleapis.com/upload/drive/v3/files';

// Le jeton reste en mémoire vive : il disparaît à la fermeture de l'onglet,
// et Google le renouvelle silencieusement si la session est encore valable.
let jeton = null;
let expiration = 0;
let clientJeton = null;
let clientIdCourant = null;
let chargementScript = null;

export class ErreurDrive extends Error {
  constructor(message, { reconnexion = false } = {}) {
    super(message);
    this.name = 'ErreurDrive';
    this.reconnexion = reconnexion;
  }
}

function chargeScriptGoogle() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (chargementScript) return chargementScript;
  chargementScript = new Promise((resoudre, rejeter) => {
    const balise = document.createElement('script');
    balise.src = SCRIPT_GOOGLE;
    balise.async = true;
    balise.onload = () => resoudre();
    balise.onerror = () => {
      chargementScript = null;
      rejeter(new ErreurDrive("Impossible de charger Google : vérifiez la connexion Internet."));
    };
    document.head.appendChild(balise);
  });
  return chargementScript;
}

function clientPour(clientId) {
  if (clientJeton && clientIdCourant === clientId) return clientJeton;
  clientJeton = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: PORTEE,
    callback: () => {}, // remplacé à chaque demande
  });
  clientIdCourant = clientId;
  return clientJeton;
}

export function jetonValide() {
  return !!jeton && Date.now() < expiration - 60000;
}

/**
 * Demande un jeton d'accès.
 * `interactif: false` tente un renouvellement silencieux — il échoue si
 * l'utilisateur n'a plus de session Google ouverte dans ce navigateur,
 * auquel cas il faut repasser par le bouton de connexion.
 */
export function connecte(clientId, { interactif = true } = {}) {
  if (!clientId) throw new ErreurDrive("Aucun identifiant client Google n'est enregistré.");
  if (jetonValide()) return Promise.resolve(jeton);

  return chargeScriptGoogle().then(
    () =>
      new Promise((resoudre, rejeter) => {
        const client = clientPour(clientId);
        client.callback = (reponse) => {
          if (reponse.error) {
            rejeter(new ErreurDrive(messageErreur(reponse), { reconnexion: true }));
            return;
          }
          jeton = reponse.access_token;
          expiration = Date.now() + (Number(reponse.expires_in) || 3600) * 1000;
          resoudre(jeton);
        };
        client.error_callback = (err) => {
          rejeter(new ErreurDrive(messageErreur(err), { reconnexion: true }));
        };
        try {
          client.requestAccessToken({ prompt: interactif ? '' : 'none' });
        } catch (err) {
          rejeter(new ErreurDrive(err.message || 'Connexion impossible', { reconnexion: true }));
        }
      }),
  );
}

function messageErreur(reponse) {
  const code = reponse.error || reponse.type || '';
  if (/popup_closed|popup_failed|user_cancel|access_denied/i.test(code)) return 'Connexion annulée.';
  if (/invalid_client|idpiframe|origin/i.test(code)) {
    return "Identifiant client refusé par Google. Vérifiez qu'il est bien du type « Application Web » et que l'adresse du site figure dans les origines autorisées.";
  }
  if (code === 'none' || /interaction_required|consent_required|login_required/i.test(code)) {
    return 'Session Google expirée, reconnexion nécessaire.';
  }
  return reponse.error_description || code || 'Connexion à Google impossible.';
}

export function deconnecte() {
  const ancien = jeton;
  jeton = null;
  expiration = 0;
  if (ancien && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(ancien, () => {});
    } catch {
      /* la révocation est un confort, pas une obligation */
    }
  }
}

async function appelle(url, options = {}) {
  if (!jetonValide()) throw new ErreurDrive('Session Google expirée.', { reconnexion: true });
  const reponse = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, ...(options.headers || {}) },
  });
  if (reponse.status === 401 || reponse.status === 403) {
    const detail = await reponse.json().catch(() => ({}));
    const raison = detail.error && detail.error.message ? detail.error.message : '';
    throw new ErreurDrive(
      reponse.status === 401 ? 'Session Google expirée.' : `Accès refusé par Drive. ${raison}`.trim(),
      { reconnexion: reponse.status === 401 },
    );
  }
  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '');
    throw new ErreurDrive(`Drive a renvoyé une erreur ${reponse.status}. ${detail.slice(0, 160)}`);
  }
  return reponse;
}

/** Retrouve le fichier de données, ou null s'il n'existe pas encore. */
export async function chercheFichier() {
  const requete = new URLSearchParams({
    q: `name = '${NOM_FICHIER}' and trashed = false`,
    spaces: 'drive',
    fields: 'files(id,name,modifiedTime,appProperties,size)',
    pageSize: '10',
  });
  const reponse = await appelle(`${API}?${requete}`);
  const donnees = await reponse.json();
  const fichiers = donnees.files || [];
  if (!fichiers.length) return null;
  // Au cas où plusieurs copies traîneraient, on garde la plus récente.
  fichiers.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  return decrit(fichiers[0]);
}

export async function metadonnees(fichierId) {
  const requete = new URLSearchParams({ fields: 'id,name,modifiedTime,appProperties,size' });
  const reponse = await appelle(`${API}/${fichierId}?${requete}`);
  return decrit(await reponse.json());
}

function decrit(brut) {
  return {
    id: brut.id,
    nom: brut.name,
    modifieLe: brut.modifiedTime,
    taille: Number(brut.size) || 0,
    revision: Number((brut.appProperties || {}).revision) || 0,
  };
}

export async function lit(fichierId) {
  const reponse = await appelle(`${API}/${fichierId}?alt=media`);
  return reponse.json();
}

function corpsMultipart(metadonnees, contenu) {
  const limite = `syndic${Date.now().toString(36)}`;
  const corps =
    `--${limite}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadonnees)}\r\n` +
    `--${limite}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${contenu}\r\n` +
    `--${limite}--`;
  return { corps, type: `multipart/related; boundary=${limite}` };
}

/** Crée le fichier dans le Drive de l'utilisateur, à la racine. */
export async function cree(donnees, revision) {
  const { corps, type } = corpsMultipart(
    {
      name: NOM_FICHIER,
      mimeType: 'application/json',
      description: "Données de l'application Syndic L'Ancienne École",
      appProperties: { revision: String(revision) },
    },
    JSON.stringify(donnees, null, 2),
  );
  const requete = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,modifiedTime,appProperties,size' });
  const reponse = await appelle(`${API_ENVOI}?${requete}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: corps,
  });
  return decrit(await reponse.json());
}

export async function ecrit(fichierId, donnees, revision) {
  const { corps, type } = corpsMultipart(
    { appProperties: { revision: String(revision) } },
    JSON.stringify(donnees, null, 2),
  );
  const requete = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,modifiedTime,appProperties,size' });
  const reponse = await appelle(`${API_ENVOI}/${fichierId}?${requete}`, {
    method: 'PATCH',
    headers: { 'Content-Type': type },
    body: corps,
  });
  return decrit(await reponse.json());
}

export function lienFichier(fichierId) {
  return `https://drive.google.com/file/d/${fichierId}/view`;
}
