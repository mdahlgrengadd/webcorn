from functools import partial
from asyncio import iscoroutinefunction
from importlib import import_module
from pathlib import Path
from urllib.parse import urlparse, urljoin
from collections.abc import Iterable
import inspect
import sys
import os
from io import BytesIO, StringIO
from pyodide.ffi import to_js
from pyodide.http import pyfetch
from js import Object
from platform import python_implementation
import micropip

version = '0.1.0'
application = None
is_wsgi = True
is_asgi = False
app_root = ''
server_version = f'Webcorn/{version} {python_implementation()}/{sys.version.split()[0]}'

def is_wsgi_app(app):
    print(app)
    # 检查对象是否可调用
    if not callable(app):
        return False

    # 检查参数签名
    sig = inspect.signature(app)
    params = list(sig.parameters.keys())
    print(params)
    # WSGI 应用的参数应该是 environ 和 start_response
    if len(params) != 2: # or params[0] != 'environ' or params[1] != 'start_response':
        return False

    # 尝试调用应用，确保它不会抛出异常
    try:
        # 创建一个示例的 environ 对象
        environ = {
            'REQUEST_METHOD': 'GET',
            'PATH_INFO': '/',
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': BytesIO(),
            'wsgi.errors': StringIO(),
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
        }
        
        # 简单的 start_response 函数
        def start_response(status, headers):
            return lambda b: len(b)
        
        # 尝试调用应用
        result = app(environ, start_response)
        result = isinstance(result, Iterable)
        return result
    except Exception as e:
        print(e)
    return False


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


async def load_app(project_root, app_spec, app_url):
    global application, is_wsgi, is_asgi
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


def run_wsgi(request, console):
    request = request.to_py()
    stdout = BytesIO()
    stderr = ErrorStream(console)
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
        code, msg = status.split(None, 1)
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
    request = request.to_py()
    pass