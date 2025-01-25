import { startServer } from "webcorn/server";

const appUrl = new URL('app', self.location).href;
const consoleDom = document.getElementById('console');
const options = {
        serverName: 'project_flask',
        projectRoot: '/opt/project_flask',
        appSpec: 'src/app:app',
        appUrl,
        consoleDom,
}
startServer(options);