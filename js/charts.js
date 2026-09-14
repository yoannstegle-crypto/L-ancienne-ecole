// Graphiques en SVG pur : aucune bibliothèque, aucun CDN, et surtout
// un rendu vectoriel net à l'impression (« Partager → Imprimer → PDF » sur iPhone).

import { echappe, euros, eurosCourt, MOIS_COURT, pourcent } from './format.js';

// Les couleurs passent par les variables CSS : elles cascadent jusque dans le
// SVG en ligne, ce qui donne des graphiques lisibles en thème clair comme en
// thème sombre, et remis au noir sur blanc à l'impression.
const GRIS = 'var(--graphe-gris)';
const GRIS_TEXTE = 'var(--encre-douce)';
const ENCRE = 'var(--encre)';
const TRAIT = 'var(--graphe-trait)';
const POSITIF = 'var(--positif)';
const NEGATIF = 'var(--negatif)';
const ATTENTION = 'var(--attention)';

/**
 * Largeur du repère de dessin, calée sur l'écran.
 * Un viewBox de 680 réduit à 350 px sur un iPhone diviserait la taille du
 * texte par deux : on dessine donc à la taille réelle d'affichage.
 */
function largeurUtile(max = 680) {
  const dispo = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 720;
  return Math.round(Math.max(300, Math.min(max, dispo - 56)));
}

/** Coupe une étiquette trop longue pour la place disponible. */
function tronque(texte, maximum) {
  const s = String(texte);
  return s.length > maximum ? `${s.slice(0, maximum - 1).trimEnd()}…` : s;
}

function svg(largeur, hauteur, contenu, classe = '') {
  // Pas d'attribut `height` : le viewBox et la règle CSS `height: auto`
  // donnent un rendu fluide, alors que height="auto" est invalide en SVG.
  return `<svg class="graphe ${classe}" viewBox="0 0 ${largeur} ${hauteur}" width="100%" role="img" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${contenu}</svg>`;
}

function vide(message, hauteur = 120) {
  return svg(
    320,
    hauteur,
    `<text x="160" y="${hauteur / 2}" text-anchor="middle" font-size="13" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(message)}</text>`,
    'graphe-vide',
  );
}

// ---------------------------------------------------------------------------
// Camembert (anneau) — répartition des dépenses en temps réel
// ---------------------------------------------------------------------------

function pointCercle(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/**
 * @param {{label:string, valeur:number, couleur:string}[]} parts
 */
export function anneau(parts, { titre = 'Total', taille = 260, epaisseur = 46, legende = true } = {}) {
  const donnees = parts.filter((p) => p.valeur > 0);
  const total = donnees.reduce((s, p) => s + p.valeur, 0);
  if (!total) return vide('Aucune dépense enregistrée');

  const largeur = taille;
  const hauteurLegende = legende ? Math.ceil(donnees.length / 1) * 20 + 8 : 0;
  const hauteur = taille + hauteurLegende;
  const cx = taille / 2;
  const cy = taille / 2;
  const rExt = taille / 2 - 6;
  const rInt = rExt - epaisseur;

  let angle = -Math.PI / 2;
  const arcs = donnees
    .map((p) => {
      const portion = p.valeur / total;
      // Un secteur de 360° ne peut pas se dessiner en un seul arc : on le ferme en anneau plein.
      if (portion >= 0.9999) {
        return `<circle cx="${cx}" cy="${cy}" r="${(rExt + rInt) / 2}" fill="none" stroke="${p.couleur}" stroke-width="${epaisseur}"/>`;
      }
      const delta = portion * Math.PI * 2;
      const fin = angle + delta;
      const grand = delta > Math.PI ? 1 : 0;
      const [x1, y1] = pointCercle(cx, cy, rExt, angle);
      const [x2, y2] = pointCercle(cx, cy, rExt, fin);
      const [x3, y3] = pointCercle(cx, cy, rInt, fin);
      const [x4, y4] = pointCercle(cx, cy, rInt, angle);
      angle = fin;
      return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rExt} ${rExt} 0 ${grand} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rInt} ${rInt} 0 ${grand} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${p.couleur}" stroke="var(--surface)" stroke-width="1.5"/>`;
    })
    .join('');

  const centre = `
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(titre)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="17" font-weight="600" fill="${ENCRE}" font-family="system-ui, sans-serif">${echappe(eurosCourt(total))}</text>`;

  // La légende tient sur une ligne par poste : on rogne le libellé pour qu'il
  // ne vienne jamais buter contre le montant aligné à droite.
  const items = legende
    ? donnees
        .map((p, i) => {
          const y = taille + 12 + i * 20;
          const chiffres = `${eurosCourt(p.valeur)} · ${pourcent(p.valeur, total, 0)}`;
          const placeLibelle = largeur - 26 - chiffres.length * 6.1;
          return `<rect x="4" y="${y - 9}" width="11" height="11" rx="2.5" fill="${p.couleur}"/>
      <text x="22" y="${y}" font-size="11.5" fill="${ENCRE}" font-family="system-ui, sans-serif">${echappe(tronque(p.label, Math.max(8, Math.floor(placeLibelle / 6.2))))}</text>
      <text x="${largeur - 4}" y="${y}" text-anchor="end" font-size="11.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(chiffres)}</text>`;
        })
        .join('')
    : '';

  return svg(largeur, hauteur, arcs + centre + items, 'graphe-anneau');
}

