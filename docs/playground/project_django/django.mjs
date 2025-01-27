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

const webcornConfig = {
    pyodideUrl: null,
    projectRoot: '/',
    appSpec: 'app:app',
    appUrl: 'app',
    log: null,
};

const WORKER_JS = `
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
            console.warn(\`Invalid origin '\${ev.origin}' for comlink proxy\`);
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
            // FIXME: ES6 Proxy Handler \`set\` methods are supposed to return a
            // boolean. To show good will, we return true asynchronously ¯\\_(ツ)_/¯
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
            // We just pretend that \`bind()\` didn’t happen.
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

// This is the web worker main js that run the webcorn server

let started = false;
let isWsgi = true;
let isAsgi = false;
let pyodide;
let console$1 = self.console;

const WEBCORN_PY = \`
# some of the code from uvicorn

from functools import partial
from asyncio import iscoroutinefunction
from importlib import import_module
from pathlib import Path
from urllib.parse import urlparse, urljoin
from collections.abc import Iterable
import traceback
import asyncio
import inspect
import time
import sys
import os
from io import BytesIO
from pyodide.ffi import to_js
from pyodide.http import pyfetch
from js import Object
from platform import python_implementation
import micropip

version = '0.2.5'
js_console = None
application = None
is_wsgi = True
is_asgi = False
app_root = ''
server_version = f'Webcorn/{version} {python_implementation()}/{sys.version.split()[0]}'
is_django = False
wsgi_server = None
asgi_server = None

class Logger:
    def __init__(self, name):
        self.name = name
    def info(self, msg, *args):
        if js_console:
            js_console.log(msg % args)
    def error(self, msg, *args):
        if js_console:
            js_console.log(msg % args)


class ErrorStream:
    def __init__(self, console):
        self.console = console

    def flush(self):
        pass

    def write(self, msg):
        self.console.log(msg)

    def writelines(self, msgs):
        for msg in msgs:
            self.console.log(msg)


def is_wsgi_app(app):
    # 检查对象是否可调用
    if not callable(app):
        return False

    # 检查参数签名
    sig = inspect.signature(app)
    params = list(sig.parameters.keys())
    # WSGI 应用的参数应该是 environ 和 start_response
    if len(params) != 2: # or params[0] != 'environ' or params[1] != 'start_response':
        return False
    return True


def is_async_callable(obj):
    while isinstance(obj, partial):
        obj = obj.func
    return (iscoroutinefunction(obj) or 
            (callable(obj) and
             iscoroutinefunction(obj.__call__)))


def is_asgi_app(app):
    if not is_async_callable(app):
        return False
    sig = inspect.signature(app)
    params = list(sig.parameters.keys())
    if len(params) == 3:
        return True
    return False


async def install_dependencies(root):
    # Django need sqlite3
    await micropip.install('sqlite3')

    # FastAPI need ssl
    await micropip.install('ssl')

    requirements = root / 'requirements.txt'
    if requirements.is_file():
        with requirements.open('r') as f:
            requirements = f.readlines()
        requirements = [req.strip() for req in requirements if req.strip() and not req.startswith('#')]
        for req in requirements:
            await micropip.install(req)
        return
    pyproject = root / 'pyproject.toml'
    if pyproject.is_file():
        await micropip.install('toml')
        import toml
        pyproject = toml.load(pyproject)
        project = pyproject.get('project')
        if project:
            deps = project.get('dependencies')
            if deps:
                for dep in deps:
                    await micropip.install(dep)
        return


async def setup(project_root, app_spec, app_url):
    global app_root
    path = Path(project_root)
    if not path.is_dir():
        zipurl = urljoin(app_url, f'{path.name}.zip')
        response = await pyfetch(zipurl)
        await response.unpack_archive(extract_dir=path.parent)
    os.chdir(project_root)

    await install_dependencies(path)

    app_url = urlparse(app_url)
    app_root = app_url.path

    try:
        from django.urls import set_script_prefix
        # 将app_root设置到django.urls thread local的_prefixes中
        set_script_prefix(app_root)
    except:
        pass

    fspath, _, _ = app_spec.rpartition('/')
    if not fspath:
        syspaths = [Path('.').resolve(), Path('src').resolve()]
    else:
        syspaths = [Path(fspath).resolve()]
    for p in reversed(syspaths):
        p = str(p)
        if p not in sys.path:
            sys.path.insert(0, p)
    return syspaths


def normalize_headers(headers):
    oheaders = {}
    for k, v in headers:
        k = k.lower()
        v = v.strip()
        if k == 'set-cookie':
            vs = v.split(';')
            vs = [v.strip() for v in vs if v.strip().lower() != 'httponly']
            v = '; '.join(vs)
            if k in oheaders:
                oheaders[k].append(v)
            else:
                oheaders[k] = [v]
        else:
            if k in oheaders:
                oheaders[k] += ',' + v
            else:
                oheaders[k] = v
    return oheaders


class WsgiServer:
    def __init__(self):
        self.startup_failed = False

    async def check_django(self):
        """django开发态的静态文件处理比较特殊，需要在这里单独配置"""
        global is_django, application
        try:
            from django.conf import settings
            installed_apps = settings.INSTALLED_APPS
            is_django = True

            # Django need tzdata
            await micropip.install('tzdata')

            # Django check running event loop
            os.environ['DJANGO_ALLOW_ASYNC_UNSAFE'] = 'true'

            if 'django.contrib.staticfiles' in installed_apps:
                from django.contrib.staticfiles.handlers import StaticFilesHandlerMixin
                from django.core.handlers.wsgi import WSGIHandler, get_path_info, get_script_name

                # staticfiles.StaticFilesHandler有bug，没有考虑script_name
                class StaticFilesHandler(StaticFilesHandlerMixin, WSGIHandler):
                    def __init__(self, application):
                        self.application = application
                        self.base_url = urlparse(self.get_base_url())
                        super().__init__()

                    def __call__(self, environ, start_response):
                        script_name = get_script_name(environ)
                        path_info = get_path_info(environ) or '/'
                        path = f'{script_name.rstrip("/")}/{path_info.replace("/", "", 1)}'
                        if not self._should_handle(path):
                            return self.application(environ, start_response)
                        return super().__call__(environ, start_response)
                application = StaticFilesHandler(application)
        except Exception:
            pass

    async def startup(self):
        await self.check_django()

    def build_environ(self, request, stderr):
        pathname = request['path']
        if pathname.startswith(app_root):
            pathname = pathname[len(app_root):]
        stdin = BytesIO(request['body'])
        environ = {
            'REQUEST_METHOD': request['method'],
            'SCRIPT_NAME': app_root,
            'PATH_INFO': pathname,
            'QUERY_STRING': request['query'],
            'SERVER_NAME': request['server'],
            'SERVER_PORT': str(request['port']) or ('443' if request['scheme'] == 'https' else '80'),
            'SERVER_PROTOCOL': 'HTTP/1.0',
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': request['scheme'],
            'wsgi.input': stdin,
            'wsgi.errors': stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': True,
            'wsgi.run_once': False,
        }
        headers = request['headers']
        if 'content-type' in headers:
            environ['CONTENT_TYPE'] = headers['content-type']
        else:
            environ['CONTENT_TYPE'] = 'text/plain' 
        if 'content-length' in headers:
            environ['CONTENT_LENGTH'] = headers['content-length']
        else:
            environ['CONTENT_LENGTH'] = str(len(request['body']))

        for k, v in headers.items():
            k = k.replace('-', '_').upper()
            v = v.strip()
            if k in environ:
                continue
            k = f'HTTP_{k}'
            if k in environ:
                environ[k] += ',' + v
            else:
                environ[k] = v
        return environ


    def handle_request(self, request):
        stdout = BytesIO()
        stderr = ErrorStream(js_console)
        environ = self.build_environ(request, stderr)

        options = {
            'status': 0,
            'headers': {
                'server': server_version,
            },
        }

        def start_response(status, headers, exc_info=None):
            if options['status'] != 0 and not exc_info:
                raise AssertionError("Headers already set")
            code, _msg = status.split(None, 1)
            options['status'] = int(code)
            options['headers'].update(normalize_headers(headers))
            return stdout.write

        try:
            app_iter = application(environ, start_response)
            for data in app_iter:
                stdout.write(data)
        except Exception as e:
            print(e)
            raise
        finally:
            if app_iter and hasattr(app_iter, 'close'):
                app_iter.close()
        return {
            'status': options['status'],
            'headers': options['headers'],
            'body': stdout.getbuffer(),
        }


class AsgiServer:
    STATE_TRANSITION_ERROR = "Got invalid state transition on lifespan protocol."
    APPLICATION_CHECKER_INTERVAL = 0.1
    def __init__(self, max_app_count=1000):
        self.max_app_count = max_app_count
        self.instances = {}
        self.next_instance_id = 1000
        self.state = {}
        self.logger = Logger('webcorn.error')
        self.startup_event = asyncio.Event()
        self.shutdown_event = asyncio.Event()
        self.receive_queue = asyncio.Queue()
        self.error_occured = False
        self.startup_failed = False
        self.shutdown_failed = False
        self.should_exit = False
        self.access_logger = Logger('webcorn.access')

    async def startup(self):
        self.logger.info("Waiting for application startup.")
        checker_task = asyncio.create_task(self.application_checker())
        main_lifespan_task = asyncio.create_task(self.lifespan())  # noqa: F841
        # Keep a hard reference to prevent garbage collection
        # See https://github.com/encode/uvicorn/pull/972
        await self.receive_queue.put({'type': 'lifespan.startup'})
        await self.startup_event.wait()
        if self.startup_failed or self.error_occured:
            self.logger.error("Application startup failed. Exiting.")
            self.should_exit = True
        else:
            self.logger.info("Application startup complete.")

    async def shutdown(self) -> None:
        if self.error_occured:
            return
        self.logger.info("Waiting for application shutdown.")
        await self.receive_queue.put({'type': 'lifespan.shutdown'})
        await self.shutdown_event.wait()

        if self.shutdown_failed or self.error_occured:
            self.logger.error("Application shutdown failed. Exiting.")
            self.should_exit = True
        else:
            self.logger.info("Application shutdown complete.")

    async def lifespan(self) -> None:
        try:
            scope = {
                "type": "lifespan",
                "asgi": {"version": '3.0', "spec_version": "2.0"},
                "state": self.state,
            }
            await application(scope, self.receive_queue.get, self.lifespan_send)
        except BaseException as exc:
            self.error_occured = True
            if self.startup_failed or self.shutdown_failed:
                return
            msg = "ASGI 'lifespan' protocol appears unsupported."
            self.logger.info(msg)
        finally:
            self.startup_event.set()
            self.shutdown_event.set()

    async def lifespan_send(self, message):
        assert message["type"] in (
            "lifespan.startup.complete",
            "lifespan.startup.failed",
            "lifespan.shutdown.complete",
            "lifespan.shutdown.failed",
        )
        if message["type"] == "lifespan.startup.complete":
            assert not self.startup_event.is_set(), self.STATE_TRANSITION_ERROR
            assert not self.shutdown_event.is_set(), self.STATE_TRANSITION_ERROR
            self.startup_event.set()
        elif message["type"] == "lifespan.startup.failed":
            assert not self.startup_event.is_set(), self.STATE_TRANSITION_ERROR
            assert not self.shutdown_event.is_set(), self.STATE_TRANSITION_ERROR
            self.startup_event.set()
            self.startup_failed = True
            if message.get("message"):
                self.logger.error(message["message"])
        elif message["type"] == "lifespan.shutdown.complete":
            assert self.startup_event.is_set(), self.STATE_TRANSITION_ERROR
            assert not self.shutdown_event.is_set(), self.STATE_TRANSITION_ERROR
            self.shutdown_event.set()
        elif message["type"] == "lifespan.shutdown.failed":
            assert self.startup_event.is_set(), self.STATE_TRANSITION_ERROR
            assert not self.shutdown_event.is_set(), self.STATE_TRANSITION_ERROR
            self.shutdown_event.set()
            self.shutdown_failed = True
            if message.get("message"):
                self.logger.error(message["message"])

    def build_scope(self, request):
        path = request['path']
        headers = [[k.encode(), v.encode()] for k, v in request['headers'].items()]
        scope = {
            'type': 'http',
            'asgi': {
                'version': '3.0',
                'spec_version': '2.0',
            },
            'http_version': '1.1',
            'method': request['method'],
            'scheme': request['scheme'],
            'path': path,
            'raw_path': path.encode(),
            'query_string': request['query'].encode(),
            'root_path': app_root,
            'headers': headers,
            'client': None,
            'server': [request['server'], request['port']],
            'state': self.state.copy(),
        }
        return scope

    async def handle_request(self, request):
        scope = self.build_scope(request)
        instance_id = f'inst-{self.next_instance_id}'
        self.next_instance_id += 1
        instance = self.get_or_create_application_instance(instance_id, scope)
        instance['input_queue'].put_nowait({'type': 'http.request', 'body': request['body']})
        webcorn = instance['webcorn']
        await webcorn['message_event'].wait()
        webcorn['message_event'].clear()
        result = {
            'status': webcorn['status'],
            'headers': webcorn['headers'],
            'body': webcorn['output'].getbuffer(),
        }
        self.delete_application_instance(instance_id)
        return result

    async def application_send(self, instance_id, message):
        instance = self.instances[instance_id]
        webcorn = instance['webcorn']
        scope = instance['scope']
        message_type = message["type"]
        if not webcorn.get('response_started'):
            if message_type != 'http.response.start':
                msg = 'Expected ASGI message "http.response.start", but got "%s".'
                raise RuntimeError(msg % message_type)
            webcorn['response_started'] = True
            webcorn['status'] = message['status']
            headers = [(k.decode(), v.decode()) for (k, v) in message.get('headers', [])]
            webcorn['headers'].update(normalize_headers(headers))
            path_with_query_string = scope.get('path')
            if scope.get('query_string'):
                path_with_query_string += '?' + scope.get('query_string').decode()
            self.access_logger.info(
                '%s - "%s %s HTTP/%s" %d',
                scope.get('client'),
                scope["method"],
                path_with_query_string,
                scope["http_version"],
                message['status'],
            )
        elif not webcorn.get('response_complete'):
            # Sending response body
            if message_type != "http.response.body":
                msg = "Expected ASGI message 'http.response.body', but got '%s'."
                raise RuntimeError(msg % message_type)
            body = message.get("body", b"")
            more_body = message.get("more_body", False)
            # Write response body
            data = b"" if scope["method"] == "HEAD" else body
            output = webcorn['output']
            output.write(data)
            # Handle response completion
            if not more_body:
                webcorn['response_complete'] = True
                webcorn['message_event'].set()
        else:
            # Response already sent
            msg = "Unexpected ASGI message '%s' sent, after response already completed."
            raise RuntimeError(msg % message_type)

    async def application_checker(self):
        """
        Goes through the set of current application instance Futures and cleans up
        any that are done/prints exceptions for any that errored.
        """
        while True:
            await asyncio.sleep(self.APPLICATION_CHECKER_INTERVAL)
            for instance_id, instance in list(self.instances.items()):
                if instance["future"].done():
                    exception = instance["future"].exception()
                    if exception:
                        await self.application_exception(exception, instance)
                    try:
                        del self.instances[instance_id]
                    except KeyError:
                        # Exception handling might have already got here before us. That's fine.
                        pass

    async def application_exception(self, exception, application_details):
        """
        Called whenever an application coroutine has an exception.
        """
        logging.error(
            "Exception inside application: %s\\\\n%s%s",
            exception,
            "".join(traceback.format_tb(exception.__traceback__)),
            f"  {exception}",
        ) 

    def get_or_create_application_instance(self, instance_id, scope):
        """
        Creates an application instance and returns its queue.
        """
        if instance_id in self.instances:
            self.instances[instance_id]["last_used"] = time.time()
            return self.instances[instance_id]
        # See if we need to delete an old one
        while len(self.instances) > self.max_app_count:
            self.delete_oldest_application_instance()
        # Make an instance of the application
        input_queue = asyncio.Queue()
        # Run it, and stash the future for later checking
        future = asyncio.ensure_future(
            application(
                scope=scope,
                receive=input_queue.get,
                send=lambda message: self.application_send(instance_id, message),
            ),
        )
        self.instances[instance_id] = {
            "id": instance_id,
            "input_queue": input_queue,
            "future": future,
            "scope": scope,
            "last_used": time.time(),
            'webcorn': {
                'output': BytesIO(),
                'response_started': False,
                'response_complete': False,
                'message_event': asyncio.Event(),
                'status': 500,
                'headers': {
                    'server': server_version,
                },
            },
        }
        return self.instances[instance_id]

    def delete_oldest_application_instance(self):
        """
        Finds and deletes the oldest application instance
        """
        oldest_time = min(
            instance["last_used"] for instance in self.instances.values()
        )
        for instance_id, instance in self.instances.items():
            if instance["last_used"] == oldest_time:
                self.delete_application_instance(instance_id)
                # Return to make sure we only delete one in case two have
                # the same oldest time
                return

    def delete_application_instance(self, instance_id):
        """
        Removes an application instance (makes sure its task is stopped,
        then removes it from the current set)
        """
        instance = self.instances[instance_id]
        del self.instances[instance_id]
        if not instance["future"].done():
            instance["future"].cancel()


async def start_wsgi():
    global wsgi_server
    wsgi_server = WsgiServer()
    await wsgi_server.startup()
    return not wsgi_server.startup_failed

async def start_asgi():
    global asgi_server
    asgi_server = AsgiServer()
    await asgi_server.startup()
    return not asgi_server.startup_failed

async def load_app(project_root, app_spec, app_url, console):
    global application, is_wsgi, is_asgi, js_console
    js_console = console
    await setup(project_root, app_spec, app_url)
    _, _, apppath = app_spec.rpartition('/')
    pypath, _, appname = apppath.partition(':')
    if not pypath:
        pypaths = ['main', 'app', 'api']
    else:
        pypaths = [pypath]
    for p in pypaths:
        try:
            module = import_module(p)
            pypath = p
            break
        except ModuleNotFoundError as e:
            if len(pypaths) == 1:
                raise
            if e.name != p:
                raise
            module = None
    if not module:
        raise RuntimeError(f"Can't find app module")
    if not appname:
        appnames = ['app', 'api']
    else:
        appnames = [appname]
    for name in appnames:
        instance = module
        try:
            for attr in name.split('.'):
                instance = getattr(instance, attr)
            appname = name
            break
        except AttributeError:
            if len(appnames) == 1:
                raise
            instance = None
    if not instance:
        raise RuntimeError(f"Can't find app object from module {module}")
    is_wsgi = is_wsgi_app(instance)
    is_asgi = is_asgi_app(instance)
    if not is_wsgi and not is_asgi:
        raise RuntimeError(f"app object should be wsgi app or asgi app")
    application = instance
    if is_wsgi:
        await start_wsgi()
    if is_asgi:
        await start_asgi()


def run_wsgi(request):
    request = request.to_py()
    response = wsgi_server.handle_request(request)
    return to_js(response, dict_converter=Object.fromEntries)


async def run_asgi(request):
    request = request.to_py()
    response = await asgi_server.handle_request(request)
    return to_js(response, dict_converter=Object.fromEntries)

\`;

const start = async (pyodideUrl, projectRoot, appSpec, appUrl, logger) => {
    console$1 = logger;
    let begin = performance.now();
    console$1.log("Loading pyodide...");
    const { loadPyodide } = await import(pyodideUrl);
    pyodide = await loadPyodide();
    let end = performance.now();
    let delta = (end-begin).toFixed(2);
    console$1.log(\`Loaded pyodide successfully in \${delta}ms\`);
    // Django login need hashlib.pbkdf2_hmac, so hashlib need to be installed
    // before import, micropip will import hashlib, so install before load micropip
    await pyodide.loadPackage('hashlib');
    await pyodide.loadPackage('micropip');
    await pyodide.runPythonAsync(WEBCORN_PY);
    await pyodide.globals.get('load_app')(projectRoot, appSpec, appUrl, console$1);
    isWsgi = pyodide.globals.get('is_wsgi');
    isAsgi = pyodide.globals.get('is_asgi');
    started = true;
    return isWsgi;
};

const handleRequest = async (request) => {
    const encoder = new TextEncoder();
    let response = {
        status: 500,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
        body: encoder.encode("server not started").buffer,
    };

    if (!started) {
        return response;
    }

    response.body = encoder.encode("server internal error").buffer;
    try {
        if (isWsgi) {
            response = pyodide.globals.get('run_wsgi')(request);
        } else if (isAsgi) {
            response = await pyodide.globals.get('run_asgi')(request);
        }

        // response.body is TypedArray, which is not transferable object,
        // response.body.buffer(ArrayBuffer) is.
        response.body = response.body.buffer;

        // simplify handling of seralization for postMessage
        response.headers = JSON.stringify(response.headers);
    } catch (e) {
        console$1.log(e);
    }
    transfer(response, [response.body]);
    return response;
};

expose({
    start,
    isWsgi,
    isAsgi,
    handleRequest,
});

`;

