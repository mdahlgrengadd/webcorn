import shutil
shutil.rmtree('static')
shutil.copytree('../../dist/server', 'static/project_wsgi/server')
shutil.copy('../../dist/service-worker.mjs', 'static')
shutil.copy('../../dist/style.css', 'static')
shutil.copy('../../dist/project_wsgi.zip', 'static')
shutil.copy('../../dist/project_asgi.zip', 'static')