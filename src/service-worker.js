import * as Comlink from "comlink";

const currentVersion = 'v1';
let nextServerId = 1000;
const webcornServers = {};

class WebcornServer {
    constructor(name, endpoint) {
        this.serverId = `server-${nextServerId++}`;
        this.serverName = name;
        this.lastUpdateTime = Date.now();
        this.endpoint = endpoint;
        this.endpoint.readyGo(this.serverId);
    }

    isActive(now) {
        now = now || Date.now();
        return now >= this.lastUpdateTime && now < this.lastUpdateTime + 1000;
    }

    async eventToRequest(event) {
        const url = new URL(event.request.url);
        const method = event.request.method;
        const scheme = url.protocol.slice(0, -1);
        const server = url.hostname;
        const port = url.port;
        const path = url.pathname;
        const query = url.search ? url.search.slice(1) : '';
        const headers = {};
        for (const [k, v] of event.request.headers) {
            if (k in headers) {
                headers[k] += ','+v;
            } else {
                headers[k] = v;
            }
        }
        const body = await event.request.arrayBuffer();

        let request = {
            method,
            scheme,
            server,
            port,
            path,
            query,
            headers,
            body
        };
        
        Comlink.transfer(request, [request.body]);
        return request;
    }

    async handleFetch(event) {
        const req = await this.eventToRequest(event);
        const res = await this.endpoint.handleRequest(req);
        return new Response(res.body, {
            status: res.status,
            headers: res.headers,
        });
    }
}


const ping = (serverId) => {
    const server = webcornServers[serverId];
    if (server) {
        server.lastUpdateTime = Date.now();
    }
}

const deleteOldCaches = async () => {
    const keyList = await self.caches.keys();
    const cachesToDelete = keyList.filter(key => key !== currentVersion);
    const deletes = cachesToDelete.map(async (key) => await self.caches.delete(key));
    await Promise.all(deletes);
}

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

const networkFirst = async (req) => {
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
        const res = await caches.match(req);
        if (res) {
            console.log("response from cache");
            return res;
        } else {
            return new Response("Network error!!!", {
                status: 408,
                headers: {"Content-Type": "text/plain; charset=utf-8"},
            });
        }
    }
}

const handleFetch = async event => {
    const url = new URL(event.request.url);

    console.log(`service worker: fetch received: ${event.request.url}`);

    const scope = self.registration.scope;

    if (url.href.startsWith(scope)) {
        const path = url.href.slice(scope.length);
        const index = path.indexOf('/');
        const serverName = index >= 0 ? path.substring(0, index) : path;
        const fileName = index >= 0 ? path.substring(index) : '';
        if (fileName === '/~webcorn' || fileName.startsWith('/~webcorn/')) {
            const now = Date.now();
            const servers = Object.values(webcornServers).filter(server => server.serverName === serverName && server.isActive(now));
            if (servers.length === 1) {
                return await servers[0].handleFetch(event);
            } else if (servers.length > 1) {
                const index = Math.floor(Math.random() * servers.length);
                return await servers[index].handleFetch(event);
            } else {
                const msg = "Server not Started";
                console.log(msg);
                return new Response(msg, {
                    status: 500,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                    },
                });
            }
        } else if (fileName.endsWith('.zip')) {
            return await networkFirst(event.request);
        }
    }
    return await cacheFirst(event.request);
}

// webcorn server will register to this service worker
export const startWebServer = () => {
    self.addEventListener('install', async e => {
        // scope是一个字符串格式的URL，如：http://localhost:8080/webcorn/
        const scope = self.registration.scope;
        console.log(`installing service worker: ${scope}`)
        //await self.skipWaiting();
    });

    self.addEventListener('activate', async event => {
        console.log("activating service worker")
        event.waitUntil(deleteOldCaches());
        //await self.clients.claim();
    });

    self.addEventListener('fetch', async event => {
        event.respondWith(handleFetch(event));
    });

    self.addEventListener('message', async event => {
        const data = event.data;
        console.log(data);
        if (data.type === 'server-ready') {
            const pingPort = event.ports[0];
            const requestPort = event.ports[1];
            Comlink.expose({ping}, pingPort);
            const endpoint = Comlink.wrap(requestPort);
            const server = new WebcornServer(data.name, endpoint);
            webcornServers[server.serverId] = server;
        }
    })
}
