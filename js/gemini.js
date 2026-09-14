// Lecture des extraits de compte par photo, via l'API Gemini.
// La clé reste dans le navigateur (localStorage) et l'image part directement
// du téléphone vers Google : aucun serveur intermédiaire.

import { dateISO, montantDepuisTexte, normalise } from './format.js';

const RACINE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Réduit la photo avant envoi : une photo iPhone brute pèse 3 à 5 Mo pour rien. */
export function compresseImage(fichier, { cote = 1600, qualite = 0.85 } = {}) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error('Lecture de la photo impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => rejeter(new Error('Image illisible'));
      img.onload = () => {
        const echelle = Math.min(1, cote / Math.max(img.width, img.height));
        const l = Math.round(img.width * echelle);
        const h = Math.round(img.height * echelle);
        const canvas = document.createElement('canvas');
        canvas.width = l;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, l, h);
        ctx.drawImage(img, 0, 0, l, h);
        const dataUrl = canvas.toDataURL('image/jpeg', qualite);
        resoudre({
          base64: dataUrl.split(',')[1],
          mime: 'image/jpeg',
          apercu: dataUrl,
          largeur: l,
          hauteur: h,
        });
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    banque: { type: 'STRING', description: 'Nom de la banque si visible' },
    periode: { type: 'STRING', description: "Période de l'extrait, ex. 01/2026" },
    solde_initial: { type: 'STRING', description: 'Ancien solde / solde précédent, tel qu’écrit' },
    solde_final: { type: 'STRING', description: 'Nouveau solde / solde final, tel qu’écrit' },
    operations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'Date de l’opération au format JJ/MM/AAAA' },
          libelle: { type: 'STRING', description: 'Libellé complet, nom du bénéficiaire ou du payeur inclus' },
          montant: { type: 'STRING', description: 'Montant signé : négatif au débit, positif au crédit' },
          sens: { type: 'STRING', description: 'debit ou credit' },
          categorie: { type: 'STRING', description: 'Catégorie proposée, choisie dans la liste fournie' },
          contrepartie: { type: 'STRING', description: 'Nom de la personne ou société, si identifiable' },
        },
        required: ['date', 'libelle', 'montant', 'sens'],
        propertyOrdering: ['date', 'libelle', 'montant', 'sens', 'categorie', 'contrepartie'],
      },
    },
  },
  required: ['operations'],
  propertyOrdering: ['banque', 'periode', 'solde_initial', 'solde_final', 'operations'],
};

function consigne(categories, lots) {
  const listeCategories = categories.map((c) => `- ${c.nom} (${c.type})`).join('\n');
  const listeLots = lots.length
    ? `\nCopropriétaires connus (utile pour reconnaître les virements de provisions) :\n${lots.map((l) => `- ${l.nom}`).join('\n')}`
    : '';
  return `Tu es l'assistant comptable d'un petit syndic de copropriété.
On te donne la photo d'un extrait de compte bancaire papier.

Relève TOUTES les lignes d'opération visibles, dans l'ordre du relevé, sans en inventer aucune.

Règles :
- "montant" est signé : négatif pour un débit (paiement, prélèvement, retrait), positif pour un crédit (virement reçu, provision encaissée).
- Recopie le libellé tel qu'il apparaît, en gardant le nom du bénéficiaire ou du payeur.
- Si l'année n'est pas écrite sur la ligne, déduis-la de la période de l'extrait.
- Ne reprends ni la ligne "ancien solde" ni la ligne "nouveau solde" dans les opérations : mets-les dans solde_initial et solde_final.
- Si une zone est illisible, laisse le champ vide plutôt que de deviner.

Catégorie à choisir strictement dans cette liste :
${listeCategories}${listeLots}`;
}

