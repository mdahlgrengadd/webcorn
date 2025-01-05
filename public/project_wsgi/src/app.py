from flask import Flask, render_template

def app = Flask(__name__)

@app.get('/')
def app():
    return render_template('index.html', dynamic_value="hello from flask")