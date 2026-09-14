// Briques d'interface : fabrication de noeuds, notifications, feuilles modales
// et générateur de formulaire. Pensé pour le pouce, sur un écran d'iPhone.

import { echappe } from './format.js';

export function noeud(html) {
  const gabarit = document.createElement('template');
  gabarit.innerHTML = String(html).trim();
  return gabarit.content.firstElementChild;
}

export function vide(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

let minuteurToast = null;
export function toast(message, type = 'info') {
  let zone = document.getElementById('toast');
  if (!zone) {
    zone = noeud('<div id="toast" class="toast" role="status" aria-live="polite"></div>');
    document.body.appendChild(zone);
  }
  zone.textContent = message;
  zone.className = `toast toast--${type} toast--visible`;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => {
    zone.classList.remove('toast--visible');
  }, type === 'erreur' ? 5200 : 3000);
}

/**
 * Feuille modale glissant du bas (le geste attendu sur iOS).
 * `contenu` : chaîne HTML ou élément. Résout avec la valeur passée à `fermer()`.
 */
export function feuille({ titre, contenu, actions = [], surMontage = null, pleinEcran = false }) {
  return new Promise((resoudre) => {
    const fond = noeud(`
      <div class="feuille-fond" role="dialog" aria-modal="true">
        <div class="feuille ${pleinEcran ? 'feuille--plein' : ''}">
          <header class="feuille__tete">
            <h2>${echappe(titre || '')}</h2>
            <button class="bouton-icone" data-fermer aria-label="Fermer">✕</button>
          </header>
          <div class="feuille__corps"></div>
          <footer class="feuille__pied"></footer>
        </div>
      </div>`);

    const corps = fond.querySelector('.feuille__corps');
    if (typeof contenu === 'string') corps.innerHTML = contenu;
    else if (contenu) corps.appendChild(contenu);

    const pied = fond.querySelector('.feuille__pied');
    if (!actions.length) pied.remove();

    let termine = false;
    const fermer = (valeur) => {
      if (termine) return;
      termine = true;
      fond.classList.remove('feuille-fond--ouverte');
      setTimeout(() => fond.remove(), 180);
      document.body.classList.remove('sans-defilement');
      resoudre(valeur);
    };

    actions.forEach((action) => {
      const bouton = noeud(
        `<button class="bouton ${action.style ? `bouton--${action.style}` : ''}">${echappe(action.label)}</button>`,
      );
      bouton.addEventListener('click', async () => {
        if (!action.action) return fermer(action.valeur);
        const resultat = await action.action({ corps, fermer, bouton });
        if (resultat !== false) fermer(resultat);
        return undefined;
      });
      pied.appendChild(bouton);
    });

    fond.querySelector('[data-fermer]').addEventListener('click', () => fermer(undefined));
    fond.addEventListener('click', (e) => {
      if (e.target === fond) fermer(undefined);
    });

    document.body.appendChild(fond);
    document.body.classList.add('sans-defilement');
    requestAnimationFrame(() => fond.classList.add('feuille-fond--ouverte'));
    if (surMontage) surMontage({ corps, fermer });
  });
}

export function confirme(message, { titre = 'Confirmer', valider = 'Confirmer', danger = true } = {}) {
  return feuille({
    titre,
    contenu: `<p class="texte-modale">${echappe(message)}</p>`,
    actions: [
      { label: 'Annuler', style: 'discret', valeur: false },
      { label: valider, style: danger ? 'danger' : 'primaire', valeur: true },
    ],
  }).then((v) => v === true);
}

// ---------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------

