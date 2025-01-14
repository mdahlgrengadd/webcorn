import * as Comlink from "comlink";

const currentVersion = 'v1';
let webcornServer;
let serverConfig;

// self.location代表了service-worker.mjs文件的路径
console.log(`enter service-worker.js from location: ${self.location}`);

console.log(`self.registration.scope is ${self.registration.scope}`);

const joinUrl = (base, sub) => {
    const url = new URL(base);

    const path = sub.replace(/^\/+|\/+$/g, '');
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.pathname += '/' + path;
    return url.toString();
}

const addResourcesToCache = async (resources) => {
    const cache = await self.caches.open(currentVersion);
    await cache.addAll(resources);
};

self.addEventListener('install', async e => {
    // scope是一个字符串格式的URL，如：http://localhost:8080/webcorn/
    const scope = self.registration.scope;
    console.log(`installing service worker: ${scope}`)

    e.waitUntil(
        addResourcesToCache([
            joinUrl(scope, 'config'),
            joinUrl(scope, 'server/index.html'),
            joinUrl(scope, 'server/index.mjs'),
            joinUrl(scope, 'server/worker.mjs'),
            joinUrl(scope, 'server/webcorn.py'),
            /*
            joinUrl(scope, 'server/pyodide-lock.json'),
            joinUrl(scope, 'server/pyodide.asm.js'),
            joinUrl(scope, 'server/pyodide.asm.wasm'),
            joinUrl(scope, 'server/pyodide.d.ts'),
            joinUrl(scope, 'server/pyodide.js'),
            joinUrl(scope, 'server/pyodide.js.map'),
            joinUrl(scope, 'server/pyodide.mjs'),
            joinUrl(scope, 'server/pyodide.mjs.map'),
            joinUrl(scope, 'server/python_stdlib.zip'),
            */
        ])
    )
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

self.addEventListener('message', async event => {
    const data = event.data;
    console.log(data);
    if (data.type === 'server-ready') {
        if (!webcornServer) {
            webcornServer = {
                lastUpdateTime: Date.now(),
            };
            const pingPort = event.ports[0];
            const requestPort = event.ports[1];
            const ping = () => {
                //console.log('service worker message: ping from server');
                webcornServer.lastUpdateTime = Date.now();
            }
            Comlink.expose({ping}, pingPort);
            webcornServer.endpoint = Comlink.wrap(requestPort);
        }
    }
})

self.addEventListener('fetch', async event => {
    event.respondWith(handleFetch(event));
});

const updateConfig = async () => {
    if (!serverConfig) {
        const scope = self.registration.scope;
        const response = await self.caches.match(joinUrl(scope, 'config'));
        serverConfig = await response.json();
        serverConfig.appUrl = joinUrl(scope, serverConfig.appUrl);
        serverConfig.serverUrl = joinUrl(scope, serverConfig.serverUrl);
        serverConfig.staticUrl = joinUrl(scope, serverConfig.staticUrl);
    }
}

const getRequest = async (event) => {
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
};

const putInCache = async (req, res) => {
    console.log("put in cache");
    const cache = await caches.open(currentVersion);
    await cache.put(req, res)
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
            putInCache(req, newres.clone());
        }
        return newres;
    } catch (err) {
        return new Response("Network error!!!", {
            status: 408,
            headers: {"Content-Type": "text/plain; charset=utf-8"},
        });
    }
}


/**
 * fetch主要有两个客户端：
 * 1. app
 *    所有应用请求都通过app url进行访问
 * 
 * 2. server
 *    服务端首页(console)通过server url进行访问，后续获取config和上报ready事件都
 *    通过server url上报
 * 
 * 3. ide
 *    开发环境通过ide url进行访问
 * @param {} event 
 * @returns 
 */
const handleFetch = async event => {
    const url = new URL(event.request.url);

    const method = event.request.method;
    const scheme = url.protocol.slice(0, -1);
    const hostname = url.hostname;
    const port = url.port;
    const path = url.pathname;

    await updateConfig();

    console.log(`service worker: fetch received: ${event.request.url}`);

    const serverUrl = serverConfig.serverUrl;

    const serverConfigUrl = joinUrl(serverUrl, 'config');

    const appUrl = serverConfig.appUrl;

    const staticUrl = serverConfig.staticUrl;

    if (method === 'GET' && url.href === serverConfigUrl) {
        return new Response(JSON.stringify(serverConfig), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            }
        })
    } else if (method === 'GET' && url.href.startsWith(serverUrl)) {
        return await caches.match(event.request);
    //} else if (url.href.startsWith(staticUrl)) {
    //    // TODO handle static files
    } else if (url.href.startsWith(appUrl)) {
        console.log('service worker: app request');
        const now = Date.now();
        if (!webcornServer || now > webcornServer.lastUpdateTime + 1000) {
            webcornServer = null;
            console.log(`server not started`);
            return new Response("Server not Started", {
                status: 500,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
        const req = await getRequest(event);
        const res = await webcornServer.endpoint.handleRequest(req);
        return new Response(res.body, {
            status: res.status,
            headers: res.headers,
        });
    } else {
        return await cacheFirst(event.request);
    }
}

const buildScope = async (request) => {
    const url = new URL(request.url);
    const method = url.method;
    const scheme = url.protocol.slice(0, -1);
    const hostname = url.hostname;
    const port = url.port;
    const path = url.pathname;
    const query_string = url.search ? url.search.slice(1) : '';
    const headers = {};
    for (const [k, v] of request.headers) {
        if (k in headers) {
            headers[k] += ','+v;
        } else {
            headers[k] = v;
        }
    }
    const bytes = await request.bytes();

    const version = '3.0';
    const spec_version = '2.3';
    const state = {};
    const scope = {
        type: 'http',
        asgi: {version, spec_version},
        http_version: '1.1',
        method,
        scheme,
        path, //转为bytes
        raw_path: path, //转为bytes
        query_string, //转为bytes
        root_path: '',
        headers,
        client: ['127.0.0.1', 0],
        server: [hostname, port],
        state,
    }
    return scope;
}
