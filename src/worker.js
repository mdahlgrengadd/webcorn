// This is the web worker main js that run the webcorn server
import * as Comlink from "comlink";

// pyodide 0.26.4没有wagtail依赖的pillow-heif版本，运行wagtail时，需要使用0.27.0
//import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs";
// pyodide 0.27.0/0.27.1有[pydantic/pydantic-core版本不匹配的bug](https://github.com/pyodide/pyodide/issues/5336)
// 运行fastapi app时需要使用0.26.4，直到0.27.2解决这个问题。
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs";

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
    // Django login need hashlib.pbkdf2_hmac, so hashlib need to be installed
    // before import, micropip will import hashlib, so install before load micropip
    await pyodide.loadPackage('hashlib');
    await pyodide.loadPackage('micropip');
    const response = await fetch("webcorn.py");
    const text = await response.text();
    await pyodide.runPythonAsync(text);
    await pyodide.globals.get('load_app')(projectRoot, appSpec, appUrl, console);
    isWsgi = pyodide.globals.get('is_wsgi');
    isAsgi = pyodide.globals.get('is_asgi');
    started = true;
    return isWsgi;
}

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
        console.log('worker: received response from python application')
    } catch (e) {
        console.log(e);
    }
    Comlink.transfer(response, [response.body]);
    return response;
}

Comlink.expose({
    start,
    isWsgi,
    isAsgi,
    handleRequest,
});