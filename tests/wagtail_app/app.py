from flask import Flask, render_template, send_file

app = Flask(__name__, 
            static_url_path='/projects',
            static_folder='dist',
            template_folder='templates')

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/projects/project_wagtail/config')
def wagtail_config():
    return {
        'projectRoot': '/opt/project_wagtail',
        'appSpec': 'project_wagtail.wsgi:application',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_wagtail/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_wagtail.zip')
def wagtail_project():
    return send_file('dist/project_wagtail.zip')