// ---------------------------------------------------------------------------
// Budget vs réalisé — barres horizontales appairées
// ---------------------------------------------------------------------------

/**
 * @param {{nom:string, budget:number, realise:number, couleur:string}[]} lignes
 */
export function budgetVsRealise(lignes, { largeur = largeurUtile() } = {}) {
  const donnees = lignes.filter((l) => l.budget || l.realise);
  if (!donnees.length) return vide('Aucun budget ni dépense sur cet exercice');

  const hauteurLigne = 46;
  const hauteurBarre = 11;
  const haut = 24;
  const hauteur = haut + donnees.length * hauteurLigne + 8;
  const max = Math.max(...donnees.map((l) => Math.max(l.budget, l.realise))) || 1;

  const corps = donnees
    .map((l, i) => {
      const y = haut + i * hauteurLigne;
      const lb = Math.max(2, (l.budget / max) * largeur);
      const lr = Math.max(2, (l.realise / max) * largeur);
      const depassement = l.realise > l.budget && l.budget > 0;
      const couleurRealise = depassement ? NEGATIF : l.couleur || TRAIT;
      // Les chiffres se placent sur la ligne du titre : les barres occupent
      // ainsi toute la largeur, y compris sur un écran de téléphone.
      const chiffres = `${eurosCourt(l.realise)} / ${eurosCourt(l.budget)}`;
      const placeNom = Math.max(8, Math.floor((largeur - chiffres.length * 6 - 14) / 6.4));
      return `
      <text x="0" y="${y + 1}" font-size="11.5" font-weight="600" fill="${ENCRE}" font-family="system-ui, sans-serif">${echappe(tronque(l.nom, placeNom))}</text>
      <text x="${largeur}" y="${y + 1}" text-anchor="end" font-size="11" font-family="system-ui, sans-serif"><tspan font-weight="700" fill="${couleurRealise}">${echappe(eurosCourt(l.realise))}</tspan><tspan fill="${GRIS_TEXTE}"> / ${echappe(eurosCourt(l.budget))}</tspan></text>
      <rect x="0" y="${y + 8}" width="${lb.toFixed(1)}" height="${hauteurBarre}" rx="3" fill="${GRIS}"/>
      <rect x="0" y="${y + 23}" width="${lr.toFixed(1)}" height="${hauteurBarre}" rx="3" fill="${couleurRealise}"/>`;
    })
    .join('');

  const legende = `
    <rect x="0" y="3" width="10" height="10" rx="2.5" fill="${GRIS}"/>
    <text x="15" y="12" font-size="10.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Budgété</text>
    <rect x="70" y="3" width="10" height="10" rx="2.5" fill="var(--graphe-trait)"/>
    <text x="85" y="12" font-size="10.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Réalisé</text>
    <rect x="138" y="3" width="10" height="10" rx="2.5" fill="var(--negatif)"/>
    <text x="153" y="12" font-size="10.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Dépassement</text>`;

  return svg(largeur, hauteur, legende + corps, 'graphe-budget');
}

