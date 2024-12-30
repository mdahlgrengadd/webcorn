from functools import partial
from asyncio import iscoroutinefunction
from importlib import import_module
from collections import Iterable
import inspect
import sys
from pathlib import Path
from io import BytesIO
import pyodide
from pyodide.http import pyfetch
from pyodide.ffi import to_py

app = None
is_wsgi = True
app_root = ''

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

    # 尝试调用应用，确保它不会抛出异常
    try:
        # 创建一个示例的 environ 对象
        environ = {
            'REQUEST_METHOD': 'GET',
            'PATH_INFO': '/',
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': '',
            'wsgi.errors': '',
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
        }
        
        # 简单的 start_response 函数
        def start_response(status, headers):
            pass
        
        # 尝试调用应用
        result = app(environ, start_response)
        result = isinstance(result, Iterable)
        return result
    except:
        pass
    return False


def is_async_callable(obj):
    while isinstance(obj, partial):
        obj = obj.functools
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

def add_app_syspaths(app_spec):
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

def load_app(app_spec):
    add_app_syspaths()
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
        except Exception as e:
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
            instance = None
    if not instance:
        raise RuntimeError(f"Can't find app object from module {module}")
    is_wsgi = is_wsgi_app(instance)
    is_asgi = is_asgi_app(instance)
    if not is_wsgi and not is_asgi:
        raise RuntimeError(f"app object should be wsgi app or asgi app")
    return instance, is_wsgi

def build_environ(request):
    pathname = request['pathname']
    if pathname.startswith(app_root):
        pathname = pathname[len(app_root):]
    environ = {
        'REQUEST_METHOD': request['method'],
        'SCRIPT_NAME': app_root,
        'PATH_INFO': pathname,
        'QUERY_STRING': request['query_string'],
        'SERVER_NAME': request['hostname'],
        'SERVER_PORT': str(request['port']),
        'SERVER_PROTOCOL': 'HTTP/0.1',
        'wsgi.version': (0, 0),
        'wsgi.url_scheme': request['scheme'],
        'wsgi.input': BytesIO(request['body']),
        'wsgi.errors': sys.stderr,
        'wsgi.multithread': False,
        'wsgi.multiprocess': False,
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
        environ['CONTENT_LENGTH'] = ''

    for k, v in headers:
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

def run_wsgi(request):
    request = to_py(request)
    environ = build_environ(request)

async def run_asgi(request):
    pass