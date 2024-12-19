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

const handleFetch = async e => {
    console.log("fetch received by service worker");
    const request = e.request;
    let begin;
    let end;
    if (!pyodide) {
        begin = performance.now();
        console.log("loading pyodide");
        pyodide = await loadPyodide();
        end = performance.now();
        console.log(`loaded pyodide successfully in ${(end-begin).toFixed(2)}ms`);
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