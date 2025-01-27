// This is the web worker main js that run the webcorn server
import * as Comlink from "comlink";

let started = false;
let isWsgi = true;
let isAsgi = false;
let pyodide;
let console = self.console;

const WEBCORN_PY = `
{WEBCORN.PY}
`;

const start = async (pyodideUrl, projectRoot, appSpec, appUrl, logger) => {
    console = logger;
    let begin = performance.now();
    console.log("Loading pyodide...");
    const { loadPyodide } = await import(pyodideUrl);
    pyodide = await loadPyodide();
    let end = performance.now();
    let delta = (end-begin).toFixed(2);
    console.log(`Loaded pyodide successfully in ${delta}ms`);
    // Django login need hashlib.pbkdf2_hmac, so hashlib need to be installed
    // before import, micropip will import hashlib, so install before load micropip
    await pyodide.loadPackage('hashlib');
    await pyodide.loadPackage('micropip');
    await pyodide.runPythonAsync(WEBCORN_PY);
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