import * as Comlink from "comlink";

const webcornConfig = {
    pyodideUrl: null,
    projectRoot: '/',
    appSpec: 'app:app',
    appUrl: 'app',
    consoleDom: null,
};

const WORKER_JS = `
{WORKER.JS}
`;

const WORKER_URL = URL.createObjectURL(new Blob([WORKER_JS], {type: 'text/javascript'}));

class WebcornWorker {
    constructor() {
        const parts = webcornConfig.projectRoot.split('/');
        this.name = parts[parts.length-1];
    }

    getLogger() {
        return Comlink.proxy({
            log: (msg) => {
                if (webcornConfig.consoleDom) {
                    const p = document.createElement('p');
                    p.innerHTML = `<span class="source">${this.name}:</span>`;
                    const content = document.createElement('span');
                    content.textContent = msg;
                    p.appendChild(content);
                    webcornConfig.consoleDom.append(p);
                }
            }
        });
    }

    async start() {
        this.worker = new Worker(WORKER_URL, {type: 'module', name: this.name});
        this.wrapper = Comlink.wrap(this.worker);
        this.isWsgi = await this.wrapper.start(webcornConfig.pyodideUrl,
                                               webcornConfig.projectRoot,
                                               webcornConfig.appSpec,
                                               webcornConfig.appUrl,
                                               this.getLogger());
        this.maxCount = this.isWsgi ? 100 : 1000;
        this.activeCount = 0;
    }

    async handleRequest(request) {
        // Add cookie header in case the client user agent forgets
        if (document.cookie.length > 0 &&
            !Object.keys(request.headers).some(key => key.toLowerCase() === 'cookie')) {
            request.headers.cookie = document.cookie;
        }

        Comlink.transfer(request, [request.body]);
        const response = await this.wrapper.handleRequest(request);
        Comlink.transfer(response, [response.body]);

        response.headers = JSON.parse(response.headers);

        // Save cookie because the user agent will remove 'set-cookie'
        // when composing Response object due to 'Forbidden response header'
        const setcookies = response.headers['set-cookie'] || [];
        for (const setcookie of setcookies) {
            document.cookie = setcookie;
        }
        delete response.headers['set-cookie'];

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
    if (!webcornConfig.pyodideUrl) {
        console.log("Webcorn is not configed, config first with configWebcorn(options).");
        return null;
    }
    worker = null;
    try {
        worker = new WebcornWorker();
        await worker.start();
        workers.push(worker);
        worker.retain();
        return worker;
    } catch (e) {
        console.log(e);
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
    } catch (e) {
        console.log(e);
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

export const startAppServer = (options) => {
    if (!navigator.serviceWorker.controller) {
        const msg = "Service Worker is not started, failed to start webcorn server!";
        console.log(msg);
        throw msg;
    }
    const {
        // pyodide v0.26.4没有wagtail依赖的pillow-heif版本，运行wagtail时，需要使用0.27.0
        // pyodide v0.27.0/0.27.1有[pydantic/pydantic-core版本不匹配的bug](https://github.com/pyodide/pyodide/issues/5336)，
        // 导致运行fastapi app时出错
        // 2025.1.24: 0.27.2解决了这个问题。
        pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs",
        projectRoot = '/',
        appSpec = 'app:app',
        consoleDom = null,
    } = options || {};
    webcornConfig.pyodideUrl = pyodideUrl;
    webcornConfig.projectRoot = projectRoot;
    webcornConfig.appSpec = appSpec;
    webcornConfig.consoleDom = consoleDom;
    webcornConfig.appUrl = new URL('./~webcorn', self.location).href;

    const serverUrl = new URL('.', self.location).href;
    const serverName = serverUrl.replace(/\/$/, '').split('/').pop();

    const { port1: pingPort1, port2: pingPort2 } = new MessageChannel();
    const { port1: requestPort1, port2: requestPort2 } = new MessageChannel();
    const pingTarget = Comlink.wrap(pingPort1);
    let serverId = null;
    const ping = async () => {
        await pingTarget.ping(serverId);
        setTimeout(ping, 300);
    }
    const readyGo = (sid) => {
        serverId = sid;
        ping();
    }
    Comlink.expose({ handleRequest, readyGo }, requestPort1);
    navigator.serviceWorker.controller.postMessage({type: 'server-ready', name: serverName}, [pingPort2, requestPort2]);
}
