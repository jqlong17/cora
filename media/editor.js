(function () {
    const vscode = acquireVsCodeApi();

    const DEFAULT_MODE = 'preview';
    let currentMode = DEFAULT_MODE;
    let initReceived = false;

    const editorEl = document.getElementById('editor');
    const previewBtn = document.getElementById('previewBtn');
    const editBtn = document.getElementById('editBtn');
    const editorView = document.getElementById('editorView');
    const previewView = document.getElementById('previewView');
    const debugBar = document.getElementById('debugBar');

    function debugLog(msg) {
        if (debugBar) {
            debugBar.textContent = msg;
        }
    }

    function switchMode(mode) {
        currentMode = mode;
        vscode.setState({ mode: mode });
        updateUI(mode);
    }

    function updateUI(mode) {
        previewBtn.classList.toggle('active', mode === 'preview');
        editBtn.classList.toggle('active', mode === 'edit');
        editorView.classList.toggle('hidden', mode !== 'edit');
        previewView.classList.toggle('hidden', mode !== 'preview');
        debugLog('mode: ' + mode + (initReceived ? '' : ' (waiting for init...)'));

        if (mode === 'edit') {
            setTimeout(function () { editorEl.focus(); }, 0);
        }
    }

    previewBtn.addEventListener('click', function () {
        switchMode('preview');
    });

    editBtn.addEventListener('click', function () {
        switchMode('edit');
    });

    var saveTimeout;
    editorEl.addEventListener('input', function (e) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function () {
            vscode.postMessage({ command: 'save', content: e.target.value });
        }, 500);
    });

    window.addEventListener('message', function (event) {
        var data = event.data;
        switch (data.command) {
            case 'init':
                initReceived = true;
                editorEl.value = data.content;
                switchMode(data.mode || DEFAULT_MODE);
                break;
            case 'setMode':
                currentMode = data.mode;
                updateUI(data.mode);
                break;
            case 'updateContent':
                editorEl.value = data.content;
                break;
        }
    });

    debugLog('script loaded, sending ready...');
    updateUI(DEFAULT_MODE);
    vscode.postMessage({ command: 'ready' });

    // Fallback: if init message never arrives, stay in preview mode
    setTimeout(function () {
        if (!initReceived) {
            debugLog('init timeout - forcing preview mode');
            switchMode(DEFAULT_MODE);
        }
    }, 2000);
})();