const WORKER_URL = URL.createObjectURL(new Blob([WORKER_JS], {type: 'text/javascript'}));

const consoleLog = (msg) => {
    if (webcornConfig.log) {
        webcornConfig.log(msg);
    }
};

const accessLog = (request, response) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth()+1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const time = `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
    const method = request.method;
    let path = request.path;
    if (request.query) path += '?' + request.query;
    const status = response.status;
    consoleLog(`${time} "${method} ${path}" ${status}`);
};

class WebcornWorker {
    constructor() {
        const parts = webcornConfig.projectRoot.split('/');
        this.name = parts[parts.length-1];
    }

    getLogger() {
        return proxy({ log: consoleLog });
    }

    async start() {
        this.worker = new Worker(WORKER_URL, {type: 'module', name: this.name});
        this.wrapper = wrap(this.worker);
        this.isWsgi = await this.wrapper.start(webcornConfig.pyodideUrl,
                                               webcornConfig.projectRoot,
                                               webcornConfig.appSpec,
                                               webcornConfig.appUrl,
                                               this.getLogger());
        this.maxCount = this.isWsgi ? 100 : 1000;
        this.activeCount = 0;
    }

    async handleRequest(request) {
        // Add cookie header in case the client user agent forgets
        if (document.cookie.length > 0 &&
            !Object.keys(request.headers).some(key => key.toLowerCase() === 'cookie')) {
            request.headers.cookie = document.cookie;
        }

        transfer(request, [request.body]);
        const response = await this.wrapper.handleRequest(request);
        transfer(response, [response.body]);

        response.headers = JSON.parse(response.headers);

        accessLog(request, response);

        // Save cookie because the user agent will remove 'set-cookie'
        // when composing Response object due to 'Forbidden response header'
        const setcookies = response.headers['set-cookie'] || [];
        for (const setcookie of setcookies) {
            document.cookie = setcookie;
        }
        delete response.headers['set-cookie'];

        // Remove X-Frame-Options in case webcorn client runs in an iframe
        delete response.headers['x-frame-options'];

        return response;
    }

    retain() {
        if (this.activeCount < this.maxCount) {
            this.activeCount ++;
            return true;
        } else {
            return false;
        }
    }

    release() {
        if (this.activeCount > 0) {
            this.activeCount --;
        }
    }
}

const workers = [];

const retainWorker = async () => {
    let worker;
    for (worker of workers) {
        if (worker.retain()) {
            return worker;
        }
    }
    if (!webcornConfig.pyodideUrl) {
        consoleLog("Webcorn is not configed, config first with configWebcorn(options).");
        return null;
    }
    worker = null;
    try {
        worker = new WebcornWorker();
        await worker.start();
        workers.push(worker);
        worker.retain();
        return worker;
    } catch (e) {
        consoleLog(e);
        // TODO do something?
    }
};

const handleRequest = async (request) => {
    let worker;
    try {
        worker = await retainWorker();
        if (worker) {
            const response = await worker.handleRequest(request);
            return response;
        }
    } catch (e) {
        consoleLog(e);
    } finally {
        if (worker) {
            worker.release();
        }
    }
    return {
        status: 500,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
        body: "server internal error",
    }
};

const startAppServer = (options) => {
    if (!navigator.serviceWorker.controller) {
        const msg = "Service Worker is not started, failed to start webcorn server!";
        consoleLog(msg);
        throw msg;
    }
    const {
        // pyodide v0.26.4没有wagtail依赖的pillow-heif版本，运行wagtail时，需要使用0.27.0
        // pyodide v0.27.0/0.27.1有[pydantic/pydantic-core版本不匹配的bug](https://github.com/pyodide/pyodide/issues/5336)，
        // 导致运行fastapi app时出错
        // 2025.1.24: 0.27.2解决了这个问题。
        pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs",
        projectRoot = '/',
        appSpec = 'app:app',
        log = null,
    } = options;
    webcornConfig.pyodideUrl = pyodideUrl;
    webcornConfig.projectRoot = projectRoot;
    webcornConfig.appSpec = appSpec;
    webcornConfig.log = log;
    webcornConfig.appUrl = new URL('./~webcorn', self.location).href;

    const serverUrl = new URL('.', self.location).href;
    const serverName = serverUrl.replace(/\/$/, '').split('/').pop();

    const { port1: pingPort1, port2: pingPort2 } = new MessageChannel();
    const { port1: requestPort1, port2: requestPort2 } = new MessageChannel();
    const pingTarget = wrap(pingPort1);
    let serverId = null;
    const ping = async () => {
        await pingTarget.ping(serverId);
        setTimeout(ping, 300);
    };
    const readyGo = (sid) => {
        serverId = sid;
        ping();
    };
    expose({ handleRequest, readyGo }, requestPort1);
    navigator.serviceWorker.controller.postMessage({type: 'server-ready', name: serverName}, [pingPort2, requestPort2]);
};

const options = {
        projectRoot: '/opt/project_django',
        appSpec: 'project_django.wsgi:application',
        log: addTerminalLine,
};
try {
    startAppServer(options);
} catch (e) {
    window.location = new URL('../', window.location).href;
}

// Add terminal functionality
const terminal = document.querySelector('.terminal-content');
function addTerminalLine(text) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Resizer functionality
function initializeResizer(resizerElement, prevElement, nextElement, isHorizontal = false) {
    let isResizing = false;
    let startPos = 0;
    let startSize = 0;
    let startSize2 = 0;

    resizerElement.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizerElement.classList.add('resizing');
        startPos = isHorizontal ? e.pageX : e.pageY;
        startSize = isHorizontal ? prevElement.offsetWidth : prevElement.offsetHeight;
        startSize2 = isHorizontal ? nextElement.offsetWidth : nextElement.offsetHeight;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isResizing) return;

        const currentPos = isHorizontal ? e.pageX : e.pageY;
        const diff = currentPos - startPos;

        const newPrevSize = Math.max(100, startSize + diff);
        const newNextSize = Math.max(150, startSize2 - diff);
        if (isHorizontal) {
            prevElement.style.width = `${newPrevSize}px`;
            nextElement.style.width = `${newNextSize}px`;
        } else {
            prevElement.style.height = `${newPrevSize}px`;
            nextElement.style.height = `${newNextSize}px`;
        }
    }

    function onMouseUp() {
        isResizing = false;
        resizerElement.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// Initialize resizers
const previewResizer = document.getElementById('preview-resizer');

initializeResizer(previewResizer, 
    document.querySelector('.preview'),
    document.querySelector('.main-content'));

setTimeout(() => addTerminalLine('Loading...'), 1000);


let appUrl = new URL('./~webcorn/admin', self.location).href;

const addressInput = document.querySelector('.address-input');
addressInput.value = appUrl;

const previewFrame = document.getElementById('previewFrame');

setTimeout(() => { previewFrame.src = appUrl; }, 1000);

addressInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        appUrl = addressInput.value;
        previewFrame.src = appUrl;
    }
});

const updateAddressValue = () => {
    if (document.activeElement !== addressInput) {
        const href = previewFrame.contentWindow.location.href;
        if (href !== addressInput.value) {
            addressInput.value = href;
        }
    }

    setTimeout(updateAddressValue, 100);
};

updateAddressValue();

const refreshButton = document.getElementById('refreshButton');
refreshButton.addEventListener('click', () => {
    appUrl = addressInput.value;
    previewFrame.src = appUrl;
});

const homeButton = document.getElementById('homeButton');
homeButton.addEventListener('click', () => {
    window.location = new URL('../', window.location).href;
});
