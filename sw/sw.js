const CACHE_NAME = 'cache-v1';

const urlsToCache = [
    '/app/',
    '/sw/',
]

self.addEventListener('install', e => {
    console.log("installing SW")
    e.waitUntil(
        caches.open(CACHE_NAME)
              .then(cache => {
                console.log('Caching files');
                return cache.addAll(urlsToCache);
              })
    );
});

self.addEventListener('activate', e => {
    console.log("activating SW")
    const cacheWhiteList = [CACHE_NAME];
    e.waitUntil(async () => {
        const keyList = await caches.keys();
        const toDelete = keyList.filter(key => key !== CACHE_NAME);
        const deleteKey = async key => await caches.delete(key);
        await Promise.all(toDelete.map(key => deleteKey(key)))
    });
});

const putInCache = async (req, res) => {
    console.log("put in cache");
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res)
}

const cacheFirst = async (req) => {
    const res = await caches.match(req);
    if (res) {
        console.log("response from cache");
        return res;
    }

    try {
        const newres = await fetch(req);
        putInCache(req, newres.clone())
        return newres;
    } catch (err) {
        return new Response("Network error!!!", {
            status: 408,
            headers: {"Content-Type": "text/plain; charset=utf-8"},
        });
    }
}

self.addEventListener('fetch', e => {
    console.log("fetch received by sw");
    e.respondWith(cacheFirst(e.request));
});