function champHTML(champ) {
  const id = `champ_${champ.cle}`;
  const requis = champ.requis ? 'required' : '';
  const valeur = champ.valeur ?? '';
  let controle;

  switch (champ.type) {
    case 'select':
      controle = `<select id="${id}" name="${champ.cle}" ${requis}>
        ${(champ.options || [])
          .map(
            (o) =>
              `<option value="${echappe(o.valeur)}" ${String(o.valeur) === String(valeur) ? 'selected' : ''}>${echappe(o.label)}</option>`,
          )
          .join('')}
      </select>`;
      break;
    case 'textarea':
      controle = `<textarea id="${id}" name="${champ.cle}" rows="${champ.lignes || 4}" ${requis} placeholder="${echappe(champ.placeholder || '')}">${echappe(valeur)}</textarea>`;
      break;
    case 'checkbox':
      return `<label class="champ champ--case">
        <input type="checkbox" id="${id}" name="${champ.cle}" ${valeur ? 'checked' : ''}>
        <span>${echappe(champ.label)}</span>
      </label>`;
    case 'montant':
      controle = `<input type="text" inputmode="decimal" id="${id}" name="${champ.cle}" value="${echappe(valeur)}" placeholder="${echappe(champ.placeholder || '0,00')}" ${requis}>`;
      break;
    case 'nombre':
      controle = `<input type="number" inputmode="numeric" step="${champ.pas || 1}" id="${id}" name="${champ.cle}" value="${echappe(valeur)}" ${requis}>`;
      break;
    default:
      controle = `<input type="${champ.type || 'text'}" id="${id}" name="${champ.cle}" value="${echappe(valeur)}" placeholder="${echappe(champ.placeholder || '')}" ${champ.type === 'tel' ? 'inputmode="tel"' : ''} ${requis}>`;
  }

  return `<label class="champ">
    <span class="champ__label">${echappe(champ.label)}</span>
    ${controle}
    ${champ.aide ? `<span class="champ__aide">${echappe(champ.aide)}</span>` : ''}
  </label>`;
}

/**
 * Ouvre un formulaire en feuille modale et résout avec un objet {cle: valeur},
 * ou `undefined` si l'utilisateur annule.
 */
export function formulaire({ titre, champs, valider = 'Enregistrer', supprimer = null, apres = '' }) {
  const html = `<form class="formulaire" novalidate>${champs.map(champHTML).join('')}${apres}</form>`;
  const actions = [];
  if (supprimer) {
    actions.push({
      label: 'Supprimer',
      style: 'danger-discret',
      action: async ({ fermer }) => {
        const ok = await confirme(supprimer.message || 'Supprimer définitivement cet élément ?', {
          valider: 'Supprimer',
        });
        if (!ok) return false;
        fermer({ __supprimer: true });
        return false;
      },
    });
  }
  actions.push({ label: 'Annuler', style: 'discret', valeur: undefined });
  actions.push({
    label: valider,
    style: 'primaire',
    action: ({ corps }) => {
      const form = corps.querySelector('form');
      const donnees = {};
      let manquant = null;
      champs.forEach((champ) => {
        const controle = form.elements[champ.cle];
        if (!controle) return;
        if (champ.type === 'checkbox') donnees[champ.cle] = controle.checked;
        else donnees[champ.cle] = controle.value;
        if (champ.requis && !String(donnees[champ.cle] || '').trim()) manquant = manquant || champ;
      });
      if (manquant) {
        toast(`« ${manquant.label} » est obligatoire`, 'erreur');
        const controle = form.elements[manquant.cle];
        if (controle && controle.focus) controle.focus();
        return false;
      }
      return donnees;
    },
  });
  return feuille({ titre, contenu: html, actions });
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

/**
 * Remplace un conteneur par une copie vide de lui-même et la renvoie.
 * Indispensable avant de réafficher une vue dans le même noeud : les écouteurs
 * posés par `delegue` survivraient à un simple `innerHTML = ''` et se
 * cumuleraient à chaque rendu.
 */
export function renouvelle(conteneur) {
  const neuf = conteneur.cloneNode(false);
  conteneur.replaceWith(neuf);
  return neuf;
}

export function delegue(racine, evenement, selecteur, gestionnaire) {
  racine.addEventListener(evenement, (e) => {
    const cible = e.target.closest(selecteur);
    if (cible && racine.contains(cible)) gestionnaire(e, cible);
  });
}

export async function copie(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast('Copié dans le presse-papiers');
    return true;
  } catch {
    // Safari refuse parfois l'accès hors geste direct : on retombe sur la sélection manuelle.
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand && document.execCommand('copy');
    zone.remove();
    toast(ok ? 'Copié dans le presse-papiers' : 'Copie impossible, sélectionnez le texte à la main', ok ? 'info' : 'erreur');
    return !!ok;
  }
}

export function ouvreWhatsApp(telephone, message) {
  const url = telephone
    ? `https://wa.me/${telephone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

export function badge(texte, style = '') {
  return `<span class="badge ${style ? `badge--${style}` : ''}">${echappe(texte)}</span>`;
}
