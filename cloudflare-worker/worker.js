/**
 * Cloudflare Worker — Courses Duo Notifications
 * ---------------------------------------------------
 * Reçoit un POST depuis l'app quand un article est ajouté,
 * récupère les tokens FCM dans Firestore,
 * et envoie les notifications push via FCM HTTP v1 API.
 *
 * Variables d'environnement (Cloudflare Dashboard > Worker > Settings > Variables) :
 *   FIREBASE_PROJECT_ID      → "misfit-game"
 *   SERVICE_ACCOUNT_EMAIL    → "firebase-adminsdk-xxxx@misfit-game.iam.gserviceaccount.com"
 *   SERVICE_ACCOUNT_PRIVATE_KEY → La clé privée du service account (-----BEGIN PRIVATE KEY-----\n...)
 */

export default {
    async fetch(request, env) {
        // ── CORS ──────────────────────────────────────────────
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        // ── Lecture du body ───────────────────────────────────
        let itemName, catName, senderDeviceId;
        try {
            ({ itemName, catName, senderDeviceId } = await request.json());
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            // 1. Obtenir un access token Google via le service account
            const accessToken = await getFirebaseAccessToken(env);

            // 2. Lire les tokens FCM depuis Firestore (sauf l'expéditeur)
            const tokens = await getFCMTokens(accessToken, env.FIREBASE_PROJECT_ID, senderDeviceId);

            if (tokens.length === 0) {
                return jsonResponse({ success: true, sent: 0, message: 'No other devices to notify' }, corsHeaders);
            }

            // 3. Envoyer une notification FCM à chaque appareil
            let successCount = 0;
            const invalidTokenIds = [];

            for (const { deviceId, token } of tokens) {
                try {
                    await sendFCMNotification(accessToken, env.FIREBASE_PROJECT_ID, token, itemName, catName);
                    successCount++;
                } catch (err) {
                    console.error(`FCM error [${deviceId}]:`, err.message);
                    // Marquer les tokens expirés pour suppression
                    if (err.message.includes('UNREGISTERED') || err.message.includes('INVALID_ARGUMENT')) {
                        invalidTokenIds.push(deviceId);
                    }
                }
            }

            // 4. Nettoyer les tokens invalides (optionnel, best-effort)
            if (invalidTokenIds.length > 0) {
                cleanupInvalidTokens(accessToken, env.FIREBASE_PROJECT_ID, invalidTokenIds);
            }

            return jsonResponse({ success: true, sent: successCount }, corsHeaders);

        } catch (err) {
            console.error('Worker error:', err);
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

// ─────────────────────────────────────────────────────────────
//  Auth Firebase via Service Account (JWT → OAuth2 token)
// ─────────────────────────────────────────────────────────────
async function getFirebaseAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);

    const headerB64 = toB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payloadB64 = toB64Url(JSON.stringify({
        iss: env.SERVICE_ACCOUNT_EMAIL,
        scope: [
            'https://www.googleapis.com/auth/firebase.messaging',
            'https://www.googleapis.com/auth/datastore'
        ].join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    }));

    const signingInput = `${headerB64}.${payloadB64}`;

    // Importer la clé privée RSA depuis le PEM
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(env.SERVICE_ACCOUNT_PRIVATE_KEY),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(signingInput)
    );

    const sigB64 = toB64UrlRaw(signatureBuffer);
    const jwt = `${signingInput}.${sigB64}`;

    // Échanger le JWT contre un access token Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        throw new Error('Impossible d\'obtenir l\'access token Google: ' + JSON.stringify(tokenData));
    }
    return tokenData.access_token;
}

// ─────────────────────────────────────────────────────────────
//  Lecture des tokens FCM depuis Firestore
// ─────────────────────────────────────────────────────────────
async function getFCMTokens(accessToken, projectId, senderDeviceId) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcm_tokens`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Firestore read error: ${err}`);
    }

    const data = await res.json();
    const tokens = [];

    if (data.documents) {
        for (const doc of data.documents) {
            const docId = doc.name.split('/').pop();
            // Exclure l'appareil qui a envoyé la requête
            if (docId !== senderDeviceId && doc.fields?.token?.stringValue) {
                tokens.push({ deviceId: docId, token: doc.fields.token.stringValue });
            }
        }
    }

    return tokens;
}

// ─────────────────────────────────────────────────────────────
//  Envoi notification FCM HTTP v1
// ─────────────────────────────────────────────────────────────
async function sendFCMNotification(accessToken, projectId, token, itemName, catName) {
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const body = JSON.stringify({
        message: {
            token: token,
            notification: {
                title: '🛒 Courses Duo',
                body: `"${itemName}" ajouté dans ${catName || 'la liste'}`
            },
            webpush: {
                notification: {
                    icon: '/courses/icons/icon-192.png',
                    badge: '/courses/icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    tag: 'courses-update',
                    renotify: true
                },
                fcm_options: { link: '/courses/' }
            }
        }
    });

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`FCM send error: ${err}`);
    }

    return res.json();
}

// ─────────────────────────────────────────────────────────────
//  Nettoyage des tokens FCM expirés (fire and forget)
// ─────────────────────────────────────────────────────────────
async function cleanupInvalidTokens(accessToken, projectId, deviceIds) {
    for (const deviceId of deviceIds) {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcm_tokens/${deviceId}`;
        fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────
//  Utilitaires
// ─────────────────────────────────────────────────────────────
function toB64Url(str) {
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function toB64UrlRaw(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
        .replace(/-----END RSA PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer.buffer;
}

function jsonResponse(data, corsHeaders) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