// ---------------------------------------------------------------------------
// Évolution du solde sur l'année
// ---------------------------------------------------------------------------

/**
 * @param {{recettes:number, depenses:number, solde:number}[]} mois  12 entrées
 */
export function evolutionSolde(mois, { ouverture = 0, largeur = largeurUtile(), hauteur = 250, moisRenseignes = 12 } = {}) {
  if (!mois || !mois.length) return vide('Aucune donnée');

  const serie = [ouverture, ...mois.slice(0, moisRenseignes).map((m) => m.solde)];
  const margeG = 48;
  const margeD = 10;
  const margeH = 16;
  const margeB = 30;
  const l = largeur - margeG - margeD;
  const h = hauteur - margeH - margeB;

  let min = Math.min(...serie, 0);
  let max = Math.max(...serie, 0);
  if (max === min) max = min + 1000;
  const marge = (max - min) * 0.12;
  min -= marge;
  max += marge;

  const x = (i) => margeG + (serie.length === 1 ? l / 2 : (i / (serie.length - 1)) * l);
  const y = (v) => margeH + h - ((v - min) / (max - min)) * h;

  // Grille horizontale sur 5 niveaux, avec le zéro toujours matérialisé.
  let grille = '';
  for (let i = 0; i <= 4; i += 1) {
    const valeur = min + ((max - min) * i) / 4;
    const py = y(valeur);
    grille += `<line x1="${margeG}" y1="${py.toFixed(1)}" x2="${largeur - margeD}" y2="${py.toFixed(1)}" stroke="${GRIS}" stroke-width="0.6" stroke-dasharray="3 3"/>
    <text x="${margeG - 6}" y="${(py + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(eurosCourt(valeur))}</text>`;
  }
  if (min < 0 && max > 0) {
    grille += `<line x1="${margeG}" y1="${y(0).toFixed(1)}" x2="${largeur - margeD}" y2="${y(0).toFixed(1)}" stroke="var(--negatif)" stroke-width="1"/>`;
  }

  const points = serie.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const aire = `M ${x(0).toFixed(1)} ${y(min + (max - min) * 0).toFixed(1)}`;
  const bas = margeH + h;
  const chemin = `M ${x(0).toFixed(1)} ${bas} L ${points.split(' ').join(' L ')} L ${x(serie.length - 1).toFixed(1)} ${bas} Z`;

  const etiquettes = ['Ouv.', ...MOIS_COURT.slice(0, moisRenseignes)]
    .map((m, i) => {
      // Sur mobile on n'affiche qu'un mois sur deux pour éviter le chevauchement.
      const afficher = serie.length <= 8 || i % 2 === 0;
      if (!afficher) return '';
      return `<text x="${x(i).toFixed(1)}" y="${hauteur - 10}" text-anchor="middle" font-size="9.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(m)}</text>`;
    })
    .join('');

  const pastilles = serie
    .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="var(--surface)" stroke="var(--graphe-trait)" stroke-width="2"/>`)
    .join('');

  const dernier = serie[serie.length - 1];
  const etiquetteFin = `<text x="${(x(serie.length - 1) - 4).toFixed(1)}" y="${(y(dernier) - 10).toFixed(1)}" text-anchor="end" font-size="11.5" font-weight="700" fill="${ENCRE}" font-family="system-ui, sans-serif">${echappe(eurosCourt(dernier))}</text>`;

  return svg(
    largeur,
    hauteur,
    `<defs><linearGradient id="degradeSolde" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--graphe-trait)" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--graphe-trait)" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${grille}
    <path d="${chemin}" fill="url(#degradeSolde)"/>
    <polyline points="${points}" fill="none" stroke="var(--graphe-trait)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${pastilles}${etiquetteFin}${etiquettes}${aire ? '' : ''}`,
    'graphe-solde',
  );
}

// ---------------------------------------------------------------------------
// Recettes / dépenses par mois
// ---------------------------------------------------------------------------

