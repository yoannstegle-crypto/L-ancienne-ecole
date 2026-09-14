// Persistance locale. Aucune donnée ne quitte le téléphone : tout vit dans
// localStorage, avec export/import JSON pour les sauvegardes et le transfert
// d'un appareil à l'autre.

import { baseVierge, VERSION_DONNEES } from './model.js';

const CLE = 'syndic-ancienne-ecole/v1';
const CLE_SECOURS = 'syndic-ancienne-ecole/v1.backup';

let db = null;
const abonnes = new Set();

function migre(donnees) {
  const base = baseVierge();
  const sortie = {
    ...base,
    ...donnees,
    parametres: { ...base.parametres, ...(donnees.parametres || {}) },
  };
  // Garantit la présence de tous les tableaux même si un import est partiel.
  ['exercices', 'categories', 'lots', 'budget', 'operations', 'factures', 'appels', 'rapports'].forEach((cle) => {
    if (!Array.isArray(sortie[cle])) sortie[cle] = base[cle];
  });
  if (!sortie.exercices.length) sortie.exercices = base.exercices;
  sortie.version = VERSION_DONNEES;
  return sortie;
}

export function charger() {
  if (db) return db;
  try {
    const brut = localStorage.getItem(CLE);
    db = brut ? migre(JSON.parse(brut)) : baseVierge();
  } catch (err) {
    console.error('Lecture des données impossible, tentative de secours', err);
    try {
      const secours = localStorage.getItem(CLE_SECOURS);
      db = secours ? migre(JSON.parse(secours)) : baseVierge();
    } catch {
      db = baseVierge();
    }
  }
  return db;
}

export function etat() {
  return db || charger();
}

/**
 * Applique une modification puis persiste et prévient les vues.
 * `modifier(db)` reçoit l'objet courant et le mute directement.
 */
export function maj(modifier, { silencieux = false } = {}) {
  const courant = etat();
  modifier(courant);
  courant.modifieLe = new Date().toISOString();
  persiste(courant);
  if (!silencieux) notifie();
  return courant;
}

function persiste(courant) {
  try {
    const serialise = JSON.stringify(courant);
    // Copie de secours avant écrasement : si l'écriture principale casse
    // (quota, onglet tué en plein vol), on garde l'état précédent.
    const precedent = localStorage.getItem(CLE);
    if (precedent) localStorage.setItem(CLE_SECOURS, precedent);
    localStorage.setItem(CLE, serialise);
  } catch (err) {
    console.error('Écriture impossible', err);
    alert(
      "Impossible d'enregistrer les données (mémoire du navigateur pleine ou navigation privée).\n" +
        'Exportez une sauvegarde depuis Réglages avant de continuer.',
    );
  }
}

export function abonne(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

export function notifie() {
  abonnes.forEach((fn) => {
    try {
      fn(etat());
    } catch (err) {
      console.error(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Sauvegarde / restauration
// ---------------------------------------------------------------------------

export function nomFichierSauvegarde() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `syndic-ancienne-ecole_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export function exporteJSON() {
  const courant = etat();
  const contenu = JSON.stringify(courant, null, 2);
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichierSauvegarde();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  maj((d) => {
    d.sauvegardeLe = new Date().toISOString();
  });
}

export async function importeJSON(fichier, { fusion = false } = {}) {
  const texte = await fichier.text();
  const donnees = JSON.parse(texte);
  if (!donnees || typeof donnees !== 'object') throw new Error('Fichier illisible');
  if (!fusion) {
    db = migre(donnees);
    persiste(db);
    notifie();
    return db;
  }
  // Fusion : on ajoute ce qui n'existe pas déjà (comparaison sur l'identifiant).
  return maj((courant) => {
    ['lots', 'operations', 'factures', 'appels', 'budget', 'rapports'].forEach((cle) => {
      const existants = new Set(courant[cle].map((x) => x.id));
      (donnees[cle] || []).forEach((item) => {
        if (item && item.id && !existants.has(item.id)) courant[cle].push(item);
      });
    });
    (donnees.exercices || []).forEach((ex) => {
      if (!courant.exercices.some((e) => e.annee === ex.annee)) courant.exercices.push(ex);
    });
  });
}

/** Nombre de jours depuis la dernière sauvegarde exportée (null si jamais). */
export function joursDepuisSauvegarde() {
  const d = etat().sauvegardeLe;
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function reinitialise() {
  db = baseVierge();
  persiste(db);
  notifie();
  return db;
}
