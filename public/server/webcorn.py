from functools import partial
from asyncio import iscoroutinefunction
from importlib import import_module
from pathlib import Path
from urllib.parse import urlparse, urljoin
from collections.abc import Iterable
import asyncio
import inspect
import sys
import os
from io import BytesIO
from pyodide.ffi import to_js
from pyodide.http import pyfetch
from js import Object
from platform import python_implementation
import micropip

version = '0.1.0'
js_console = None
application = None
is_wsgi = True
is_asgi = False
app_root = ''
server_version = f'Webcorn/{version} {python_implementation()}/{sys.version.split()[0]}'
is_django = False
asgi_server = None

class Logger:
    def __init__(self, name):
        self.name = name
    def info(self, msg, *args):
        if js_console:
            js_console.log(msg % args)
    def error(self, msg, *args):
        if js_console:
            js_console.log(msg % args)


def is_wsgi_app(app):
    # 检查对象是否可调用
    if not callable(app):
        return False

    # 检查参数签名
    sig = inspect.signature(app)
    params = list(sig.parameters.keys())
    # WSGI 应用的参数应该是 environ 和 start_response
    if len(params) != 2: # or params[0] != 'environ' or params[1] != 'start_response':
        return False
    return True

    ## 尝试调用应用，确保它不会抛出异常
    #try:
    #    # 创建一个示例的 environ 对象
    #    environ = {
    #        'REQUEST_METHOD': 'GET',
    #        'PATH_INFO': '/',
    #        'wsgi.version': (1, 0),
    #        'wsgi.url_scheme': 'http',
    #        'wsgi.input': BytesIO(),
    #        'wsgi.errors': StringIO(),
    #        'wsgi.multithread': False,
    #        'wsgi.multiprocess': False,
    #        'wsgi.run_once': False,
    #    }
    #    
    #    # 简单的 start_response 函数
    #    def start_response(status, headers):
    #        return lambda b: len(b)
    #    
    #    # 尝试调用应用
    #    result = app(environ, start_response)
    #    result = isinstance(result, Iterable)
    #    return result
    #except Exception as e:
    #    print(e)
    #return False


def is_async_callable(obj):
    while isinstance(obj, partial):
        obj = obj.func
    return (iscoroutinefunction(obj) or 
            (callable(obj) and
             iscoroutinefunction(obj.__call__)))


def is_asgi_app(app):
    if not is_async_callable(app):
        return False
    sig = inspect.signature(app)
    params = list(sig.parameters.keys())
    if len(params) == 3:
        return True
    return False


async def install_dependencies(root):
    requirements = root / 'requirements.txt'
    if requirements.is_file():
        with requirements.open('r') as f:
            requirements = f.readlines()
        requirements = [req.strip() for req in requirements if req.strip() and not req.startswith('#')]
        for req in requirements:
            await micropip.install(req)
        return
    pyproject = root / 'pyproject.toml'
    if pyproject.is_file():
        await micropip.install('toml')
        import toml
        pyproject = toml.load(pyproject)
        project = pyproject.get('project')
        if project:
            deps = project.get('dependencies')
            if deps:
                for dep in deps:
                    await micropip.install(dep)
        return


async def setup(project_root, app_spec, app_url):
    global app_root
    path = Path(project_root)
    if not path.is_dir():
        zipurl = urljoin(app_url, f'../{path.name}.zip')
        response = await pyfetch(zipurl)
        await response.unpack_archive(extract_dir=path.parent)
    os.chdir(project_root)

    await install_dependencies(path)

    app_url = urlparse(app_url)
    app_root = app_url.path

    try:
        from django.urls import set_script_prefix
        # 将app_root设置到django.urls thread local的_prefixes中
        set_script_prefix(app_root)
    except:
        pass

    fspath, _, _ = app_spec.rpartition('/')
    if not fspath:
        syspaths = [Path('.').resolve(), Path('src').resolve()]
    else:
        syspaths = [Path(fspath).resolve()]
    for p in reversed(syspaths):
        p = str(p)
        if p not in sys.path:
            sys.path.insert(0, p)
    return syspaths