export function fluxMensuels(mois, { largeur = largeurUtile(), hauteur = 190 } = {}) {
  const max = Math.max(...mois.map((m) => Math.max(m.recettes, m.depenses)), 1);
  const margeG = 46;
  const margeB = 26;
  const margeH = 22;
  const l = largeur - margeG - 12;
  const h = hauteur - margeH - margeB;
  const pas = l / 12;
  const largeurBarre = Math.min(12, pas / 2.6);

  let corps = '';
  mois.forEach((m, i) => {
    const centre = margeG + pas * i + pas / 2;
    const hr = (m.recettes / max) * h;
    const hd = (m.depenses / max) * h;
    corps += `<rect x="${(centre - largeurBarre - 1.5).toFixed(1)}" y="${(margeH + h - hr).toFixed(1)}" width="${largeurBarre.toFixed(1)}" height="${hr.toFixed(1)}" rx="2" fill="var(--positif)"/>`;
    corps += `<rect x="${(centre + 1.5).toFixed(1)}" y="${(margeH + h - hd).toFixed(1)}" width="${largeurBarre.toFixed(1)}" height="${hd.toFixed(1)}" rx="2" fill="var(--negatif)"/>`;
    if (i % 2 === 0) {
      corps += `<text x="${centre.toFixed(1)}" y="${hauteur - 8}" text-anchor="middle" font-size="9.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${MOIS_COURT[i]}</text>`;
    }
  });

  let grille = '';
  for (let i = 0; i <= 2; i += 1) {
    const valeur = (max * i) / 2;
    const py = margeH + h - (i / 2) * h;
    grille += `<line x1="${margeG}" y1="${py.toFixed(1)}" x2="${largeur - 12}" y2="${py.toFixed(1)}" stroke="${GRIS}" stroke-width="0.6" stroke-dasharray="3 3"/>
    <text x="${margeG - 6}" y="${(py + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(eurosCourt(valeur))}</text>`;
  }

  const legende = `<rect x="${margeG}" y="2" width="10" height="10" rx="2" fill="var(--positif)"/>
    <text x="${margeG + 15}" y="11" font-size="10.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Encaissements</text>
    <rect x="${margeG + 108}" y="2" width="10" height="10" rx="2" fill="var(--negatif)"/>
    <text x="${margeG + 123}" y="11" font-size="10.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Décaissements</text>`;

  return svg(largeur, hauteur, grille + corps + legende, 'graphe-flux');
}

// ---------------------------------------------------------------------------
// Jauge de consommation du budget
// ---------------------------------------------------------------------------

export function jauge(realise, budget, { largeur = largeurUtile(), hauteur = 58 } = {}) {
  const taux = budget > 0 ? realise / budget : 0;
  const plein = Math.min(taux, 1);
  const depasse = taux > 1;
  const marge = 6;
  const l = largeur - marge * 2;
  const y = 24;
  const couleur = depasse ? NEGATIF : taux > 0.85 ? ATTENTION : POSITIF;

  const texteTaux = budget > 0 ? `${Math.round(taux * 100)} %` : '—';
  return svg(
    largeur,
    hauteur,
    `<text x="${marge}" y="15" font-size="11.5" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Consommation du budget annuel</text>
     <text x="${largeur - marge}" y="15" text-anchor="end" font-size="12.5" font-weight="700" fill="${couleur}" font-family="system-ui, sans-serif">${texteTaux}</text>
     <rect x="${marge}" y="${y}" width="${l}" height="14" rx="7" fill="var(--graphe-piste)"/>
     <rect x="${marge}" y="${y}" width="${(l * plein).toFixed(1)}" height="14" rx="7" fill="${couleur}"/>
     <text x="${marge}" y="${y + 29}" font-size="11" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">${echappe(euros(realise))} dépensés</text>
     <text x="${largeur - marge}" y="${y + 29}" text-anchor="end" font-size="11" fill="${GRIS_TEXTE}" font-family="system-ui, sans-serif">Budget ${echappe(euros(budget))}</text>`,
    'graphe-jauge',
  );
}

/** Petite barre d'appoint réutilisée dans les listes (appels, situation des lots). */
export function barreTaux(taux, couleur = 'var(--positif)') {
  const p = Math.max(0, Math.min(1, taux || 0));
  return `<div class="barre-taux"><span style="width:${(p * 100).toFixed(1)}%;background:${couleur}"></span></div>`;
}
