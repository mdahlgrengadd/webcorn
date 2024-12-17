from wsgiref.simple_server import make_server
from pathlib import Path

class StaticFiles:
    def __init__(self, url_prefix, root_dir, headers=None):
        self.url_prefix = url_prefix
        self.root_dir = Path(root_dir).resolve(strict=True)
        self.headers = {} if not headers else headers

    def __call__(self, environ, start_response):
        path = environ['PATH_INFO']
        assert path.startswith(self.url_prefix)
        path = path[len(self.url_prefix):].lstrip('/')
        file = self.root_dir / path
        if file.is_dir():
            file = file / 'index.html'
        content_types = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.html': 'text/html',
        }
        print(file)
        if file.exists():
            headers = {'content-type': content_types.get(file.suffix, 'text/plain; charset=utf-8')}
            with file.open('rb') as f:
                data = f.read()
                headers['content-length'] = str(len(data))
            status = '200 OK'
        else:
            headers = {'content-type': 'text/plain; charset=utf-8'}
            status = '404 Not Found'
            data = f'Not Found: {path}'.encode()
        headers.update(self.headers)
        headers = [(k,v) for k,v in headers.items()]
        print(headers)
        start_response(status, headers)
        return [data]



class App:
    def __init__(self):
        self.staticapp = StaticFiles('/static/', 'frystatic')
        headers = {
            'service-worker-allowed': '/',
        }
        self.swapp = StaticFiles('/sw', 'sw', headers)
        self.appapp = StaticFiles('/app', 'fryapp')
        self.defaultapp = StaticFiles("/", '.')

    def __call__(self, environ, start_response):
        path = environ['PATH_INFO']
        print(path)
        if path.startswith('/static/'):
            return self.staticapp(environ, start_response)
        elif path.startswith('/sw'):
            return self.swapp(environ, start_response)
        elif path.startswith('/app'):
            return self.appapp(environ, start_response)
        else:
            return self.defaultapp(environ, start_response)


httpd = make_server('', 8000, App())
print("Serving on port 8000 ...")

try:
    httpd.serve_forever()
except:
    print("Shutting down.")
    httpd.server_close()