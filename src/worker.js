// This is the web worker main js that run the webcorn server
import * as Comlink from "comlink";

import { loadPyodide } from "./pyodide.mjs";
// 静态加载pyodide.asm.js，否则在loadPyodide时将会动态加载，在module类型service worker中不支持动态加载
//import "./pyodide.asm.js";

let started = false;
let isWsgi = true;
let pyodide;

const start = async (projectRoot, appSpec) => {
    let begin = performance.now();
    console.log("loading pyodide");
    pyodide = await loadPyodide();
    let end = performance.now();
    console.log(`loaded pyodide successfully in ${(end-begin).toFixed(2)}ms`);
    const response = await fetch("/webcorn.py");
    const text = await response.text();
    await pyodide.runPythonAsync(text);
    pyodide.globals.get('load')(projectRoot, appSpec);
    isWsgi = pyodide.globals.get('is_wsgi');
    started = true;
    return isWsgi;
}

const handleRequest = request => {
    if (!started) {
        return;
    }
    const response = pyodide.globals.get('run_wsgi')(request);
    Comlink.transfer(response, [response.body]);
    return response;
}

Comlink.expose({
    start,
    isWsgi,
    handleRequest,
})