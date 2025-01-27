import { startAppServer } from "webcorn/server";

const options = {
        projectRoot: '/opt/project_django',
        appSpec: 'project_django.wsgi:application',
        log: addTerminalLine,
}
try {
    startAppServer(options);
} catch (e) {
    window.location = new URL('../', window.location).href;
}

// Add terminal functionality
const terminal = document.querySelector('.terminal-content');
function addTerminalLine(text) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Resizer functionality
function initializeResizer(resizerElement, prevElement, nextElement, isHorizontal = false) {
    let isResizing = false;
    let startPos = 0;
    let startSize = 0;
    let startSize2 = 0;

    resizerElement.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizerElement.classList.add('resizing');
        startPos = isHorizontal ? e.pageX : e.pageY;
        startSize = isHorizontal ? prevElement.offsetWidth : prevElement.offsetHeight;
        startSize2 = isHorizontal ? nextElement.offsetWidth : nextElement.offsetHeight;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isResizing) return;

        const currentPos = isHorizontal ? e.pageX : e.pageY;
        const diff = currentPos - startPos;

        const newPrevSize = Math.max(100, startSize + diff);
        const newNextSize = Math.max(150, startSize2 - diff);
        if (isHorizontal) {
            prevElement.style.width = `${newPrevSize}px`;
            nextElement.style.width = `${newNextSize}px`;
        } else {
            prevElement.style.height = `${newPrevSize}px`;
            nextElement.style.height = `${newNextSize}px`;
        }
    }

    function onMouseUp() {
        isResizing = false;
        resizerElement.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// Initialize resizers
const previewResizer = document.getElementById('preview-resizer');

initializeResizer(previewResizer, 
    document.querySelector('.preview'),
    document.querySelector('.main-content'));

setTimeout(() => addTerminalLine('Loading...'), 1000);


let appUrl = new URL('./~webcorn/admin', self.location).href;

const addressInput = document.querySelector('.address-input');
addressInput.value = appUrl;

const previewFrame = document.getElementById('previewFrame');

setTimeout(() => { previewFrame.src = appUrl; }, 1000);

addressInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        appUrl = addressInput.value;
        previewFrame.src = appUrl;
    }
});

const refreshButton = document.getElementById('refreshButton');
refreshButton.addEventListener('click', () => {
    appUrl = addressInput.value;
    previewFrame.src = appUrl;
});

const homeButton = document.getElementById('homeButton');
homeButton.addEventListener('click', () => {
    window.location = new URL('../', window.location).href;
});