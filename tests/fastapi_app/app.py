from flask import Flask, render_template, send_file

app = Flask(__name__, 
            static_url_path='/projects',
            static_folder='dist',
            template_folder='templates')

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/projects/project_fastapi/config')
def fastapi_config():
    return {
        'projectRoot': '/opt/project_fastapi',
        'appSpec': 'src/app:app',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_fastapi/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_fastapi.zip')
def fastapi_project():
    return send_file('dist/project_fastapi.zip')