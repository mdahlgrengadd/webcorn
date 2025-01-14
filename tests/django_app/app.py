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
        'appSpec': 'project_django.wsgi:application',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_django/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_django.zip')
def django_project():
    return send_file('dist/project_django.zip')
