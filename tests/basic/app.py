from flask import Flask, render_template, send_file

app = Flask(__name__, 
            static_url_path='/projects',
            static_folder='dist',
            template_folder='templates')

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/projects/project_wsgi/config')
def config():
    return {
        'projectRoot': '/opt/project_wsgi',
        'appSpec': 'src/app:app',
        'appUrl': '/app',
        'serverUrl': '/server',
        'staticRoot': '/opt/project_wsgi/static',
        'staticUrl': '/app/static',
    }

@app.get('/projects/project_wsgi.zip')
def project():
    return send_file('dist/project_wsgi.zip')