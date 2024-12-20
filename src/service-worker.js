import { loadPyodide } from "./pyodide.mjs";
// 静态加载pyodide.asm.js，否则在loadPyodide时将会动态加载，在module类型service worker中不支持动态加载
import "./pyodide.asm.js";

console.log(`enter service-worker.js from ${location}`);

self.addEventListener('install', e => {
    console.log("installing service worker")
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    console.log("activating service worker")
    self.clients.claim();
});

let pyodide;
let app;
let is_wsgi;

const buildEnviron = async (request) => {
    const url = new URL(request.url);
    const bytes = await request.bytes();
    const headers = request.headers;
    const environ = {
        REQUEST_METHOD: request.method,
        SCRIPT_NAME: '',
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search ? url.search.slice(1) : '',
        SERVER_NAME: url.hostname,
        SERVER_PORT: url.port,
        SERVER_PROTOCOL: 'HTTP/1.1',
        //'wsgi.version': (1, 0),
        'wsgi.url_scheme': url.protocol.slice(0, -1),
        //'wsgi.input': BytesIO(bytes),
        //'wsgi.errors': StringIO(),
        'wsgi.multithread': false,
        'wsgi.multiprocess': false,
        'wsgi.run_once': false,
    };
    if (headers.has('content-type')) {
        environ.CONTENT_TYPE = headers.get('content-type');
    } else {
        environ.CONTENT_TYPE = 'text/plain';
    }
    if (headers.has('content-length')) {
        environ.CONTENT_LENGTH = headers.get('content-length');
    } else {
        environ.CONTENT_LENGTH = ''
    }

    for (const [k, v] of headers) {
        const k1 = k.replace(/-/g, '_').toUpperCase();
        if (k1 in environ) continue;
        const k2 = `HTTP_${k1}`;
        if (k2 in environ) {
            environ[k2] += ','+v;
        } else {
            environ[k2] = v;
        }
    }
}

const handleFetch = async e => {
    console.log("fetch received by service worker");
    const request = e.request;
    let begin;
    let end;
    let app;
    let is_wsgi;
    if (!pyodide) {
        begin = performance.now();
        console.log("loading pyodide");
        pyodide = await loadPyodide();
        end = performance.now();
        console.log(`loaded pyodide successfully in ${(end-begin).toFixed(2)}ms`);
    }
    if (!app) {
        const wsgi = await fetch('/wsgi.py');
        const text = await wsgi.text();
        await pyodide.runPythonAsync(text);
        app = pyodide.globals.get('app');
        is_wsgi = pyodide.globals.get('is_wsgi');
    }
    if (is_wsgi) {
        const environ = buildEnviron(request);
        const data = [];
        const write = (bytes) => data.push(bytes);
        let status = 0;
        const headers = {}
        const startResponse = (status1, headers1, exc_info) => {
            if (exc_info) {
                return new Response("Error", {status: 502});
            }
            status = parseInt(status1.match(/^(\d+)/)[0]);
            for (const [k, v] of headers1) {
                headers[k] = v;
            }
            return write;
        }
        const result = app(environ, startResponse);

        return new Response(result, {status, headers});
    } else {

    }
    begin = performance.now();
    const result = await pyodide.runPythonAsync(`' '.join(['hello', 'world', 'from', 'python', '!'])`);
    end = performance.now();
    console.log(`execute python in ${(end-begin).toFixed(2)}ms`)
    const response = new Response(result, {
        status: 200,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
    });
    return response;
}

self.addEventListener('fetch', async e => {
    e.respondWith(handleFetch(e));
});