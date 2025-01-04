import * as Comlink from "comlink";

const serverUrl = (path) => new URL(path, location.href);

const  response = await fetch(serverUrl('config'));
const webcornConfig = await response.json();

const consoleDom = document.getElementById('console');

class WebcornWorker {
    constructor(projectRoot, appSpec, appUrl) {
        _, _, name = projectRoot.rpartition('/');
        this.projectRoot = projectRoot;
        this.appSec = appSpec;
        this.appUrl = appUrl;
        this.name = name;
    }

    getLogger() {
        return Comlink.proxy({
            log: (msg) => {
                const p = document.createElement('p');
                p.innerHTML = `<span class="source">${this.name}:</span>`;
                const content = document.createElement('span');
                content.textContent = msg;
                p.appendChild(content);
                consoleDom.append(p);
            }
        });
    }

    async start() {
        this.worker = new Worker(serverUrl('worker.mjs'), {type: 'module', name: this.name});
        this.wrapper = Comlink.wrap(this.worker);
        this.isWsgi = await this.wrapper.start(this.projectRoot, this.appSpec, this.appUrl, this.getLogger());
        this.maxCount = this.isWsgi ? 1 : 100;
        this.activeCount = 0;
    }

    async handleRequest(request) {
        Comlink.transfer(request, [request.body]);
        const response = await this.wrapper.handleRequest(request);
        Comlink.transfer(response, [response.body]);
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
    worker = null;
    try {
        worker = new WebcornWorker(webcornConfig.projectRoot, webcornConfig.appSpec, webcornConfig.appUrl);
        await worker.start();
        workers.push(worker);
        worker.retain();
        return worker;
    } catch (e) {
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
}

if (navigator.serviceWorker.controller) {
    const { port1: pingPort1, port2: pingPort2 } = new MessageChannel();
    const { port1: requestPort1, port2: requestPort2 } = new MessageChannel();
    const pingTarget = Comlink.wrap(pingPort1);
    const ping = async () => {
        await pingTarget.ping();
        setTimeout(ping, 1000);
    }
    ping();
    Comlink.expose({ handleRequest }, requestPort1);
    navigator.serviceWorker.controller.postMessage({type: 'server-ready'}, [pingPort2, requestPort2]);
}