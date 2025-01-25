import { acceptServer, handleAppFetch } from "webcorn/service-worker";

acceptServer();

const currentVersion = 'v1';

self.addEventListener('install', async e => {
    // scope是一个字符串格式的URL，如：http://localhost:8080/webcorn/
    const scope = self.registration.scope;
    console.log(`installing service worker: ${scope}`)
    //await self.skipWaiting();
});

const deleteOldCaches = async () => {
    const keyList = await self.caches.keys();
    const cachesToDelete = keyList.filter(key => key !== currentVersion);
    const deletes = cachesToDelete.map(async (key) => await self.caches.delete(key));
    await Promise.all(deletes);
}

self.addEventListener('activate', async event => {
    console.log("activating service worker")
    event.waitUntil(deleteOldCaches());
    //await self.clients.claim();
});

self.addEventListener('fetch', async event => {
    event.respondWith(handleFetch(event));
});

const cacheFirst = async (req) => {
    const res = await caches.match(req);
    if (res) {
        console.log("response from cache");
        return res;
    }
    
    const url = new URL(req.url);
    const scheme = url.protocol.slice(0, -1);

    try {
        const newres = await fetch(req);
        if (scheme === 'https' || scheme === 'http') {
            const cache = await caches.open(currentVersion);
            await cache.put(req, newres.clone());
        }
        return newres;
    } catch (err) {
        return new Response("Network error!!!", {
            status: 408,
            headers: {"Content-Type": "text/plain; charset=utf-8"},
        });
    }
}

const serverFiles = new Set([
    '/server.html',
    '/server.mjs',
])

const handleFetch = async event => {
    const url = new URL(event.request.url);

    const method = event.request.method;
    const scheme = url.protocol.slice(0, -1);
    const hostname = url.hostname;
    const port = url.port;
    const path = url.pathname;

    console.log(`service worker: fetch received: ${event.request.url}`);

    const scope = self.registration.scope;

    if (url.href.startsWith(scope)) {
        const path = url.href.slice(scope.length);
        const index = path.indexOf('/');
        const serverName = index >= 0 ? path.substring(0, index) : path;
        const fileName = index >= 0 ? path.substring(index) : '';
        console.log(`path = ${path}, serverName = ${serverName}, fileName = ${fileName}`);
        if (fileName === `/${serverName}.zip` || serverFiles.has(fileName)) {
            return await cacheFirst(event.request);
        }
        return await handleAppFetch(serverName, event);
    } else {
        return await cacheFirst(event.request);
    }
}
