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
   l'application est servie sur **https://yoannstegle-crypto.github.io/L-ancienne-ecole/**.
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
2. Dans l'application : **⚙ Réglages → Clé API Gemini**, coller la clé.
3. L'application interroge Google et propose **les modèles réellement disponibles pour cette
   clé**, le plus adapté étant marqué « recommandé ». Le choix est vérifié dans la foulée.

Aucun nom de modèle n'est figé dans le code : Google en retire régulièrement, et la liste se
met donc à jour toute seule. Si un modèle enregistré disparaît, l'application le signale et
renvoie vers ce même écran.

La clé est stockée dans la mémoire du navigateur de l'iPhone, jamais dans le dépôt. Les photos
partent directement du téléphone vers l'API Google au moment de l'analyse ; rien ne transite par
un serveur intermédiaire, il n'y en a aucun.

---

## Synchronisation Google Drive (facultatif)

Sans configuration, les données ne vivent que dans le navigateur de l'appareil. En reliant
l'application à un Google Drive, on obtient trois choses d'un coup : les mêmes données sur le
téléphone et sur l'ordinateur, une sauvegarde continue, et aucun fichier à exporter à la main.

**L'application ne voit jamais votre mot de passe.** L'authentification se fait chez Google, qui
renvoie un jeton valable une heure. La permission demandée est `drive.file` : l'application
n'accède qu'aux fichiers qu'elle a elle-même créés — le reste du Drive lui reste invisible.

### Créer l'identifiant client, une fois pour toutes

Sur [console.cloud.google.com](https://console.cloud.google.com), avec le compte Google dont vous
voulez utiliser le Drive :

1. **Créer un projet** — n'importe quel nom, par exemple « Syndic ».
2. **API et services → Bibliothèque** → chercher **Google Drive API** → **Activer**.
3. **API et services → Écran de consentement OAuth** :
   - type **Externe**, puis **Créer**
   - nom de l'application, votre adresse e-mail en contact, **Enregistrer**
   - à l'étape **Utilisateurs test**, ajouter votre propre adresse Gmail
   - laisser l'application en mode **Test** : c'est suffisant, et cela évite la procédure de
     validation de Google. La permission `drive.file` n'étant pas considérée comme sensible,
     rien d'autre n'est exigé.
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - type d'application : **Application Web**
   - dans **Origines JavaScript autorisées**, ajouter l'adresse exacte du site, par exemple
     `https://yoannstegle-crypto.github.io` — le domaine seul, sans le chemin ni barre finale
   - **Créer**, puis copier l'**ID client** (il se termine par `.apps.googleusercontent.com`)

Cet identifiant n'est pas un secret : il est conçu pour figurer dans une page web publique. Ce
qui protège les données, c'est la connexion Google, pas lui.

### Activer dans l'application

**⚙ Réglages → Google Drive → Configurer**, coller l'ID client, puis **Se connecter à Google**.
Un fichier `syndic-ancienne-ecole.json` apparaît à la racine du Drive. Les modifications y
partent automatiquement quelques secondes après chaque saisie.

### Comment les conflits sont traités

Chaque modification fait avancer un compteur de révision, et l'application retient la révision
de la dernière synchronisation réussie. En comparant trois nombres — local, distant, dernière
synchro — elle sait qui a bougé.

Si les deux côtés ont été modifiés depuis la dernière synchro, **rien n'est écrit** : une fenêtre
affiche les deux versions avec leur date et demande laquelle conserver. Jamais d'écrasement
silencieux.

En cas de doute, exportez d'abord une sauvegarde : elle fige une copie que la synchronisation ne
touchera pas.

---

## Vos données, et comment ne pas les perdre

Tout est stocké en local (`localStorage`), sur l'appareil. **Aucun serveur, aucune base de
données.** C'est ce qui rend l'application gratuite et privée — et c'est aussi son point faible
tant que la synchronisation Drive n'est pas activée : effacer les données de Safari efface la
comptabilité.

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
js/drive.js              authentification Google et lecture/écriture dans le Drive
js/sync.js               comparaison des révisions, conflits, envoi différé
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
