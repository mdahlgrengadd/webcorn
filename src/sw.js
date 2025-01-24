import * as Comlink from "comlink";

class WebcornServer {
    constructor(name, endpoint) {
        this.serverId = `server-${nextServerId++}`;
        this.serverName = name;
        this.lastUpdateTime = Date.now();
        this.endpoint = endpoint;
        this.endpoint.readyGo(this.serverId);
    }

    isActive() {
        const now = Date.now();
        return now >= this.lastUpdateTime && now < this.lastUpdateTime + 1000;
    }

    async handleFetch(event) {
        if (!this.isActive()) {
            console.log(`server not started`);
            return new Response("Server not Started", {
                status: 500,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
        const req = await this.getRequest(event);
        const res = await this.endpoint.handleRequest(req);
        return new Response(res.body, {
            status: res.status,
            headers: res.headers,
        });
    }
}


let nextServerId = 1000;
const webcornServers = {};
const ping = (serverId) => {
    const server = webcornServers[serverId];
    if (server) {
        server.lastUpdateTime = Date.now();
    }
}
export const swAcceptServer = () => {
    self.addEventListener('message', async event => {
        const data = event.data;
        console.log(data);
        if (data.type === 'server-ready') {
            const pingPort = event.ports[0];
            const requestPort = event.ports[1];
            Comlink.expose({ping}, pingPort);
            const endpoint = Comlink.wrap(requestPort);
            const server = WebcornServer(data.name, endpoint);
            webcornServers[server.serverId] = server;
        }
    })
}