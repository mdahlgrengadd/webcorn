from flask import Flask, render_template

app = Flask(__name__)

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/static/project_wsgi/config')
def config():
    return {
        'projectRoot': '/opt/project_wsgi',
        'appSpec': 'src/app:app',
        'appUrl': '/static/project_wsgi/app',
        'serverUrl': '/static/project_wsgi/server',
        'staticRoot': '/opt/project_wsgi/static',
        'staticUrl': '/static/project_wsgi/app/static',
    }