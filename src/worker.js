// This is the web worker main js that run the webcorn server
import * as Comlink from "comlink";

import { loadPyodide } from "./pyodide.mjs";
// 静态加载pyodide.asm.js，否则在loadPyodide时将会动态加载，在module类型service worker中不支持动态加载
//import "./pyodide.asm.js";

let started = false;
let isWsgi = true;
let isAsgi = false;
let pyodide;
let console = self.console;

const start = async (projectRoot, appSpec, appUrl, logger) => {
    //console = logger;
    let begin = performance.now();
    console.log("loading pyodide");
    pyodide = await loadPyodide();
    let end = performance.now();
    console.log(`loaded pyodide successfully in ${(end-begin).toFixed(2)}ms`);
    const response = await fetch("webcorn.py");
    const text = await response.text();
    await pyodide.runPythonAsync(text);
    await pyodide.globals.get('load_app')(projectRoot, appSpec, appUrl);
    isWsgi = pyodide.globals.get('is_wsgi');
    isAsgi = pyodide.globals.get('is_asgi');
    started = true;
    return isWsgi;
}

const handleRequest = async (request) => {
    let response = {
        status: 500,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
        body: "server not started",
    };

    if (!started) {
        return response;
    }

    response.body = "server internal error";
    try {
        if (isWsgi) {
            response = pyodide.globals.get('run_wsgi')(request, console);
            console.log('worker: received response from python run_wsgi')
        } else if (isAsgi) {
            response = await pyodide.globals.get('run_asgi')(request);
        }
    } catch (e) {
        console.log(e);
    }
    console.log(response);
    Comlink.transfer(response, [response.body]);
    return response;
}

Comlink.expose({
    start,
    isWsgi,
    isAsgi,
    handleRequest,
});