import { getLocalizedMessages } from './locale';

// 웹뷰 HTML 생성 함수
export function getHtmlForWebview(): string {
    const t = getLocalizedMessages();

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AtCoder Helper</title>
            <style>
                body { padding: 10px; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px; }
                .search-box { display: flex; gap: 5px; }
                input { flex: 1; padding: 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                button, select { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
                button:hover, select:hover { background: var(--vscode-button-hoverBackground); }
                select { padding: 6px; outline: none; border: 1px solid var(--vscode-widget-border); }
                #taskList { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
                .task-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); cursor: pointer; }
                .task-btn:hover { background: var(--vscode-list-hoverBackground); }
                .task-btn.active { background: var(--vscode-button-background); color: white; }
                
                #problemContainer { 
                    flex: 1; 
                    display: flex; 
                    flex-direction: column; 
                    border: 1px solid var(--vscode-widget-border); 
                    min-height: 200px;
                    max-height: 400px;
                }
                
                #problemHeader {
                    display: none; 
                    padding: 5px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-widget-border);
                    justify-content: flex-end;
                }
                
                #problemView { 
                    flex: 1;
                    overflow-y: auto; 
                    padding: 10px; 
                    font-size: 0.9em;
                    background: var(--vscode-editor-background);
                }
                #problemView h3 { font-size: 1.1em; margin-top: 10px; border-bottom: 1px solid #555; }
                #problemView pre { background: #333; color: #fff; padding: 5px; overflow-x: auto; }
                
                .actions { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
                .action-row { display: flex; gap: 5px; }
                .action-btn { flex: 1; padding: 8px; font-weight: bold; }
                .btn-green { background-color: #28a745; color: white; }
                .btn-blue { background-color: #007acc; color: white; }
                .btn-gray { background-color: #555; color: white; }
            </style>
        </head>
        <body>
            <div class="search-box">
                <span style="line-height:28px;">ABC</span>
                <input type="text" id="contestId" placeholder="${t.ui_searchPlaceholder}" />
                <button id="searchBtn">${t.ui_searchBtn}</button>
            </div>

            <div id="taskList"></div>

            <div id="problemContainer">
                <div id="problemHeader">
                    <select id="problemLangSelect" style="font-size: 0.8em; padding: 2px;">
                        <option value="ja">日本語 (Original)</option>
                        <option value="en">English</option>
                        <option value="ko">한국어 (Auto Translate)</option>
                    </select>
                </div>
                <div id="problemView"><p style="color: #888; text-align: center;">${t.ui_selectProblemPrompt}</p></div>
            </div>

            <div class="actions">
                <div class="action-row">
                    <select id="codeLangSelect" style="flex: 0.4;">
                        <option value="python">Python</option>
                        <option value="cpp">C++</option>
                        <option value="c">C</option>
                    </select>
                    <button id="createBtn" class="action-btn btn-green" style="flex: 0.6;">${t.ui_createBtn}</button>
                </div>
                <button id="testBtn" class="action-btn btn-blue" disabled>${t.ui_testBtn}</button>
                <button id="openWebBtn" class="action-btn btn-gray" style="display:none;">${t.ui_webBtn}</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById('searchBtn').addEventListener('click', () => {
                    const id = document.getElementById('contestId').value;
                    if(id) vscode.postMessage({ command: 'loadContest', contestId: id });
                });

                const probLangSelect = document.getElementById('problemLangSelect');
                probLangSelect.addEventListener('change', () => {
                    vscode.postMessage({ command: 'changeProblemLanguage', lang: probLangSelect.value });
                });

                document.getElementById('createBtn').addEventListener('click', () => {
                    const lang = document.getElementById('codeLangSelect').value;
                    vscode.postMessage({ command: 'createSourceFile', language: lang });
                });

                document.getElementById('testBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'runTest' });
                });

                document.getElementById('openWebBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'openBrowser' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateTaskList':
                            const listDiv = document.getElementById('taskList');
                            listDiv.innerHTML = '';
                            message.tasks.forEach(task => {
                                const btn = document.createElement('div');
                                btn.className = 'task-btn';
                                btn.innerText = task.label;
                                btn.onclick = () => {
                                    vscode.postMessage({ command: 'selectProblem', url: task.url });
                                    document.querySelectorAll('.task-btn').forEach(b => b.classList.remove('active'));
                                    btn.classList.add('active');
                                    
                                    document.getElementById('problemView').innerHTML = '<p>${t.ui_loading}</p>';
                                    document.getElementById('openWebBtn').style.display = 'none';
                                    
                                    document.getElementById('problemHeader').style.display = 'flex';
                                    document.getElementById('problemLangSelect').value = 'ja';
                                };
                                listDiv.appendChild(btn);
                            });
                            
                            document.getElementById('problemHeader').style.display = 'none';
                            document.getElementById('problemView').innerHTML = '<p style="color: #888; text-align: center;">${t.ui_selectProblemPrompt}</p>';
                            break;

                        case 'displayProblem':
                            document.getElementById('problemView').innerHTML = message.content;
                            document.getElementById('problemHeader').style.display = 'flex';

                            const testBtn = document.getElementById('testBtn');
                            testBtn.disabled = false;
                            testBtn.innerText = message.btnText + ' (' + message.sampleCount + ')';
                            
                            document.getElementById('openWebBtn').style.display = 'block';
                            break;

                        case 'updateProblemContent':
                            document.getElementById('problemView').innerHTML = message.content;
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
}
