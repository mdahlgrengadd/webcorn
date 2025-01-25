import { startServer } from "webcorn/server";

const appUrl = new URL('app', self.location).href;
const consoleDom = document.getElementById('console');
const options = {
        serverName: 'project_fastapi',
        projectRoot: '/opt/project_fastapi',
        appSpec: 'src/app:app',
        appUrl,
        consoleDom,
}
startServer(options);