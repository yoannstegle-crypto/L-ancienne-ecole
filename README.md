# Syndic L'Ancienne École

Application de gestion de copropriété, pensée pour être utilisée **entièrement depuis un iPhone**.

Elle couvre le travail réel d'un gestionnaire bénévole : suivre le compte du syndic, lire les
extraits de compte reçus par courrier en les photographiant, appeler les provisions
nominativement par WhatsApp, et sortir en fin d'année un bilan et un rapport d'assemblée
générale imprimables.

---

## Ce qu'elle fait

| Écran | À quoi il sert |
|---|---|
| **Accueil** | Solde en temps réel, consommation du budget, camembert des dépenses, courbe du solde, alertes (factures à payer, provisions non réglées, sauvegarde à faire). |
| **Scanner** | Photo de l'extrait de compte → lecture par l'IA Gemini → tableau à valider ligne par ligne → import dans le compte. Contrôle automatique : la somme des lignes doit expliquer la variation entre l'ancien et le nouveau solde. |
| **Compte** | Toutes les opérations de l'exercice, groupées par mois, filtrables, pointables une à une. Onglet **Factures** pour les factures reçues et leur règlement. |
| **Budget** | Budget voté confronté au réalisé, poste par poste, avec graphique. Reprise en un geste du budget de l'année précédente indexé de 2 %. Quote-part annuelle et trimestrielle par lot. |
| **Copro** | Fiche de chaque copropriétaire (tantièmes, téléphone, solde). Onglet **Provisions** : création d'un appel réparti aux tantièmes, suivi des règlements, envoi **nominatif** par WhatsApp. |
| **Rapport** | **Bilan annuel** imprimable (synthèse, graphiques, budget vs réalisé, situation des copropriétaires, proposition de budget N+1) et **procès-verbal d'assemblée générale** (composition, ordre du jour, résolutions et votes). |

### Ce qui fait gagner du temps

- **Rapprochement automatique** : une provision encaissée reconnue au nom d'un copropriétaire
  vient pointer la ligne d'appel correspondante.
- **Détection des doublons** : une ligne déjà présente dans le compte est décochée d'office à
  l'import, impossible d'enregistrer deux fois le même relevé.
- **Répartition juste au centime** : la somme des quotes-parts égale toujours le montant appelé,
  le résidu d'arrondi tombant sur le plus gros lot.
- **Catégorisation** : l'IA propose une catégorie, et une table de mots-clés (EDF, Veolia, AXA,
  frais bancaires…) prend le relais quand elle hésite.

---

## Installation sur iPhone

1. **Publier l'application.** Dans *Settings* → *Pages* → **Source : Deploy from a branch**,
   choisir la branche `main` et le dossier `/ (root)`, puis *Save*. Au bout d'une minute
   l'application est servie sur **https://yoannstegle-crypto.github.io/l-ancienne-ecole/**.
2. **Ouvrir cette adresse dans Safari** sur l'iPhone.
3. **Bouton Partager → « Sur l'écran d'accueil ».** L'application s'installe comme une app :
   icône, plein écran, et fonctionnement hors ligne (sauf la lecture des relevés, qui a besoin
   d'Internet).

> Ouvrir `index.html` directement depuis Fichiers ne fonctionne pas : le code est découpé en
> modules JavaScript, que Safari refuse de charger depuis `file://`. Il faut une vraie adresse
> web — GitHub Pages fait très bien l'affaire, gratuitement.

---

## Clé Gemini (lecture des relevés)

1. Aller sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey) et créer une clé
   (gratuite, quota généreux pour quelques relevés par mois).
2. Dans l'application : **⚙ Réglages → Clé API Gemini**, coller la clé. Elle est vérifiée
   immédiatement.

La clé est stockée dans la mémoire du navigateur de l'iPhone, jamais dans le dépôt. Les photos
partent directement du téléphone vers l'API Google au moment de l'analyse ; rien ne transite par
un serveur intermédiaire, il n'y en a aucun.

---

## Vos données, et comment ne pas les perdre

Tout est stocké en local (`localStorage`), sur l'appareil. **Aucun compte, aucun serveur, aucune
base de données.** C'est ce qui rend l'application gratuite et privée — et c'est aussi son point
faible : effacer les données de Safari efface la comptabilité.

**Exportez une sauvegarde régulièrement** : Réglages → *Exporter une sauvegarde* produit un
fichier JSON à ranger dans Fichiers ou iCloud. L'accueil affiche une alerte passé trois semaines
sans export. *Restaurer* relit ce fichier, soit en remplacement, soit en complément de
l'existant — c'est aussi le moyen de passer d'un appareil à un autre.

---

## Imprimer un rapport en PDF

Depuis l'écran **Rapport**, bouton *Imprimer / PDF* → dans l'aperçu Safari, écarter deux doigts
sur la vignette → *Partager* → *Enregistrer dans Fichiers*. La navigation et les boutons
disparaissent à l'impression, les graphiques restent vectoriels et les sections se coupent
proprement entre les pages.

---

## Sous le capot

Aucune dépendance, aucun outil de compilation, aucun CDN : du HTML, du CSS et des modules
JavaScript natifs. On clone, on publie, ça marche.

```
index.html               coque de l'application
manifest.webmanifest     installation sur l'écran d'accueil
sw.js                    service worker (fonctionnement hors ligne)
css/app.css              interface (thèmes clair et sombre)
css/impression.css       mise en page papier / PDF
js/app.js                routage par ancre et réaffichage
js/store.js              persistance locale, export et import
js/model.js              modèle métier et tous les calculs
js/format.js             montants, dates, téléphones, lecture des montants saisis
js/charts.js             graphiques SVG écrits à la main
js/gemini.js             appel de l'API Gemini et normalisation des réponses
js/ui.js                 feuilles modales, formulaires, notifications
js/demo.js               jeu d'essai (copropriété fictive de 6 lots)
js/views/                un module par écran
```

Les graphiques sont produits en SVG plutôt qu'avec une bibliothèque : ils restent nets à
l'impression, s'adaptent à la largeur de l'écran, suivent le thème clair ou sombre, et ne
coûtent aucun téléchargement.

### Pour se faire la main

Réglages → *Charger un jeu d'essai* remplit l'application avec une copropriété fictive de six
lots sur deux exercices. Idéal pour voir à quoi ressemblent les rapports avant de saisir les
vraies données. *Tout effacer* permet de repartir à zéro ensuite.

---

## Premiers pas avec vos données

1. **Réglages → Syndic** : nom, adresse, votre nom, IBAN du compte (il s'insère tout seul dans
   les appels de provisions).
2. **Réglages → Exercices** : saisir le solde du compte au 1er janvier, repris du relevé de
   décembre précédent.
3. **Copro** : ajouter les copropriétaires avec leurs tantièmes et leur numéro WhatsApp.
4. **Budget** : saisir le budget voté en assemblée.
5. **Scanner** : photographier le premier relevé.

Les appels de provisions, le bilan et le rapport d'assemblée se remplissent ensuite tout seuls à
partir de ces données.
