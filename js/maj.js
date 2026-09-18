// Mise à jour de l'application installée.
//
// Sur iOS, une app ajoutée à l'écran d'accueil ne revérifie son service worker
// qu'au lancement suivant une fermeture complète — et parfois pas même alors.
// D'où ce déclenchement manuel, seul moyen fiable de forcer la bascule.

let enregistrement = null;
let rechargementLance = false;

/** Recharge une fois et une seule, d'où que vienne la demande. */
function recharge() {
  if (rechargementLance) return;
  rechargementLance = true;
  window.location.reload();
}

/**
 * Recharge la page quand une nouvelle version prend la main.
 *
 * La toute première prise de contrôle ne compte pas : elle survient à
 * l'installation initiale, alors que la page exécute déjà le bon code.
 */
export function surveilleMisesAJour() {
  if (!('serviceWorker' in navigator)) return;
  let controleurConnu = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controleurConnu) {
      controleurConnu = navigator.serviceWorker.controller;
      return;
    }
    recharge();
  });
}

export function memoriseEnregistrement(reg) {
  enregistrement = reg;
}

async function trouveEnregistrement() {
  if (enregistrement) return enregistrement;
  if (!('serviceWorker' in navigator)) return null;
  enregistrement = await navigator.serviceWorker.getRegistration().catch(() => null);
  return enregistrement;
}

/** Attend qu'un worker en cours d'installation soit prêt à prendre la main. */
function attendInstallation(worker) {
  return new Promise((resoudre) => {
    if (worker.state === 'installed' || worker.state === 'activated') {
      resoudre();
      return;
    }
    const surChangement = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        worker.removeEventListener('statechange', surChangement);
        resoudre();
      }
    };
    worker.addEventListener('statechange', surChangement);
    // Filet de sécurité : ne jamais rester bloqué si l'installation patine.
    setTimeout(resoudre, 8000);
  });
}

/**
 * Cherche une version plus récente et l'active.
 * Renvoie 'mise_a_jour' (la page va se recharger), 'a_jour' ou 'indisponible'.
 */
export async function chercheMiseAJour() {
  const reg = await trouveEnregistrement();
  if (!reg) return 'indisponible';

  try {
    await reg.update();
  } catch {
    return 'indisponible';
  }

  const nouveau = reg.waiting || reg.installing;
  if (!nouveau) return 'a_jour';

  await attendInstallation(nouveau);
  if (reg.waiting) reg.waiting.postMessage({ type: 'prendre_la_main' });

  // On laisse à la bascule le temps de se faire, puis on recharge nous-même :
  // le bouton doit aboutir, même si l'événement de prise de contrôle se perd.
  await new Promise((resoudre) => {
    let fini = false;
    const termine = () => {
      if (fini) return;
      fini = true;
      resoudre();
    };
    navigator.serviceWorker.addEventListener('controllerchange', termine, { once: true });
    setTimeout(termine, 3000);
  });
  recharge();
  return 'mise_a_jour';
}
