import shutil
import subprocess

subprocess.run([shutil.which('npm'), 'run', 'build'])
shutil.rmtree('dist', ignore_errors=True)
shutil.copytree('../../dist/server', 'dist/project_wsgi/server')
shutil.copy('../../dist/service-worker.mjs', 'dist')
shutil.copy('../../dist/style.css', 'dist')
shutil.copy('../../dist/project_wsgi.zip', 'dist')
shutil.copy('../../dist/project_asgi.zip', 'dist')