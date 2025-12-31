import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as cp from "child_process";

// 👇 언어 팩 가져오기
import { getLocalizedMessages } from './locale';

const outputChannel = vscode.window.createOutputChannel('AtCoder Helper');

export function activate(context: vscode.ExtensionContext) {
	const provider = new AtCoderSidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('atcoder.sidebar', provider)
	);

	// 언어 설정이 바뀌면 웹뷰를 새로고침해서 UI 언어를 바로 반영
	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('atcoder-helper.language')) {
			provider.refresh();
		}
	});
}

interface SampleData {
	input: string;
	output: string;
	id: number;
}

class AtCoderSidebarProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _currentSamples: SampleData[] = [];
	private _currentProblemUrl: string = '';

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (data) => {
			const t = getLocalizedMessages(); // 메시지 로드

			switch (data.command) {
				case 'loadContest':
					await this.loadContest(data.contestId);
					break;
				case 'selectProblem':
					await this.selectProblem(data.url);
					break;
				case 'createSourceFile':
					await this.createSourceFile(data.language);
					break;
				case 'runTest':
					await this.runTest();
					break;
				case 'openBrowser':
					if (this._currentProblemUrl) {
						await vscode.env.openExternal(vscode.Uri.parse(this._currentProblemUrl));
					} else {
						vscode.window.showErrorMessage(t.selectProblemFirst);
					}
					break;
			}
		});
	}

	// ---- 기능 1. 대회 문제 불러오기 -----
	private async loadContest(contestId: string) {
		const t = getLocalizedMessages();
		if (!contestId) return;
		const listUrl = `https://atcoder.jp/contests/abc${contestId}/tasks`;

		try {
			const response = await axios.get(listUrl);
			const $ = cheerio.load(response.data);

			const tasks: { label: string, url: string }[] = [];
			$('tbody tr').each((i, el) => {
				const linkTag = $(el).find('td').first().find('a');
				const label = linkTag.text();
				const href = linkTag.attr('href');
				if (label && href) {
					tasks.push({ label, url: `https://atcoder.jp${href}` });
				}
			});

			if (tasks.length === 0) {
				vscode.window.showErrorMessage(t.contestNotFound);
				return;
			}
			this._view?.webview.postMessage({ type: 'updateTaskList', tasks: tasks });
		} catch (error) {
			vscode.window.showErrorMessage(`${t.fetchError}: ${listUrl}`);
		}
	}

	// ---- 기능 2: 문제 선택 및 데이터 파싱 ----
	private async selectProblem(url: string) {
		const t = getLocalizedMessages();
		try {
			const response = await axios.get(url);
			const $ = cheerio.load(response.data);
			if ($('.lang-ja').length > 0) { $('.lang-en').remove(); }

			const problemHtml = $('#task-statement').html();
			this._currentProblemUrl = url;

			this._currentSamples = [];
			let inputCount = 1;
			let outputCount = 1;

			const inputs: { [key: number]: string } = {};
			const outputs: { [key: number]: string } = {};

			$('section').each((index, element) => {
				const title = $(element).find('h3').text();
				const content = $(element).find('pre').text();

				if (title.includes('入力例') || title.includes('Sample Input')) {
					inputs[inputCount] = content.trim();
					inputCount++;
				} else if (title.includes('出力例') || title.includes('Sample Output')) {
					outputs[outputCount] = content.trim();
					outputCount++;
				}
			});

			for (let i = 1; i < inputCount; i++) {
				if (inputs[i] && outputs[i]) {
					this._currentSamples.push({ id: i, input: inputs[i], output: outputs[i] });
				}
			}

			if (problemHtml) {
				this._view?.webview.postMessage({
					type: 'displayProblem',
					content: problemHtml,
					sampleCount: this._currentSamples.length,
					btnText: t.ui_testBtnRunning
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(t.detailError);
		}
	}

	// ---- 기능 3: 소스 코드 파일 생성 ----
	private async createSourceFile(language: string) {
		const t = getLocalizedMessages();
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage(t.folderError);
			return;
		}
		const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		let fileName = '';
		let template = '';

		if (language === 'c') {
			fileName = 'solve.c';
			template = '#include <stdio.h>\n\nint main() {\n    return 0;\n}';
		} else if (language === 'cpp') {
			fileName = 'solve.cpp';
			template = '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}';
		} else if (language === 'python') {
			fileName = 'solve.py';
			template = 'import sys\n\ninput = sys.stdin.readline\ndef solve():\n    pass\n\nif __name__ == "__main__":\n    solve()';
		}

		const solvePath = path.join(rootPath, fileName);

		if (!fs.existsSync(solvePath)) {
			fs.writeFileSync(solvePath, template);
			vscode.window.showInformationMessage(`${fileName} ${t.fileCreated}`);
		}

		try {
			const doc = await vscode.workspace.openTextDocument(solvePath);
			await vscode.window.showTextDocument(doc, { preview: false });
		} catch (error) {
			vscode.window.showErrorMessage(t.fileOpenError);
		}
	}

	// ---- 기능 4: 테스트 실행 ----
	private async runTest() {
		const t = getLocalizedMessages();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage(t.noEditorError);
			return;
		}

		const filePath = editor.document.fileName;
		const ext = path.extname(filePath);

		if (this._currentSamples.length === 0) {
			vscode.window.showErrorMessage(t.noDataError);
			return;
		}

		outputChannel.clear();
		outputChannel.show(true);
		outputChannel.appendLine(`🚀 ${t.testingStart}: ${path.basename(filePath)} (${ext})`);
		outputChannel.appendLine(`-----------------------------------------`);

		let executablePath = '';
		if (ext === '.c' || ext === '.cpp') {
			try {
				outputChannel.appendLine(`🔨 ${t.compiling}`);
				executablePath = await this.compileCode(filePath, ext);
				outputChannel.appendLine(`✅ ${t.compileSuccess}`);
			} catch (compileError: any) {
				outputChannel.appendLine(`❌ ${t.compileFail}:`);
				outputChannel.appendLine(compileError.message);
				return;
			}
		}

		let passCount = 0;
		for (const sample of this._currentSamples) {
			try {
				let actualOutput = '';
				if (ext === '.c' || ext === '.cpp') {
					actualOutput = (await this.runExecutable(executablePath, sample.input)).trim();
				} else if (ext === '.py') {
					actualOutput = (await this.runPython(filePath, sample.input)).trim();
				} else {
					vscode.window.showErrorMessage(t.unsupportedFile);
					return;
				}

				const expectedOutput = sample.output.trim();
				if (actualOutput === expectedOutput) {
					outputChannel.appendLine(`✅ Case ${sample.id}: ${t.casePass}`);
					outputChannel.appendLine(`  [${t.expected}] ${expectedOutput}`);
					outputChannel.appendLine(`  [${t.actual}] ${actualOutput}`);
					passCount++;
				} else {
					outputChannel.appendLine(`❌ Case ${sample.id}: ${t.caseFail}`);
					outputChannel.appendLine(`  [${t.expected}] ${expectedOutput}`);
					outputChannel.appendLine(`  [${t.actual}] ${actualOutput}`);
				}
				outputChannel.appendLine(`-----------------------------------------`);
			} catch (err: any) {
				outputChannel.appendLine(`❌ Case ${sample.id}: ${t.caseError}`);
				outputChannel.appendLine(`  ${err.message}`);
			}
		}

		if (passCount === this._currentSamples.length) {
			outputChannel.appendLine(t.allPass);
		} else {
			const ratio = (passCount / this._currentSamples.length * 100).toFixed(1);
			outputChannel.appendLine(`✅ ${t.resultSummary} : ${t.resultSummary} ${this._currentSamples.length} / ${passCount}`);
			outputChannel.appendLine(`  ${t.resultRatio} : ${ratio}%`);
		}
		outputChannel.appendLine(`-----------------------------------------`);
	}

	private runPython(scriptPath: string, input: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const cmd = process.platform === 'win32' ? 'python' : 'python3';
			const proc = cp.spawn(cmd, [scriptPath]);
			this.handleProcess(proc, input, resolve, reject);
		});
	}

	private compileCode(sourcePath: string, ext: string): Promise<string> {
		const t = getLocalizedMessages();
		return new Promise((resolve, reject) => {
			const dir = path.dirname(sourcePath);
			const fileName = path.basename(sourcePath, ext);
			const outName = process.platform === 'win32' ? `${fileName}.exe` : fileName;
			const outPath = path.join(dir, outName);

			let cmd = 'g++';
			let args: string[] = [];
			if (ext.toLowerCase() === '.c') {
				cmd = 'gcc';
				args = [sourcePath, '-o', outPath, '-O2', '-lm'];
			} else {
				cmd = 'g++';
				args = [sourcePath, '-o', outPath, '-std=c++17', '-O2'];
			}

			if (!cmd) {
				reject(new Error(t.compilerCmdEmpty));
				return;
			}

			cp.execFile(cmd, args, (error, stdout, stderr) => {
				if (error) {
					reject(new Error(stderr || stdout || error.message));
				} else {
					resolve(outPath);
				}
			});
		});
	}

	private runExecutable(exePath: string, input: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const proc = cp.spawn(exePath);
			this.handleProcess(proc, input, resolve, reject);
		});
	}

	private handleProcess(proc: cp.ChildProcessWithoutNullStreams, input: string, resolve: (value: string) => void, reject: (reason?: any) => void) {
		let stdout = '', stderr = '';
		try {
			proc.stdin.write(input);
			proc.stdin.end();
		} catch (e) { reject(e); }
		proc.stdout.on('data', d => stdout += d);
		proc.stderr.on('data', d => stderr += d);
		proc.on('close', code => {
			if (code === 0) resolve(stdout);
			else reject(new Error(stderr));
		});
		proc.on('error', err => reject(err));
	}

	// --- HTML 구성 ---
	private _getHtmlForWebview(webview: vscode.Webview) {
		const t = getLocalizedMessages(); // 언어 팩 가져오기

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
                #problemView { flex: 1; min-height: 200px; max-height: 400px; overflow-y: auto; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 10px; font-size: 0.9em; }
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
            <div id="problemView"><p style="color: #888; text-align: center;">${t.ui_selectProblemPrompt}</p></div>
            <div class="actions">
                <div class="action-row">
                    <select id="langSelect" style="flex: 0.4;">
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
                document.getElementById('createBtn').addEventListener('click', () => {
                    const lang = document.getElementById('langSelect').value;
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
                                };
                                listDiv.appendChild(btn);
                            });
                            break;
                        case 'displayProblem':
                            document.getElementById('problemView').innerHTML = message.content;
                            const testBtn = document.getElementById('testBtn');
                            testBtn.disabled = false;
                            testBtn.innerText = message.btnText + ' (' + message.sampleCount + ')';
                            document.getElementById('openWebBtn').style.display = 'block';
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
	}

	// 언어 설정 변경 감지시 강제로 다시 그리는 함수
	public refresh() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
		}
	}
}

export function deactivate() { }