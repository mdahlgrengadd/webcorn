from flask import Flask, render_template, send_file

app = Flask(__name__, 
            static_url_path='/projects',
            static_folder='dist',
            template_folder='templates')

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/projects/project_django/config')
def django_config():
    return {
        'projectRoot': '/opt/project_django',
        'appSpec': 'project_django:application',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_django/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_django.zip')
def django_project():
    return send_file('dist/project_django.zip')

@app.get('/projects/project_flask/config')
def flask_config():
    return {
        'projectRoot': '/opt/project_flask',
        'appSpec': 'src/app:app',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_flask/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_flask.zip')
def flask_project():
    return send_file('dist/project_flask.zip')

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