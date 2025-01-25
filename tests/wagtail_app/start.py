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
shutil.copy('public/server.html', 'dist/project_wagtail')
print("generate project_wagtail.zip...")
shutil.make_archive('dist/project_wagtail/project_wagtail', 'zip', 'public', 'project_wagtail')
print('run http server...')
os.chdir('dist')
from http.server import test, SimpleHTTPRequestHandler
test(SimpleHTTPRequestHandler)