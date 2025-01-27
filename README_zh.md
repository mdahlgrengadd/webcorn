# Webcorn
[English](https://github.com/frybox/webcorn)

Webcorn是一个运行在浏览器中的Python ASGI/WSGI应用服务器，协助提供完整的离线Python Web开发体验。

Webcorn基于[Pyodide](https://github.com/pyodide/pyodide)实现，Pyodide是WebAssembly版本的CPython，可在浏览器中运行。

Webcorn在web worker中运行，不会阻塞浏览器UI线程。

Webcorn依赖一个service worker来重定向来自客户端的http请求。Webcorn会对应用生成的Set-Cookie进行特殊处理，解决js代码在浏览器中无法处理Set-Cookie头的问题。

通过[micropip](https://micropip.pyodide.org/en/stable/)，Webcorn支持在浏览器中安装python包。运行Python应用前，Webcorn检查项目中requirements.txt、pyproject.toml的依赖包，将其安装到浏览器环境中。

Webcorn支持WebAssembly版本的sqlite3数据库。

## 特性

Webcorn有如下特性：

- [x] 运行于浏览器中的完整功能的WSGI/ASGI应用服务器。
- [x] 支持Django/Flask/FastAPI/Wagtail应用。
- [x] 支持sqlite3数据库。
- [x] 支持在浏览器中处理Set-Cookie HTTP头。
- [x] 支持从PYPI仓库中安装Python包。
- [ ] 支持从npm仓库中安装Javascript包。
- [ ] 支持对Javascript代码进行打包。

## 尝试一下

访问[Webcorn试验场](https://frybox.github.io/webcorn/playground)，查看Django/Flask/FastAPI/Wagtail应用如何在浏览器中离线运行。

### 在本地运行Webcorn试验场

克隆本仓库，在`example/webcorn-playground`目录运行`python start.py`，在浏览器中访问`http://localhost:8000`。

```sh
$ git clone https://github.com/frybox/webcorn
$ cd webcorn/example/webcorn-playground
$ python start.py
```

## 使用

从npm仓库安装Webcorn：

```sh
$ npm install webcorn
```

实现service worker脚本`sw.mjs`:

```js
import { startWebServer } from "webcorn/service-worker";

startWebServer();
```

在index.html（或其他html主页面）中注册service worker：

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

实现Webcorn服务端脚本`server.mjs`：

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

实现Webcorn服务端html文件server.html：

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

参考[example/webcorn-playground](https://github.com/frybox/webcorn/tree/main/example/webcorn-playground)了解更多使用细节。

## License

MIT
