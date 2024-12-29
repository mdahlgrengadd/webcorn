import { loadPyodide } from "./pyodide.mjs";
import "./pyodide.asm.js";
const webcornConfig = {};

function setConfig(
        projectRoot,
        appSpec = '',
        appUrl = '/',
        staticRoot = '',
        staticUrl = '/static'
    ) {
    const config = webcornConfig;
    config.projectRoot = projectRoot;
    config.appSpec = appSpec;
    config.appUrl = appUrl;
    config.staticRoot = staticRoot;
    config.staticUrl = staticUrl;
}

function serviceWorkerEndPoint(serviceWorkerContainer) {
    if ('controller' in serviceWorkerContainer) {
        const serviceWorker = serviceWorkerContainer.controller;
        return {
            addEventListener: serviceWorkerContainer.addEventListener.bind(serviceWorkerContainer),
            removeEventListener: serviceWorkerContainer.removeEventListener.bind(serviceWorkerContainer),
            postMessage: serviceWorker.postMessage.bind(serviceWorker)
        };
    }
}