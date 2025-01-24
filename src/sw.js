import * as Comlink from "comlink";

class WebcornServer {
    constructor(name, endpoint) {
        this.serverId = `server-${nextServerId++}`;
        this.serverName = name;
        this.lastUpdateTime = Date.now();
        this.endpoint = endpoint;
        this.endpoint.readyGo(this.serverId);
    }

    isActive(now) {
        now = now || Date.now();
        return now >= this.lastUpdateTime && now < this.lastUpdateTime + 1000;
    }

    async eventToRequest(event) {
        const url = new URL(event.request.url);
        const method = event.request.method;
        const scheme = url.protocol.slice(0, -1);
        const server = url.hostname;
        const port = url.port;
        const path = url.pathname;
        const query = url.search ? url.search.slice(1) : '';
        const headers = {};
        for (const [k, v] of event.request.headers) {
            if (k in headers) {
                headers[k] += ','+v;
            } else {
                headers[k] = v;
            }
        }
        const body = await event.request.arrayBuffer();

        let request = {
            method,
            scheme,
            server,
            port,
            path,
            query,
            headers,
            body
        };
        
        Comlink.transfer(request, [request.body]);
        return request;
    }

    async handleFetch(event) {
        if (!this.isActive()) {
        }
        const req = await this.eventToRequest(event);
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

// webcorn server will register to this service worker
export const acceptServer = () => {
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

export const allServers = () => {
    return Object.values(webcornServers).map(server => {
        return {
            serverId: server.serverId,
            serverName: server.serverName,
            lastUpdateTime: server.lastUpdateTime,
            isActive: server.isActive(),
        }
    });
}

// client will use this function to handle fetch event
// serverName is the name of the server
export const handleFetch = async (serverName, event) => {
    const now = Date.now();
    const servers = Object.values(webcornServers).filter(server => server.serverName === serverName && server.isActive(now));
    if (servers.length === 1) {
        return await servers[0].handleFetch(event);
    } else if (servers.length > 1) {
        const index = Math.floor(Math.random() * servers.length);
        return await servers[index].handleFetch(event);
    } else {
        const msg = "Server not Started";
        console.log(msg);
        return new Response(msg, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }
}