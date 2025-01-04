import shutil
import subprocess

subprocess.run([shutil.which('npm'), 'run', 'build'])
print("remove dist directory...")
shutil.rmtree('dist', ignore_errors=True)
print("copy server files...")
shutil.copytree('../../dist/server', 'dist/project_wsgi/server')
print("copy service-worker.mjs...")
shutil.copy('../../dist/service-worker.mjs', 'dist')
print("copy style.css...")
shutil.copy('../../dist/style.css', 'dist')
print("copy project_wsgi.zip...")
shutil.copy('../../dist/project_wsgi.zip', 'dist')
print("copy project_asgi.zip...")
shutil.copy('../../dist/project_asgi.zip', 'dist')
print('run fry server...')
subprocess.run([shutil.which('fry'), 'run'])