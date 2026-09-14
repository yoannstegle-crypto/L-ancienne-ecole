// Coque de l'application : en-tête, navigation, routage par ancre et
// réaffichage à chaque modification des données.

import { anneesConnues } from './model.js';
import { abonne, charger, maj } from './store.js';
import { echappe } from './format.js';

import * as vueAccueil from './views/dashboard.js';
import * as vueCompte from './views/compte.js';
import * as vueBudget from './views/budget.js';
import * as vueCopro from './views/copro.js';
import * as vueRapport from './views/rapport.js';
import * as vueReglages from './views/reglages.js';
import * as vueScan from './views/scan.js';

const VUES = {
  accueil: { module: vueAccueil, titre: 'Tableau de bord' },
  compte: { module: vueCompte, titre: 'Compte du syndic' },
  budget: { module: vueBudget, titre: 'Budget' },
  copro: { module: vueCopro, titre: 'Copropriété' },
  rapport: { module: vueRapport, titre: 'Rapports' },
  reglages: { module: vueReglages, titre: 'Réglages' },
  scan: { module: vueScan, titre: 'Scanner un relevé' },
};

const ONGLETS = [
  { cle: 'accueil', label: 'Accueil', icone: '🏠', route: '#/accueil' },
  { cle: 'compte', label: 'Compte', icone: '🧾', route: '#/compte' },
  { cle: 'budget', label: 'Budget', icone: '📊', route: '#/budget' },
  { cle: 'copro', label: 'Copro', icone: '👥', route: '#/copro' },
  { cle: 'rapport', label: 'Rapport', icone: '📄', route: '#/rapport' },
];

let route = { vue: 'accueil', sousVue: '' };

function litRoute() {
  const brut = (location.hash || '#/accueil').replace(/^#\/?/, '');
  const [vue, sousVue = ''] = brut.split('/');
  return { vue: VUES[vue] ? vue : 'accueil', sousVue };
}

export function naviguer(destination) {
  if (location.hash === destination) {
    dessine();
    return;
  }
  location.hash = destination;
}

function dessine() {
  route = litRoute();
  const db = charger();
  const annee = db.parametres.exerciceCourant || new Date().getFullYear();
  const { module, titre } = VUES[route.vue];

  document.getElementById('titre-vue').textContent = titre;
  document.title = `${titre} · ${db.parametres.syndic || 'Syndic'}`;

  // Sélecteur d'exercice
  const annees = [...new Set([...anneesConnues(db), annee])].sort((a, b) => b - a);
  const selecteur = document.getElementById('selecteur-annee');
  selecteur.innerHTML = annees.map((a) => `<option value="${a}" ${a === annee ? 'selected' : ''}>${a}</option>`).join('');
  selecteur.hidden = route.vue === 'reglages';

  // Barre de segments
  const barre = document.getElementById('segments');
  const segments = module.segments || [];
  if (segments.length) {
    barre.hidden = false;
    barre.innerHTML = segments
      .map(
        (s) =>
          `<button class="segment ${(route.sousVue || '') === s.cle ? 'segment--actif' : ''}" data-route="${s.route}">${echappe(s.label)}</button>`,
      )
      .join('');
  } else {
    barre.hidden = true;
    barre.innerHTML = '';
  }

  // Contenu. On remplace le noeud plutôt que de le vider : les vues posent
  // leurs écouteurs dessus par délégation, et un simple innerHTML = '' les
  // laisserait s'empiler à chaque rendu (un clic déclencherait N ouvertures).
  const ancien = document.getElementById('contenu');
  const contenu = ancien.cloneNode(false);
  ancien.replaceWith(contenu);
  module.rendu(contenu, {
    db,
    annee,
    sousVue: route.sousVue,
    naviguer,
    actions: {
      nouvelleOperation: () => vueCompte.editeOperation(db),
    },
  });

  // Onglets
  document.querySelectorAll('#onglets .onglet').forEach((bouton) => {
    bouton.classList.toggle('onglet--actif', bouton.dataset.vue === route.vue);
  });

  window.scrollTo({ top: 0 });
}

function installe() {
  const entete = document.getElementById('entete');

  document.getElementById('selecteur-annee').addEventListener('change', (e) => {
    maj((d) => {
      d.parametres.exerciceCourant = Number(e.target.value);
    });
  });

  document.getElementById('bouton-reglages').addEventListener('click', () => naviguer('#/reglages'));

  document.getElementById('segments').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-route]');
    if (bouton) naviguer(bouton.dataset.route);
  });

  document.getElementById('onglets').addEventListener('click', (e) => {
    const bouton = e.target.closest('.onglet');
    if (bouton) naviguer(bouton.dataset.route);
  });

  window.addEventListener('hashchange', dessine);
  abonne(() => dessine());

  // Ombre portée de l'en-tête au défilement : repère visuel discret.
  let dernierY = 0;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if ((y > 4) !== (dernierY > 4)) entete.classList.toggle('entete--flottante', y > 4);
      dernierY = y;
    },
    { passive: true },
  );

  if (!location.hash) location.hash = '#/accueil';
  dessine();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* hors ligne non disponible, sans conséquence sur le reste */
      });
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installe);
else installe();
