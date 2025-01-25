import os
import shutil
import subprocess

print("remove webcorn dist directory...")
shutil.rmtree('../../dist', ignore_errors=True)
subprocess.run([shutil.which('npm'), 'install'], cwd="../..")
subprocess.run([shutil.which('npm'), 'run', 'build'], cwd="../..")
print("remove dist directory...")
shutil.rmtree('dist', ignore_errors=True)
subprocess.run([shutil.which('npm'), 'install'])
subprocess.run([shutil.which('npm'), 'run', 'build'])
print("copy index.html...")
shutil.copy('public/index.html', 'dist')
print("copy server.html...")
shutil.copy('public/server.html', 'dist/project_flask')
print("generate project_flask.zip...")
shutil.make_archive('dist/project_flask/project_flask', 'zip', 'public', 'project_flask')
print('run http server...')
os.chdir('dist')
from http.server import test, SimpleHTTPRequestHandler
test(SimpleHTTPRequestHandler)