export async function litReleve({ images, cle, modele = 'gemini-2.5-flash', categories = [], lots = [] }) {
  if (!cle) throw new Error("Aucune clé API Gemini enregistrée : ouvrez Réglages pour l'ajouter.");
  if (!images || !images.length) throw new Error('Aucune photo à analyser.');

  const corps = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: consigne(categories, lots) },
          ...images.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
    },
  };

  let reponse;
  try {
    reponse = await fetch(`${RACINE}/${encodeURIComponent(modele)}:generateContent?key=${encodeURIComponent(cle)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error('Connexion impossible. Vérifiez le réseau et réessayez.');
  }

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '');
    let message = `Erreur Gemini ${reponse.status}`;
    try {
      const j = JSON.parse(detail);
      if (j.error && j.error.message) message = j.error.message;
    } catch {
      /* on garde le message générique */
    }
    if (reponse.status === 400 && /API key/i.test(message)) message = 'Clé API refusée. Vérifiez-la dans Réglages.';
    if (reponse.status === 429) message = 'Quota Gemini atteint. Réessayez dans quelques minutes.';
    throw new Error(message);
  }

  const json = await reponse.json();
  const texte = (json.candidates || [])
    .flatMap((c) => (c.content && c.content.parts) || [])
    .map((p) => p.text || '')
    .join('');
  if (!texte.trim()) throw new Error("Gemini n'a rien renvoyé : reprenez la photo, bien à plat et bien éclairée.");

  let donnees;
  try {
    donnees = JSON.parse(texte);
  } catch {
    const extrait = texte.match(/\{[\s\S]*\}/);
    if (!extrait) throw new Error('Réponse illisible de Gemini.');
    donnees = JSON.parse(extrait[0]);
  }
  return normaliseReleve(donnees);
}

/** Met la réponse de l'IA au format de l'application (dates ISO, montants numériques). */
export function normaliseReleve(donnees) {
  const periode = String(donnees.periode || '');
  const anneeDetectee = (periode.match(/(20\d{2})/) || [])[1];
  const annee = anneeDetectee ? Number(anneeDetectee) : new Date().getFullYear();

  const operations = (donnees.operations || [])
    .map((o) => {
      let montant = montantDepuisTexte(o.montant);
      const sens = normalise(o.sens);
      // Filet de sécurité : si l'IA a donné un montant positif sur un débit, on corrige.
      if (sens.includes('debit') && montant > 0) montant = -montant;
      if (sens.includes('credit') && montant < 0) montant = Math.abs(montant);
      return {
        date: dateISO(o.date, annee),
        libelle: String(o.libelle || '').trim(),
        montant,
        categorieSuggeree: String(o.categorie || '').trim(),
        contrepartie: String(o.contrepartie || '').trim(),
      };
    })
    .filter((o) => o.libelle && o.montant !== 0);

  return {
    banque: String(donnees.banque || '').trim(),
    periode,
    annee,
    soldeInitial: donnees.solde_initial ? montantDepuisTexte(donnees.solde_initial) : null,
    soldeFinal: donnees.solde_final ? montantDepuisTexte(donnees.solde_final) : null,
    operations,
  };
}

/** Fait correspondre le nom de catégorie proposé par l'IA à une catégorie existante. */
export function categorieDepuisNom(categories, nom) {
  if (!nom) return null;
  const cible = normalise(nom);
  const exacte = categories.find((c) => normalise(c.nom) === cible);
  if (exacte) return exacte.id;
  const partielle = categories.find((c) => normalise(c.nom).includes(cible) || cible.includes(normalise(c.nom)));
  return partielle ? partielle.id : null;
}

/** Vérifie la clé en un appel minimal, sans consommer d'image. */
export async function testeCle(cle, modele = 'gemini-2.5-flash') {
  const reponse = await fetch(`${RACINE}/${encodeURIComponent(modele)}:generateContent?key=${encodeURIComponent(cle)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Réponds exactement : OK' }] }] }),
  });
  if (!reponse.ok) {
    const detail = await reponse.json().catch(() => ({}));
    throw new Error((detail.error && detail.error.message) || `Erreur ${reponse.status}`);
  }
  return true;
}