def check_django():
    """django开发态的静态文件处理比较特殊，需要在这里单独配置"""
    global is_django, application
    try:
        from django.conf import settings
        installed_apps = settings.INSTALLED_APPS
        is_django = True
        if 'django.contrib.staticfiles' in installed_apps:
            from django.contrib.staticfiles.handlers import StaticFilesHandlerMixin
            from django.core.handlers.wsgi import WSGIHandler, get_path_info, get_script_name
            # staticfiles.StaticFilesHandler有bug
            class StaticFilesHandler(StaticFilesHandlerMixin, WSGIHandler):
                def __init__(self, application):
                    self.application = application
                    self.base_url = urlparse(self.get_base_url())
                    super().__init__()

                def __call__(self, environ, start_response):
                    script_name = get_script_name(environ)
                    path_info = get_path_info(environ) or '/'
                    path = f'{script_name.rstrip("/")}/{path_info.replace("/", "", 1)}'
                    if not self._should_handle(path):
                        return self.application(environ, start_response)
                    return super().__call__(environ, start_response)
            application = StaticFilesHandler(application)
    except Exception:
        pass


async def start_asgi():
    global asgi_server
    from asgiref.server import StatelessServer
    STATE_TRANSITION_ERROR = "Got invalid state transition on lifespan protocol."

    class AsgiServer(StatelessServer):
        def __init__(self):
            super().__init__(application)
            self.next_scopeid = 1000
            self.state = {}
            self.logger = Logger('webcorn.error')
            self.startup_event = asyncio.Event()
            self.shutdown_event = asyncio.Event()
            self.receive_queue = asyncio.Queue()
            self.error_occured = False
            self.startup_failed = False
            self.shutdown_failed = False
            self.should_exit = False
            self.access_logger = Logger('webcorn.access')

        async def startup(self):
            self.logger.info("Waiting for application startup.")
            checker_task = asyncio.create_task(self.application_checker())
            main_lifespan_task = asyncio.create_task(self.lifespan())  # noqa: F841
            # Keep a hard reference to prevent garbage collection
            # See https://github.com/encode/uvicorn/pull/972
            await self.receive_queue.put({'type': 'lifespan.startup'})
            await self.startup_event.wait()

            if self.startup_failed or self.error_occured:
                self.logger.error("Application startup failed. Exiting.")
                self.should_exit = True
            else:
                self.logger.info("Application startup complete.")

        async def shutdown(self) -> None:
            if self.error_occured:
                return
            self.logger.info("Waiting for application shutdown.")
            await self.receive_queue.put({'type': 'lifespan.shutdown'})
            await self.shutdown_event.wait()

            if self.shutdown_failed or self.error_occured:
                self.logger.error("Application shutdown failed. Exiting.")
                self.should_exit = True
            else:
                self.logger.info("Application shutdown complete.")

        async def lifespan(self) -> None:
            try:
                scope = {
                    "type": "lifespan",
                    "asgi": {"version": '3.0', "spec_version": "2.0"},
                    "state": self.state,
                }
                await application(scope, self.receive_queue.get, self.lifespan_send)
            except BaseException as exc:
                self.error_occured = True
                if self.startup_failed or self.shutdown_failed:
                    return
                msg = "ASGI 'lifespan' protocol appears unsupported."
                self.logger.info(msg)
            finally:
                self.startup_event.set()
                self.shutdown_event.set()

        async def lifespan_send(self, message):
            assert message["type"] in (
                "lifespan.startup.complete",
                "lifespan.startup.failed",
                "lifespan.shutdown.complete",
                "lifespan.shutdown.failed",
            )
            if message["type"] == "lifespan.startup.complete":
                assert not self.startup_event.is_set(), STATE_TRANSITION_ERROR
                assert not self.shutdown_event.is_set(), STATE_TRANSITION_ERROR
                self.startup_event.set()
            elif message["type"] == "lifespan.startup.failed":
                assert not self.startup_event.is_set(), STATE_TRANSITION_ERROR
                assert not self.shutdown_event.is_set(), STATE_TRANSITION_ERROR
                self.startup_event.set()
                self.startup_failed = True
                if message.get("message"):
                    self.logger.error(message["message"])
            elif message["type"] == "lifespan.shutdown.complete":
                assert self.startup_event.is_set(), STATE_TRANSITION_ERROR
                assert not self.shutdown_event.is_set(), STATE_TRANSITION_ERROR
                self.shutdown_event.set()
            elif message["type"] == "lifespan.shutdown.failed":
                assert self.startup_event.is_set(), STATE_TRANSITION_ERROR
                assert not self.shutdown_event.is_set(), STATE_TRANSITION_ERROR
                self.shutdown_event.set()
                self.shutdown_failed = True
                if message.get("message"):
                    self.logger.error(message["message"])

        def build_scope(self, request):
            path = request['path']
            headers = [[k.encode(), v.encode()] for k, v in request['headers'].items()]
            scope = {
                'type': 'http',
                'asgi': {
                    'version': '3.0',
                    'spec_version': '2.0',
                },
                'http_version': '1.1',
                'method': request['method'],
                'scheme': request['scheme'],
                'path': path,
                'raw_path': path.encode(),
                'query_string': request['query'].encode(),
                'root_path': app_root,
                'headers': headers,
                'client': None,
                'server': [request['server'], request['port']],
                'state': self.state.copy(),
                'webcorn': {
                    'output': BytesIO(),
                    'response_started': False,
                    'response_complete': False,
                    'message_event': asyncio.Event(),
                    'status': 500,
                    'headers': {
                        'server': server_version,
                    },
                },
            }
            return scope

        async def handle_request(self, request):
            scope = self.build_scope(request)
            scope_id = f'scope-{self.next_scopeid}'
            self.next_scopeid += 1
            input_queue = self.get_or_create_application_instance(scope_id, scope)
            input_queue.put_nowait({'type': 'http.request', 'body': request['body']})
            webcorn = scope['webcorn']
            await webcorn['message_event'].wait()
            webcorn['message_event'].clear()
            result = to_js({
                'status': webcorn['status'],
                'headers': webcorn['headers'],
                'body': webcorn['output'].getbuffer(),
            }, dict_converter=Object.fromEntries)
            self.delete_application_instance(scope_id)
            return result

        async def application_send(self, scope, message):
            webcorn = scope['webcorn']
            message_type = message["type"]
            if not webcorn.get('response_started'):
                if message_type != 'http.response.start':
                    msg = 'Expected ASGI message "http.response.start", but got "%s".'
                    raise RuntimeError(msg % message_type)
                webcorn['response_started'] = True
                webcorn['status'] = message['status']
                oheaders = webcorn['headers']
                for k, v in message.get('headers', []):
                    k = k.decode().lower()
                    v = v.decode().strip()
                    if k in oheaders:
                        oheaders[k] += ',' + v
                    else:
                        oheaders[k] = v
                path_with_query_string = scope.get('path')
                if scope.get('query_string'):
                    path_with_query_string += '?' + scope.get('query_string').decode()
                self.access_logger.info(
                    '%s - "%s %s HTTP/%s" %d',
                    scope.get('client'),
                    scope["method"],
                    path_with_query_string,
                    scope["http_version"],
                    message['status'],
                )
            elif not webcorn.get('response_complete'):
                # Sending response body
                if message_type != "http.response.body":
                    msg = "Expected ASGI message 'http.response.body', but got '%s'."
                    raise RuntimeError(msg % message_type)
                body = message.get("body", b"")
                more_body = message.get("more_body", False)
                # Write response body
                data = b"" if scope["method"] == "HEAD" else body
                output = webcorn['output']
                output.write(data)
                # Handle response completion
                if not more_body:
                    webcorn['response_complete'] = True
                    webcorn['message_event'].set()
            else:
                # Response already sent
                msg = "Unexpected ASGI message '%s' sent, after response already completed."
                raise RuntimeError(msg % message_type)
    asgi_server = AsgiServer()
    await asgi_server.startup()
    return not asgi_server.startup_failed

