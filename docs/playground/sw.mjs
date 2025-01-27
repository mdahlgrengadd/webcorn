/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const proxyMarker = Symbol("Comlink.proxy");
const createEndpoint = Symbol("Comlink.endpoint");
const releaseProxy = Symbol("Comlink.releaseProxy");
const finalizer = Symbol("Comlink.finalizer");
const throwMarker = Symbol("Comlink.thrown");
const isObject = (val) => (typeof val === "object" && val !== null) || typeof val === "function";
/**
 * Internal transfer handle to handle objects marked to proxy.
 */
const proxyTransferHandler = {
    canHandle: (val) => isObject(val) && val[proxyMarker],
    serialize(obj) {
        const { port1, port2 } = new MessageChannel();
        expose(obj, port1);
        return [port2, [port2]];
    },
    deserialize(port) {
        port.start();
        return wrap(port);
    },
};
/**
 * Internal transfer handler to handle thrown exceptions.
 */
const throwTransferHandler = {
    canHandle: (value) => isObject(value) && throwMarker in value,
    serialize({ value }) {
        let serialized;
        if (value instanceof Error) {
            serialized = {
                isError: true,
                value: {
                    message: value.message,
                    name: value.name,
                    stack: value.stack,
                },
            };
        }
        else {
            serialized = { isError: false, value };
        }
        return [serialized, []];
    },
    deserialize(serialized) {
        if (serialized.isError) {
            throw Object.assign(new Error(serialized.value.message), serialized.value);
        }
        throw serialized.value;
    },
};
/**
 * Allows customizing the serialization of certain values.
 */
const transferHandlers = new Map([
    ["proxy", proxyTransferHandler],
    ["throw", throwTransferHandler],
]);
function isAllowedOrigin(allowedOrigins, origin) {
    for (const allowedOrigin of allowedOrigins) {
        if (origin === allowedOrigin || allowedOrigin === "*") {
            return true;
        }
        if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
            return true;
        }
    }
    return false;
}
function expose(obj, ep = globalThis, allowedOrigins = ["*"]) {
    ep.addEventListener("message", function callback(ev) {
        if (!ev || !ev.data) {
            return;
        }
        if (!isAllowedOrigin(allowedOrigins, ev.origin)) {
            console.warn(`Invalid origin '${ev.origin}' for comlink proxy`);
            return;
        }
        const { id, type, path } = Object.assign({ path: [] }, ev.data);
        const argumentList = (ev.data.argumentList || []).map(fromWireValue);
        let returnValue;
        try {
            const parent = path.slice(0, -1).reduce((obj, prop) => obj[prop], obj);
            const rawValue = path.reduce((obj, prop) => obj[prop], obj);
            switch (type) {
                case "GET" /* MessageType.GET */:
                    {
                        returnValue = rawValue;
                    }
                    break;
                case "SET" /* MessageType.SET */:
                    {
                        parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
                        returnValue = true;
                    }
                    break;
                case "APPLY" /* MessageType.APPLY */:
                    {
                        returnValue = rawValue.apply(parent, argumentList);
                    }
                    break;
                case "CONSTRUCT" /* MessageType.CONSTRUCT */:
                    {
                        const value = new rawValue(...argumentList);
                        returnValue = proxy(value);
                    }
                    break;
                case "ENDPOINT" /* MessageType.ENDPOINT */:
                    {
                        const { port1, port2 } = new MessageChannel();
                        expose(obj, port2);
                        returnValue = transfer(port1, [port1]);
                    }
                    break;
                case "RELEASE" /* MessageType.RELEASE */:
                    {
                        returnValue = undefined;
                    }
                    break;
                default:
                    return;
            }
        }
        catch (value) {
            returnValue = { value, [throwMarker]: 0 };
        }
        Promise.resolve(returnValue)
            .catch((value) => {
            return { value, [throwMarker]: 0 };
        })
            .then((returnValue) => {
            const [wireValue, transferables] = toWireValue(returnValue);
            ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
            if (type === "RELEASE" /* MessageType.RELEASE */) {
                // detach and deactive after sending release response above.
                ep.removeEventListener("message", callback);
                closeEndPoint(ep);
                if (finalizer in obj && typeof obj[finalizer] === "function") {
                    obj[finalizer]();
                }
            }
        })
            .catch((error) => {
            // Send Serialization Error To Caller
            const [wireValue, transferables] = toWireValue({
                value: new TypeError("Unserializable return value"),
                [throwMarker]: 0,
            });
            ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
        });
    });
    if (ep.start) {
        ep.start();
    }
}
function isMessagePort(endpoint) {
    return endpoint.constructor.name === "MessagePort";
}
function closeEndPoint(endpoint) {
    if (isMessagePort(endpoint))
        endpoint.close();
}
function wrap(ep, target) {
    const pendingListeners = new Map();
    ep.addEventListener("message", function handleMessage(ev) {
        const { data } = ev;
        if (!data || !data.id) {
            return;
        }
        const resolver = pendingListeners.get(data.id);
        if (!resolver) {
            return;
        }
        try {
            resolver(data);
        }
        finally {
            pendingListeners.delete(data.id);
        }
    });
    return createProxy(ep, pendingListeners, [], target);
}
function throwIfProxyReleased(isReleased) {
    if (isReleased) {
        throw new Error("Proxy has been released and is not useable");
    }
}
function releaseEndpoint(ep) {
    return requestResponseMessage(ep, new Map(), {
        type: "RELEASE" /* MessageType.RELEASE */,
    }).then(() => {
        closeEndPoint(ep);
    });
}
const proxyCounter = new WeakMap();
const proxyFinalizers = "FinalizationRegistry" in globalThis &&
    new FinalizationRegistry((ep) => {
        const newCount = (proxyCounter.get(ep) || 0) - 1;
        proxyCounter.set(ep, newCount);
        if (newCount === 0) {
            releaseEndpoint(ep);
        }
    });
