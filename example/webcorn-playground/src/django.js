import { startAppServer } from "webcorn/server";

const consoleDom = document.getElementById('console');
const options = {
        projectRoot: '/opt/project_django',
        appSpec: 'project_django.wsgi:application',
        consoleDom,
}
startAppServer(options);

const previewFrame = document.getElementById('previewFrame');

function updatePreview(content) {
    const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    previewDoc.open();
    previewDoc.write(content);
    previewDoc.close();
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
function initializeResizer(resizerElement, prevElement, nextElement, isHorizontal = true) {
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

        if (isHorizontal) {
            const newPrevSize = Math.max(100, startSize + diff);
            const newNextSize = Math.max(150, startSize2 - diff);
            prevElement.style.width = `${newPrevSize}px`;
            if (nextElement === document.querySelector('.preview')) {
                nextElement.style.width = `${newNextSize}px`;
            }
        } else {
            const containerHeight = document.querySelector('.main-content').offsetHeight;
            const maxTerminalHeight = containerHeight - 200; // Minimum space for editor
            const newSize = Math.min(maxTerminalHeight, Math.max(100, startSize - diff));
            prevElement.style.height = `${newSize}px`;
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
    document.querySelector('.main-content'), 
    document.querySelector('.preview'));

setTimeout(() => addTerminalLine('$ Starting development server...'), 1000);
setTimeout(() => addTerminalLine('$ Compiled successfully!'), 2000);