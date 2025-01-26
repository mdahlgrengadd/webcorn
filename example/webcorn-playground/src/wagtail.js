import { startAppServer } from "webcorn/server";

const consoleDom = document.getElementById('console');
const options = {
        projectRoot: '/opt/project_wagtail',
        appSpec: 'project_wagtail.wsgi:application',
        consoleDom,
}
startAppServer(options);