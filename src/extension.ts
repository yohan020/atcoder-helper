import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as cp from "child_process";

// 결과를 출력할 채널 생성 (터미널 탭 옆 '출력' 탭에 표시됨)
const outputChannel = vscode.window.createOutputChannel('AtCoder Helper');

export function activate(context: vscode.ExtensionContext) {
	// 0. 사이드바 웹뷰 프로바이더 등록 (새로 추가됨)
	const provider = new AtCoderSidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('atcoder.sidebar', provider)
	);
}

// 메모리에 저장할 예제 데이터 타입 정의
interface SampleData {
	input: string;
	output: string;
	id: number;
}

// --- 사이드바 화면을 그려주는 클래스 ---
class AtCoderSidebarProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;

	// 핵심 : 여기에 예제 데이터를 임시 저장
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
			enableScripts: true, // 자바스크립트 허용
			localResourceRoots: [this._extensionUri]
		};

		// 1. 초기 HTML 렌더링
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// 2. HTML (프론트엔드) 에서 보낸 메시지 처리
		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.command) {
				case 'loadContest':
					await this.loadContest(data.contestId);
					break;
				case 'selectProblem':
					await this.selectProblem(data.url);
					break;
				case 'createSourceFile':
					await this.createSourceFile();
					break;
				case 'runTest':
					await this.runTest();
					break;
			}
		});
	}

	// ---- 기능 1. 대회 문제 불러오기 -----
	private async loadContest(contestId: string) {
		if (!contestId) return;
		const listUrl = `https://atcoder.jp/contests/abc${contestId}/tasks`;

		try {
			const response = await axios.get(listUrl);
			const $ = cheerio.load(response.data);

			// 문제 목록 파싱
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
				vscode.window.showErrorMessage('문제를 찾을 수 없습니다. 대회 번호를 확인하세요.');
				return;
			}

			// 결과를 프론트앤드로 전송
			this._view?.webview.postMessage({ type: 'updateTaskList', tasks: tasks });
		} catch (error) {
			vscode.window.showErrorMessage(`대회 정보를 가져오는데 실패했습니다: ${listUrl}`);
		}
	}

	// ---- 기능 2: 문제 선택 및 데이터 파싱 ----
	private async selectProblem(url: string) {
		try {
			const response = await axios.get(url);
			const $ = cheerio.load(response.data);

			// 영어 제거 로직 (중복 방지)
			if ($('.lang-ja').length > 0) { $('.lang-en').remove(); }

			// 문제 본문 가져오기
			const problemHtml = $('#task-statement').html();
			this._currentProblemUrl = url;

			// 예제 데이터를 파싱해서 메모리에 저장
			this._currentSamples = [] // 초기화
			let inputCount = 1;
			let outputCount = 1;

			// 임시 저장소
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

			// 짝 맞춰서 저장
			for (let i = 1; i < inputCount; i++) {
				if (inputs[i] && outputs[i]) {
					this._currentSamples.push({
						id: i,
						input: inputs[i],
						output: outputs[i]
					});
				}
			}


			if (problemHtml) {
				// 프론트엔드에 문제 내용 전송
				this._view?.webview.postMessage({
					type: 'displayProblem',
					content: problemHtml,
					sampleCount: this._currentProblemUrl.length
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`문제 상세 내용을 가져오는데 실패했습니다.`);
		}
	}

	// ---- 기능 3: 소스 코드 파일(solve.py) 생성 ----
	private async createSourceFile() {
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('폴더를 먼저 열어주세요!');
			return;
		}
		const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const solvePath = path.join(rootPath, 'solve.py');

		// 1. 파일이 없을 때만 생성 (원하는 템플릿 적용)
		if (!fs.existsSync(solvePath)) {
			const template = "import sys\n\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nif __name__ == \"__main__\":\n    solve()";

			fs.writeFileSync(solvePath, template);
			vscode.window.showInformationMessage('solve.py 파일이 생성되었습니다.');
		}

		// 2. 파일 열기
		try {
			const doc = await vscode.workspace.openTextDocument(solvePath);
			await vscode.window.showTextDocument(doc, { preview: false });
		} catch (error) {
			vscode.window.showErrorMessage('파일을 여는 도중 오류가 발생했습니다.');
		}
	}

	// --- 기능 4: 메모리 상의 데이터로 테스트 실행 ---
	private async runTest() {
		// 1. 파이썬 파일 찾기
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.fileName.endsWith('.py')) {
			vscode.window.showErrorMessage('파이썬(.py) 파일을 열고 실행해주세요!');
			return;
		}

		const pyFilePath = editor.document.fileName;

		// 2. 예제 데이터 확인
		if (this._currentSamples.length === 0) {
			vscode.window.showErrorMessage('테스트할 예제 데이터가 없습니다. 목록에서 문제를 다시 선택해주세요.');
			return;
		}

		outputChannel.clear();
		outputChannel.show(true);
		outputChannel.appendLine(`🚀 Testing: ${path.basename(pyFilePath)}`);
		outputChannel.appendLine(`-----------------------------------------`);
		let passCount = 0;

		// 3. 메모리에 있는 예제들로 반복 테스트
		for (const sample of this._currentSamples) {
			try {
				const actualOutput = (await this.runPython(pyFilePath, sample.input)).trim();
				const expectedOutput = sample.output;
				if (actualOutput === expectedOutput) {
					outputChannel.appendLine(`✅ Case ${sample.id}: 통과!`);
					outputChannel.appendLine(`	[정답] ${expectedOutput}`);
					outputChannel.appendLine(`	[실제] ${actualOutput}`);
					outputChannel.appendLine(`-----------------------------------------`);
					passCount++;
				} else {
					outputChannel.appendLine(`❌ Case ${sample.id}: 실패!`);
					outputChannel.appendLine(`	[정답] ${expectedOutput}`);
					outputChannel.appendLine(`	[실제] ${actualOutput}`);
					outputChannel.appendLine(`-----------------------------------------`);
				}
			} catch (err: any) {
				outputChannel.appendLine(`❌ Case ${sample.id}: 에러 발생`);
				outputChannel.appendLine(`	${err.message}`);
			}
		}
		if (passCount === this._currentSamples.length) {
			outputChannel.appendLine(`🎉 모든 테스트(${passCount}개) 통과!`);
			outputChannel.appendLine(`-----------------------------------------`);
		} else {
			outputChannel.appendLine(`✅ 정답 갯수 : 총 문제 ${this._currentSamples.length}개 중 ${passCount}개 정답`);
			outputChannel.appendLine(`	정답률 : ${passCount / this._currentSamples.length * 100}%`);
			outputChannel.appendLine(`-----------------------------------------`);
		}
	}
	private runPython(scriptPath: string, input: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const cmd = process.platform === 'win32' ? 'python' : 'python3';
			const proc = cp.spawn(cmd, [scriptPath]);
			let stdout = '', stderr = '';

			proc.stdin.write(input);
			proc.stdin.end();

			proc.stdout.on('data', d => stdout += d);
			proc.stderr.on('data', d => stderr += d);
			proc.on('close', c => c === 0 ? resolve(stdout) : reject(new Error(stderr)));
			proc.on('error', err => reject(err));
		});
	}

	// --- 화면(HTML) 구성 ---
	// HTML 부분 (버튼 이름 변경)
	private _getHtmlForWebview(webview: vscode.Webview) {
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
                button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
                button:hover { background: var(--vscode-button-hoverBackground); }
                #taskList { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
                .task-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); cursor: pointer; }
                .task-btn:hover { background: var(--vscode-list-hoverBackground); }
                .task-btn.active { background: var(--vscode-button-background); color: white; }
                #problemView { flex: 1; min-height: 200px; max-height: 400px; overflow-y: auto; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 10px; font-size: 0.9em; }
                #problemView h3 { font-size: 1.1em; margin-top: 10px; border-bottom: 1px solid #555; }
                #problemView pre { background: #333; color: #fff; padding: 5px; overflow-x: auto; }
                .actions { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
                .action-btn { width: 100%; padding: 8px; font-weight: bold; }
                .btn-green { background-color: #28a745; color: white; }
                .btn-blue { background-color: #007acc; color: white; }
            </style>
        </head>
        <body>
            <div class="search-box">
                <span style="line-height:28px;">ABC</span>
                <input type="text" id="contestId" placeholder="386" />
                <button id="searchBtn">조회</button>
            </div>
            <div id="taskList"></div>
            <div id="problemView"><p style="color: #888; text-align: center;">문제를 선택하세요.</p></div>
            <div class="actions">
                <button id="createBtn" class="action-btn btn-green">📄 solve.py 열기/생성</button>
                <button id="testBtn" class="action-btn btn-blue" disabled>▶️ 테스트 실행</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('searchBtn').addEventListener('click', () => {
                    const id = document.getElementById('contestId').value;
                    if(id) vscode.postMessage({ command: 'loadContest', contestId: id });
                });
                document.getElementById('createBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'createSourceFile' });
                });
                document.getElementById('testBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'runTest' });
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
                                    document.getElementById('problemView').innerHTML = '<p>불러오는 중...</p>';
                                };
                                listDiv.appendChild(btn);
                            });
                            break;
                        case 'displayProblem':
                            document.getElementById('problemView').innerHTML = message.content;
                            document.getElementById('testBtn').disabled = false; // 테스트 버튼은 여전히 데이터가 있어야 하므로 유지
                            document.getElementById('testBtn').innerText = '▶️ 테스트 실행 (' + message.sampleCount + '개)';
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
	}
}

export function deactivate() { }