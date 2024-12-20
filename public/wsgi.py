from pyodide.ffi import to_js

def app(environ, start_response):
    print("wsgi app running")
    status = "200 OK"
    headers = [
        ('Content-Type', 'text/plain'),
        #('Content-Length', "14"),
    ]
    write = start_response(status, headers)
    write(b"Hello ")
    return [b"Webcorn!"]

app = to_js(app)

is_wsgi = True