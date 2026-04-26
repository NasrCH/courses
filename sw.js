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

// ✅ Notif reçue quand l'app est en ARRIÈRE-PLAN ou FERMÉE (via FCM / Cloud Function)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Message en arrière-plan reçu:', payload);
    const title = (payload.notification && payload.notification.title) || '🛒 Courses Duo';
    const body = (payload.notification && payload.notification.body) || 'Nouvelle mise à jour de la liste';
    self.registration.showNotification(title, {
        body: body,
        icon: '/courses/icons/icon-192.png',
        badge: '/courses/icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'courses-update',
        renotify: true,
        data: payload.data || {}
    });
});

// ✅ Clic sur la notification → ouvre l'app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes('/courses') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/courses/');
            }
        })
    );
});

// Cache pour le mode offline
const CACHE_NAME = 'courses-duo-v3';
const CACHE_URLS = ['/courses/', '/courses/index.html', '/courses/manifest.json', '/courses/icons/icon-192.png', '/courses/icons/icon-512.png'];

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
    const url = e.request.url;

    // Ne JAMAIS intercepter Firebase/Firestore/Google — laisser passer direct
    if (
        url.includes('firestore.googleapis.com') ||
        url.includes('firebase') ||
        url.includes('googleapis.com') ||
        url.includes('gstatic.com') ||
        url.includes('google.com') ||
        e.request.method !== 'GET'
    ) return;

    // Cache uniquement les assets statiques (html, css, fonts, icons)
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});


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
        icon: '/courses/icons/icon-192.png',
        badge: '/courses/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data: payload.data
    });
});

// Cache pour le mode offline (optionnel mais utile)
const CACHE_NAME = 'courses-duo-v2';
const CACHE_URLS = ['/courses/', '/courses/index.html', '/courses/manifest.json'];

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
    const url = e.request.url;

    // Ne JAMAIS intercepter Firebase/Firestore/Google — laisser passer direct
    if (
        url.includes('firestore.googleapis.com') ||
        url.includes('firebase') ||
        url.includes('googleapis.com') ||
        url.includes('gstatic.com') ||
        url.includes('google.com') ||
        e.request.method !== 'GET'
    ) return;

    // Cache uniquement les assets statiques (html, css, fonts, icons)
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
