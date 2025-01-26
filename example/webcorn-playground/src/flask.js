import { startAppServer } from "webcorn/server";

const consoleDom = document.getElementById('console');
const options = {
        projectRoot: '/opt/project_flask',
        appSpec: 'src/app:app',
        consoleDom,
}
startAppServer(options);