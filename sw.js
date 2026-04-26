// sw.js — Service Worker Courses Duo
// Gère les notifications push en arrière-plan (même app fermée)

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBEG9mOSns3-Gw1vAEnZILaIRKrVnweHdo",
    authDomain: "misfit-game.firebaseapp.com",
    projectId: "misfit-game",
    storageBucket: "misfit-game.firebasestorage.app",
    messagingSenderId: "394080113498",
    appId: "1:394080113498:web:18e40d37027d00f67ed963"
});

const messaging = firebase.messaging();

// Notif reçue quand l'app est en ARRIÈRE-PLAN ou FERMÉE
messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification;
    self.registration.showNotification(title || '🛒 Courses Duo', {
        body: body || 'Nouvelle mise à jour de la liste',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data: payload.data
    });
});

// Cache pour le mode offline (optionnel mais utile)
const CACHE_NAME = 'courses-duo-v1';
const CACHE_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // On laisse passer les requêtes Firebase, on cache seulement les assets
    if (e.request.url.includes('firestore') || e.request.url.includes('googleapis')) return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
