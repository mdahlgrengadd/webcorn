import { startServer } from "webcorn/server";

const appUrl = new URL('app', self.location).href;
const consoleDom = document.getElementById('console');
const options = {
        serverName: 'project_wagtail',
        projectRoot: '/opt/project_wagtail',
        appSpec: 'project_wagtail.wsgi:application',
        appUrl,
        consoleDom,
}
startServer(options);