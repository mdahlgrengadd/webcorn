import { loadPyodide } from "./pyodide.mjs";
import "./pyodide.asm.js";

function serviceWorkerEndPoint() {
    const serviceWorkerContainer = navigator.serviceWorker;
    if ('controller' in serviceWorkerContainer) {
        const serviceWorker = serviceWorkerContainer.controller;
        return {
            addEventListener: serviceWorkerContainer.addEventListener.bind(serviceWorkerContainer),
            removeEventListener: serviceWorkerContainer.removeEventListener.bind(serviceWorkerContainer),
            postMessage: serviceWorker.postMessage.bind(serviceWorker)
        };
    }
}

const webcornEndPoint = serviceWorkerEndPoint();

const response = await fetch(new URL('config', location.href));
const webcornConfig = await response.json();