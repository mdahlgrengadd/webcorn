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