async def load_app(project_root, app_spec, app_url, console):
    global application, is_wsgi, is_asgi, js_console
    js_console = console
    await setup(project_root, app_spec, app_url)
    _, _, apppath = app_spec.rpartition('/')
    pypath, _, appname = apppath.partition(':')
    if not pypath:
        pypaths = ['main', 'app', 'api']
    else:
        pypaths = [pypath]
    for p in pypaths:
        try:
            module = import_module(p)
            pypath = p
            break
        except ModuleNotFoundError as e:
            if len(pypaths) == 1:
                raise
            if e.name != p:
                raise
            module = None
    if not module:
        raise RuntimeError(f"Can't find app module")
    if not appname:
        appnames = ['app', 'api']
    else:
        appnames = [appname]
    for name in appnames:
        instance = module
        try:
            for attr in name.split('.'):
                instance = getattr(instance, attr)
            appname = name
            break
        except AttributeError:
            if len(appnames) == 1:
                raise
            instance = None
    if not instance:
        raise RuntimeError(f"Can't find app object from module {module}")
    is_wsgi = is_wsgi_app(instance)
    is_asgi = is_asgi_app(instance)
    if not is_wsgi and not is_asgi:
        raise RuntimeError(f"app object should be wsgi app or asgi app")
    application = instance
    if is_wsgi:
        check_django()
    if is_asgi:
        await start_asgi()


