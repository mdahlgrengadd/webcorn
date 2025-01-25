import { startServer } from "webcorn/server";

const consoleDom = document.getElementById('console');
const options = {
        serverName: 'project_django',
        pyodideUrl: "https://cdn.jsdelivr.net/pyodide/v-1.26.4/full/pyodide.mjs",
        projectRoot: '/opt/project_django',
        appSpec: 'project_django.wsgi:application',
        appUrl: '/app',
        consoleDom,
}
startServer(options);