function registerProxy(proxy, ep) {
    const newCount = (proxyCounter.get(ep) || 0) + 1;
    proxyCounter.set(ep, newCount);
    if (proxyFinalizers) {
        proxyFinalizers.register(proxy, ep, proxy);
    }
}
function unregisterProxy(proxy) {
    if (proxyFinalizers) {
        proxyFinalizers.unregister(proxy);
    }
}
function createProxy(ep, pendingListeners, path = [], target = function () { }) {
    let isProxyReleased = false;
    const proxy = new Proxy(target, {
        get(_target, prop) {
            throwIfProxyReleased(isProxyReleased);
            if (prop === releaseProxy) {
                return () => {
                    unregisterProxy(proxy);
                    releaseEndpoint(ep);
                    pendingListeners.clear();
                    isProxyReleased = true;
                };
            }
            if (prop === "then") {
                if (path.length === 0) {
                    return { then: () => proxy };
                }
                const r = requestResponseMessage(ep, pendingListeners, {
                    type: "GET" /* MessageType.GET */,
                    path: path.map((p) => p.toString()),
                }).then(fromWireValue);
                return r.then.bind(r);
            }
            return createProxy(ep, pendingListeners, [...path, prop]);
        },
        set(_target, prop, rawValue) {
            throwIfProxyReleased(isProxyReleased);
            // FIXME: ES6 Proxy Handler `set` methods are supposed to return a
            // boolean. To show good will, we return true asynchronously ¯\_(ツ)_/¯
            const [value, transferables] = toWireValue(rawValue);
            return requestResponseMessage(ep, pendingListeners, {
                type: "SET" /* MessageType.SET */,
                path: [...path, prop].map((p) => p.toString()),
                value,
            }, transferables).then(fromWireValue);
        },
        apply(_target, _thisArg, rawArgumentList) {
            throwIfProxyReleased(isProxyReleased);
            const last = path[path.length - 1];
            if (last === createEndpoint) {
                return requestResponseMessage(ep, pendingListeners, {
                    type: "ENDPOINT" /* MessageType.ENDPOINT */,
                }).then(fromWireValue);
            }
            // We just pretend that `bind()` didn’t happen.
            if (last === "bind") {
                return createProxy(ep, pendingListeners, path.slice(0, -1));
            }
            const [argumentList, transferables] = processArguments(rawArgumentList);
            return requestResponseMessage(ep, pendingListeners, {
                type: "APPLY" /* MessageType.APPLY */,
                path: path.map((p) => p.toString()),
                argumentList,
            }, transferables).then(fromWireValue);
        },
        construct(_target, rawArgumentList) {
            throwIfProxyReleased(isProxyReleased);
            const [argumentList, transferables] = processArguments(rawArgumentList);
            return requestResponseMessage(ep, pendingListeners, {
                type: "CONSTRUCT" /* MessageType.CONSTRUCT */,
                path: path.map((p) => p.toString()),
                argumentList,
            }, transferables).then(fromWireValue);
        },
    });
    registerProxy(proxy, ep);
    return proxy;
}
function myFlat(arr) {
    return Array.prototype.concat.apply([], arr);
}
function processArguments(argumentList) {
    const processed = argumentList.map(toWireValue);
    return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
}
const transferCache = new WeakMap();
function transfer(obj, transfers) {
    transferCache.set(obj, transfers);
    return obj;
}
function proxy(obj) {
    return Object.assign(obj, { [proxyMarker]: true });
}
function toWireValue(value) {
    for (const [name, handler] of transferHandlers) {
        if (handler.canHandle(value)) {
            const [serializedValue, transferables] = handler.serialize(value);
            return [
                {
                    type: "HANDLER" /* WireValueType.HANDLER */,
                    name,
                    value: serializedValue,
                },
                transferables,
            ];
        }
    }
    return [
        {
            type: "RAW" /* WireValueType.RAW */,
            value,
        },
        transferCache.get(value) || [],
    ];
}
function fromWireValue(value) {
    switch (value.type) {
        case "HANDLER" /* WireValueType.HANDLER */:
            return transferHandlers.get(value.name).deserialize(value.value);
        case "RAW" /* WireValueType.RAW */:
            return value.value;
    }
}
function requestResponseMessage(ep, pendingListeners, msg, transfers) {
    return new Promise((resolve) => {
        const id = generateUUID();
        pendingListeners.set(id, resolve);
        if (ep.start) {
            ep.start();
        }
        ep.postMessage(Object.assign({ id }, msg), transfers);
    });
}
function generateUUID() {
    return new Array(4)
        .fill(0)
        .map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16))
        .join("-");
}

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
        
        transfer(request, [request.body]);
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
};

const deleteOldCaches = async () => {
    const keyList = await self.caches.keys();
    const cachesToDelete = keyList.filter(key => key !== currentVersion);
    const deletes = cachesToDelete.map(async (key) => await self.caches.delete(key));
    await Promise.all(deletes);
};

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
};

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
};

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
};

// webcorn server will register to this service worker
const startWebServer = () => {
    self.addEventListener('install', async e => {
        // scope是一个字符串格式的URL，如：http://localhost:8080/webcorn/
        const scope = self.registration.scope;
        console.log(`installing service worker: ${scope}`);
        //await self.skipWaiting();
    });

    self.addEventListener('activate', async event => {
        console.log("activating service worker");
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
            expose({ping}, pingPort);
            const endpoint = wrap(requestPort);
            const server = new WebcornServer(data.name, endpoint);
            webcornServers[server.serverId] = server;
        }
    });
};

startWebServer();
