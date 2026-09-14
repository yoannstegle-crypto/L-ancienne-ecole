// Helpers de formatage — tout est en euros, en français, sans dépendance externe.

export const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const MOIS_COURT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

const nfMontant = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nfCompact = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 1234.5 -> "1 234,50 €" ; option signe pour forcer le "+" sur les recettes. */
export function euros(montant, { signe = false } = {}) {
  const n = Number(montant) || 0;
  const txt = nfMontant.format(n);
  return signe && n > 0 ? `+${txt}` : txt;
}

/** Version courte pour les axes de graphiques : 12500 -> "12 500 €". */
export function eurosCourt(montant) {
  return `${nfCompact.format(Math.round(Number(montant) || 0))} €`;
}

export function pourcent(part, total, decimales = 1) {
  if (!total) return '0 %';
  return `${((part / total) * 100).toFixed(decimales).replace('.', ',')} %`;
}

/** "2026-09-14" -> "14/09/2026" */
export function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  if (!a || !m || !j) return String(iso);
  return `${j}/${m}/${a}`;
}

/** "2026-09-14" -> "14 septembre 2026" */
export function dateLongue(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function anneeDe(iso) {
  return Number(String(iso || '').slice(0, 4)) || new Date().getFullYear();
}

export function moisDe(iso) {
  return Number(String(iso || '').slice(5, 7)) || 1;
}

/**
 * Accepte tout ce qu'un relevé bancaire ou un doigt sur iPhone peut produire :
 * "1 234,56", "1.234,56", "1,234.56", "-12.30", "12,30 €", "(45,00)".
 */
export function montantDepuisTexte(valeur) {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : 0;
  if (!valeur) return 0;
  let s = String(valeur).trim();
  let negatif = false;
  if (/^\(.*\)$/.test(s)) {
    negatif = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  €]/g, '');
  if (s.startsWith('-')) {
    negatif = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const dernierePoint = s.lastIndexOf('.');
  const derniereVirgule = s.lastIndexOf(',');
  if (dernierePoint > -1 && derniereVirgule > -1) {
    // Le séparateur décimal est le dernier des deux, l'autre sépare les milliers.
    const sep = dernierePoint > derniereVirgule ? '.' : ',';
    const autre = sep === '.' ? ',' : '.';
    s = s.split(autre).join('').replace(sep, '.');
  } else if (derniereVirgule > -1) {
    s = s.replace(',', '.');
  } else if (dernierePoint > -1) {
    // "1.234" sur trois décimales = séparateur de milliers, pas des millièmes d'euro.
    const decimales = s.length - dernierePoint - 1;
    if (decimales === 3 && s.split('.').length === 2 && s.indexOf('.') <= 3) s = s.replace('.', '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negatif ? -n : n;
}

/** Normalise une date reconnue par Gemini ou saisie à la main vers "AAAA-MM-JJ". */
export function dateISO(valeur, anneeDefaut = new Date().getFullYear()) {
  if (!valeur) return '';
  const s = String(valeur).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2,4}))?$/);
  if (m) {
    const j = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let a = m[3] || String(anneeDefaut);
    if (a.length === 2) a = `20${a}`;
    return `${a}-${mo}-${j}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return '';
}

let compteur = 0;
export function uid(prefixe = 'id') {
  compteur += 1;
  return `${prefixe}_${Date.now().toString(36)}${compteur.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Minuscules sans accents ni ponctuation — sert au rapprochement des libellés bancaires. */
export function normalise(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function echappe(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "06 12 34 56 78" + indicatif 33 -> "33612345678" (format attendu par wa.me). */
export function telephoneWhatsApp(numero, indicatifDefaut = '33') {
  let s = String(numero || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s.slice(1);
  if (s.startsWith('00')) return s.slice(2);
  if (s.startsWith('0')) return `${indicatifDefaut}${s.slice(1)}`;
  return s;
}
