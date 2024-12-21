import sys
from pathlib import Path
from importlib import import_module
from io import BytesIO
from pyodide.http import pyfetch
from pyodide.ffi import to_py

app = None
is_wsgi = True
app_root = ''

async def load(root_path):
    global app, is_wsgi, app_root
    app_root = root_path
    path = Path(root_path)
    root = Path('/projects')
    project_dir = root / path.stem
    if not project_dir.exists():
        response = await pyfetch(f'/{path.stem}.zip')
        await response.unpack_archive(extract_dir=root)
    project_src = project_dir / 'src'
    project_src = str(project_src.resolve())
    if not project_src in sys.path:
        sys.path.insert(0, project_src)
    module = import_module('app')
    app = module.app
    is_wsgi = module.is_wsgi

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
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'wsgi.version': (1, 0),
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

    for (const [k, v] of headers) {
        const k1 = k.replace(/-/g, '_').toUpperCase();
        if (k1 in environ) continue;
        const k2 = `HTTP_${k1}`;
        if (k2 in environ) {
            environ[k2] += ','+v;
        } else {
            environ[k2] = v;
        }
    }
    return environ;

def run_wsgi(request):
    request = to_py(request)
    environ = build_environ(request)

async def run_asgi(request):
    pass