let appRoot;
self.addEventListener('message', async (event) => {
    const data = event.data;
    if (data.type === 'webcorn.start') {
        appRoot = data.appRoot;
        const startUrl = `${appRoot}/__start`;
        const response = await fetch(startUrl);
        const text = await response.text();
        console.log(`worker ${appRoot}: ${text}`);
        console.log(event.source);
        return;
    }
    if (data.type === 'webcorn.request') {
        console.log('webcorn.request');
        console.log(event.source);
        return;
    }
});
/*
// This is the web worker main js that run the webcorn server
import * as Comlink from "comlink";

import { loadPyodide } from "./pyodide.mjs";
// 静态加载pyodide.asm.js，否则在loadPyodide时将会动态加载，在module类型service worker中不支持动态加载
//import "./pyodide.asm.js";

let started = false;
let isWsgi = true;
let lastPing = 0;
let pyodide;

const ping = () => {
    let now = Date.now();
    if (lastPing > 0 && (now - lastPing) > 30*1000) {
        self.close();
        return;
    }
    lastPing = now;
}

const start = async root_path => {
    let begin = performance.now();
    console.log("loading pyodide");
    pyodide = await loadPyodide();
    let end = performance.now();
    console.log(`loaded pyodide successfully in ${(end-begin).toFixed(2)}ms`);
    const response = await fetch("/webcorn.py");
    const text = await response.text();
    await pyodide.runPythonAsync(text);
    pyodide.globals.get('load')(root_path)
    isWsgi = pyodide.globals.get('is_wsgi')
    started = true;
}

const run = async request => {
    if (!started) {
        return;
    }
    let response;
    if (isWsgi) {
        response = pyodide.globals.get('run_wsgi')(request);
    } else {
        response = await pyodide.globals.get('run_asgi')(request);
    }
    response = Comlink.transfer(response, [response.body]);
    return response;
}

Comlink.expose({
    ping,
    start,
    run,
})
    */