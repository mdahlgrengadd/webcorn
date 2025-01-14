from flask import Flask, render_template, send_file

app = Flask(__name__, 
            static_url_path='/projects',
            static_folder='dist',
            template_folder='templates')

@app.get('/')
def index():
    return render_template('index.html')

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