def build_environ(request, stderr):
    pathname = request['path']
    if pathname.startswith(app_root):
        pathname = pathname[len(app_root):]
    stdin = BytesIO(request['body'])
    environ = {
        'REQUEST_METHOD': request['method'],
        'SCRIPT_NAME': app_root,
        'PATH_INFO': pathname,
        'QUERY_STRING': request['query'],
        'SERVER_NAME': request['server'],
        'SERVER_PORT': str(request['port']),
        'SERVER_PROTOCOL': 'HTTP/1.0',
        'wsgi.version': (1, 0),
        'wsgi.url_scheme': request['scheme'],
        'wsgi.input': stdin,
        'wsgi.errors': stderr,
        'wsgi.multithread': False,
        'wsgi.multiprocess': True,
        'wsgi.run_once': False,
    }
    headers = request['headers']
    if 'content-type' in headers:
        environ['CONTENT_TYPE'] = headers['content-type']
    else:
        environ['CONTENT_TYPE'] = 'text/plain' 
    if 'content-length' in headers:
        environ['CONTENT_LENGTH'] = headers['content-length']
    else:
        environ['CONTENT_LENGTH'] = str(len(request['body']))

    for k, v in headers.items():
        k = k.replace('-', '_').upper()
        v = v.strip()
        if k in environ:
            continue
        k = f'HTTP_{k}'
        if k in environ:
            environ[k] += ',' + v
        else:
            environ[k] = v
    return environ


class ErrorStream:
    def __init__(self, console):
        self.console = console

    def flush(self):
        pass

    def write(self, msg):
        self.console.log(msg)

    def writelines(self, msgs):
        for msg in msgs:
            self.console.log(msg)


def run_wsgi(request):
    request = request.to_py()
    stdout = BytesIO()
    stderr = ErrorStream(js_console)
    environ = build_environ(request, stderr)

    options = {
        'status': 0,
        'headers': {
            'server': server_version,
        },
    }

    def start_response(status, headers, exc_info=None):
        if options['status'] != 0 and not exc_info:
            raise AssertionError("Headers already set")
        code, _msg = status.split(None, 1)
        options['status'] = int(code)
        oheaders = options['headers']
        for k, v in headers:
            k = k.lower()
            v = v.strip()
            if k in oheaders:
                oheaders[k] += ',' + v
            else:
                oheaders[k] = v
        return stdout.write

    try:
        app_iter = application(environ, start_response)
        for data in app_iter:
            stdout.write(data)
    except Exception as e:
        print(e)
        raise
    finally:
        if app_iter and hasattr(app_iter, 'close'):
            app_iter.close()
    result = to_js({
        'status': options['status'],
        'headers': options['headers'],
        'body': stdout.getbuffer(),
    }, dict_converter=Object.fromEntries)
    return result

async def run_asgi(request):
    return await asgi_server.handle_request(request.to_py())
