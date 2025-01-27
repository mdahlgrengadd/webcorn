# Webcorn
Run Django/Flask/FastAPI applications in the browser, help providing a complete offline python web development experience.

Webcorn is based on [Pyodide](https://github.com/pyodide/pyodide), the WebAssembly-version CPython running in the browser, implement the WSGI/ASGI Application Server. This server runs in web workers, so it does not block the main UI thread.

Webcorn relies on a service worker to redirect http requests.

## Features

The Webcorn Server has the following features:

- [x] Full-featured WSGI/ASGI Application Server running in the browser.
- [x] Support Django/Flask/FastAPI/Wagtail applications.
- [x] Support database in the browser via sqlite3.
- [x] Support handling Set-Cookie in the browser.
- [x] Support installation of python packages from PYPI via micropip.
- [ ] Support installation of js packages from npm registry via micronpm.
- [ ] Support js bundling in the browser, via wasm-version esbuild.

## Try it

Access [Webcorn Playground](https://frybox.github.io/webcorn/playground) to see how Django/Flask/FastAPI/Wagtail applications run offline in the browser.

### Run Webcorn Playground locally

Clone this repository, run `python start.py` in `example/webcorn-playground` directory, and open `http://localhost:8000` in your browser.

```sh
$ git clone https://github.com/frybox/webcorn
$ cd webcorn/example/webcorn-playground
$ python start.py
```

## Usage

Install Webcorn from npm registry:

```sh
$ npm install webcorn
```

Implement the service worker script sw.mjs:

```js
import { startWebServer } from "webcorn/service-worker";

startWebServer();
```

Register the service worker in the index.html file:

```html
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Webcorn Playground</title>
</head>
<body>
    <script>
        if ('serviceWorker' in navigator) {
            const serviceWorkerScript = "sw.mjs";
            const type = 'module';
            navigator.serviceWorker.register(serviceWorkerScript, {type})
                .then(registration => {
                    console.log('ServiceWorker registration successful');
                })
                .catch(error => {
                    console.error('ServiceWorker registration failed:', error);
                });
        } else {
            console.error("ServiceWorker not support");
        }
    </script>
</body>
</html>
```

Implement the webcorn server script server.mjs:

```js
import { startAppServer } from "webcorn/server";

const options = {
        projectRoot: '/opt/project_django',
        appSpec: 'project_django.wsgi:application',
        log: console.log,
}
try {
    startAppServer(options);
} catch (e) {
    window.location = new URL('../', window.location).href;
}
```

Webcorn server html file server.html:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Webcorn Server - Django Application</title>
  </head>
  <body>
    <script type="module" src="./server.mjs"></script>
  </body>
</html>
```

Check the [example/webcorn-playground](https://github.com/frybox/webcorn/tree/main/example/webcorn-playground) for more details.

## License

MIT
