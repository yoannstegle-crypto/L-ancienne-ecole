/* Service worker : l'application reste utilisable sans réseau (consultation,
   saisie, rapports). Seule la lecture d'un relevé par Gemini exige Internet. */

const VERSION = 'syndic-v1';

const COQUE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/impression.css',
  './assets/icone.svg',
  './assets/icone-192.png',
  './assets/icone-512.png',
  './js/app.js',
  './js/store.js',
  './js/model.js',
  './js/format.js',
  './js/charts.js',
  './js/gemini.js',
  './js/ui.js',
  './js/demo.js',
  './js/views/dashboard.js',
  './js/views/compte.js',
  './js/views/budget.js',
  './js/views/copro.js',
  './js/views/rapport.js',
  './js/views/reglages.js',
  './js/views/scan.js',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches
      .open(VERSION)
      // addAll échoue en bloc si une seule ressource manque : on encaisse
      // les absences une par une pour ne jamais casser l'installation.
      .then((cache) => Promise.all(COQUE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  // L'API Gemini ne passe jamais par le cache.
  if (url.origin !== self.location.origin) return;

  // Navigation : on privilégie le réseau pour récupérer les mises à jour,
  // avec repli sur le cache quand le téléphone est hors ligne.
  if (requete.mode === 'navigate') {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copie));
          return reponse;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Ressources : réponse immédiate depuis le cache, rafraîchie en arrière-plan.
  evenement.respondWith(
    caches.match(requete).then((enCache) => {
      const reseau = fetch(requete)
        .then((reponse) => {
          if (reponse && reponse.status === 200 && reponse.type === 'basic') {
            const copie = reponse.clone();
            caches.open(VERSION).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || reseau;
    }),
  );
});
