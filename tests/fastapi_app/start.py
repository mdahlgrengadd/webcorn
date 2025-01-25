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
shutil.copy('public/server.html', 'dist/project_fastapi')
print("generate project_fastapi.zip...")
shutil.make_archive('dist/project_fastapi/project_fastapi', 'zip', 'public', 'project_fastapi')
print('run http server...')
os.chdir('dist')
from http.server import test, SimpleHTTPRequestHandler
test(SimpleHTTPRequestHandler)