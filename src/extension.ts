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

	// 1. 문제 파싱 명령어 (기존 코드 유지)
	let parseCommand = vscode.commands.registerCommand('atcoder-helper.parseProblem', async () => {

		// 1. 작업 폴더 확인
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('폴더를 먼저 열어주세요!');
			return;
		}
		const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

		// 2. URL 입력 받기
		const url = await vscode.window.showInputBox({
			placeHolder: 'https://atcoder.jp/contests/abcXXX/tasks/abcXXX_a',
			prompt: 'AtCoder 문제 URL을 입력하세요'
		})

		if (!url) { return; } // 취소했으면 종료

		try {
			vscode.window.showInformationMessage('문제 데이터를 가져오는 중....');

			// 3. 웹페이지 HTML 가져오기 (axios)
			const response = await axios.get(url);
			const $ = cheerio.load(response.data);

			// 중복 입출력 로딩을 방지하기 위한 로직
			// 일본어 태그가 존재하면, 영어 태그 아예 삭제
			if ($('.lang-ja').length > 0) {
				$('.lang-en').remove();
			}

			// 문제 본문 영역 안에서만 찾도록 범위를 좁힘
			const targetArea = $('#task-statement');

			let inputCount = 1;
			let outputCount = 1;

			// 5. 예제 찾기 (Atcoder HTML 구조 분석)
			targetArea.find('section').each((index, element) => {
				const title = $(element).find('h3').text().trim();
				const content = $(element).find('pre').text().trim();

				// 입력 데이터 찾기 ("入力例" 또는 "Sample Input"으로 시작하는 것)
				if (title.includes('入力例') || title.includes('Sample Input')) {
					const fileName = `in_${inputCount}.txt`;
					fs.writeFileSync(path.join(rootPath, fileName), content.trim());
					inputCount++;
				}
				// 출력 데이터 찾기 ("出力例" 또는 "Sample Output"으로 시작하는 것)
				else if (title.includes('出力例') || title.includes('Sample Output')) {
					const fileName = `out_${outputCount}.txt`;
					fs.writeFileSync(path.join(rootPath, fileName), content.trim());
					outputCount++;
				}
			});

			if (inputCount == 1) {
				vscode.window.showWarningMessage('예제를 찾기 못했습니다. 로그인이 필요한 문제인지 확인해보세요.');
			} else {
				vscode.window.showInformationMessage(`성공! ${inputCount - 1}개의 입력, ${outputCount - 1}개의 출력를 저장했습니다`);
			}

		} catch (error) {
			console.error(error);
			vscode.window.showErrorMessage('에러 발생! URL이 정확한지 확인해주세요!');
		}
	});
	// 2. 파이썬 테스트 실행 명령어
	let runTestCommand_py = vscode.commands.registerCommand('atcoder-helper.runTest', async () => {

		// 현재 열려있는 파일이 파이썬 파일인지 확인
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.fileName.endsWith('.py')) {
			vscode.window.showErrorMessage('파이썬 (.py) 파일을 열고 실행해주세요!');
			return;
		}

		const pyFilePath = editor.document.fileName; // 현재 파이썬 파일 경로
		const dirPath = path.dirname(pyFilePath); // 현재 파이썬 파일이 있는 경로

		// in_*.txt 파일들을 찾음
		const files = fs.readdirSync(dirPath);
		const inputFiles = files.filter(f => f.startsWith('in_') && f.endsWith('.txt'));

		if (inputFiles.length == 0) {
			vscode.window.showErrorMessage('테스트 케이스 파일(in_*.txt)이 없습니다. 먼저 문제를 파싱해주세요!');
			return;
		}

		outputChannel.clear();
		outputChannel.show(true); // 출력 패널 보여주기
		outputChannel.appendLine(`🚀 [테스트 시작] 파일: ${path.basename(pyFilePath)}`);
		outputChannel.appendLine(`--------------------------------------------------`);

		let passCount = 0

		// 각 테스트 케이스에 대해 반복
		for (const inputFile of inputFiles) {
			// 파일 이름에서 입력 번호 추출
			const id = inputFile.match(/in_(\d+)\.txt/)?.[1];
			const outputFile = `out_${id}.txt`;

			const inputPath = path.join(dirPath, inputFile);
			const outputPath = path.join(dirPath, outputFile);

			// 정답 파일이 없으면 스킵
			if (!fs.existsSync(outputPath)) {
				outputChannel.appendLine(`⚠️ Case ${id}: 정답 파일(out_${id}.txt)이 없어 건너뜁니다.`);
				continue;
			}

			// 입력값과 정답값 읽기
			const inputData = fs.readFileSync(inputPath, 'utf-8');
			const expectedOutput = fs.readFileSync(outputPath, 'utf-8').trim();

			// 파이썬 실행 및 결과 비교
			try {
				const actualOutput = await runPython(pyFilePath, inputData);
				const trimmedOutput = actualOutput.trim();

				if (trimmedOutput == expectedOutput) {
					outputChannel.appendLine(`✅ Case ${id}: 통과!`);
					outputChannel.appendLine(`	[정답] ${expectedOutput}`);
					outputChannel.appendLine(`	[실제] ${trimmedOutput}`);
					passCount++;
				} else {
					outputChannel.appendLine(`❌ Case ${id}: 실패!`);
					outputChannel.appendLine(`	[정답] ${expectedOutput}`);
					outputChannel.appendLine(`	[실제] ${trimmedOutput}`);
				}
			} catch (error: any) {
				outputChannel.appendLine(`❌ Case ${id}: 에러 발생`);
				outputChannel.appendLine(`	${error.message}`);
			}
			outputChannel.appendLine(`--------------------------------------------------`);
		}

		if (passCount === inputFiles.length) {
			vscode.window.showInformationMessage(`🎉 모든 테스트 케이스(${passCount}개) 통과!`);
		} else {
			vscode.window.showErrorMessage(`테스트 실패: ${passCount} / ${inputFiles.length} 통과`);
		}

	})
	context.subscriptions.push(parseCommand);
	context.subscriptions.push(runTestCommand_py);
}

// --- 3. 사이드바 화면을 그려주는 클래스 ---
class AtCoderSidebarProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;

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
				case 'parseProblem':
					await this.parseProblem(data.url, data.htmlContent);
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

	// ---- 기능 2: 문제 선택 시 내용 가져오기 ----
	private async selectProblem(url: string) {
		try {
			const response = await axios.get(url);
			const $ = cheerio.load(response.data);

			// 영어 제거 로직 (중복 방지)
			if ($('.lang-ja').length > 0) { $('.lang-en').remove(); }

			// 문제 본문 가져오기
			const problemHtml = $('#task-statement').html();

			if (problemHtml) {
				// 프론트엔드에 문제 내용 전송
				this._view?.webview.postMessage({
					type: 'displayProblem',
					content: problemHtml,
					url: url // 나중에 파일 생성할 떄 쓰라고 URL도 넣어줌
				});
			} else {
				vscode.window.showErrorMessage('문제 내용을 파싱하지 못했습니다.');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`문제 상세 내용을 가져오는데 실패했습니다.`);
		}
	}

	// ---- 기능 3: 파일 생성 (기존 로직 재사용) ----
	private async parseProblem(url: string, htmlContest: string) {
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('폴더를 먼저 열어주세요!');
			return;
		}
		const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const $ = cheerio.load(htmlContest);

		let inputCount = 1;
		let outputCount = 1;

		// 예제 파싱
		$('section').each((index, element) => {
			const title = $(element).find('h3').text();
			const content = $(element).find('pre').text();

			if (title.includes('入力例') || title.includes('Sample Input')) {
				fs.writeFileSync(path.join(rootPath, `in_${inputCount}.txt`), content.trim());
				inputCount++;
			} else if (title.includes('出力例') || title.includes('Sample Output')) {
				fs.writeFileSync(path.join(rootPath, `out_${outputCount}.txt`), content.trim());
				outputCount++;
			}
		});

		// 템플릿 파일 (solve.py)이 없으면 생성
		const solvePath = path.join(rootPath, 'solve.py');
		if (!fs.existsSync(solvePath)) {
			const template = `import sys\n\n# ${url}\n\ndef solve():\n    # input = sys.stdin.read\n    # data = input().split()\n    pass\n\nif __name__ == '__main__':\n    solve()`;
			fs.writeFileSync(solvePath, template);
		}

		vscode.window.showInformationMessage(`완료! 예제 ${inputCount - 1}세트 저장됨.`);
	}

	// --- 기능 4: 테스트 실행 (기존 로직) ---
	private async runTest() {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.fileName.endsWith('.py')) {
			vscode.window.showErrorMessage('파이썬(.py) 파일을 열고 실행해주세요!');
			return;
		}

		const pyFilePath = editor.document.fileName;
		const dirPath = path.dirname(pyFilePath);
		const files = fs.readdirSync(dirPath);
		const inputFiles = files.filter(f => f.startsWith('in_') && f.endsWith('.txt'));

		outputChannel.clear();
		outputChannel.show(true);
		outputChannel.appendLine(`🚀 Testing: ${path.basename(pyFilePath)}`);
		outputChannel.appendLine(`-----------------------------------------`);
		let passCount = 0;
		for (const inputFile of inputFiles) {
			const id = inputFile.match(/in_(\d+)\.txt/)?.[1];
			const outputFile = `out_${id}.txt`;

			if (!fs.existsSync(path.join(dirPath, outputFile))) continue;

			const inputData = fs.readFileSync(path.join(dirPath, inputFile), 'utf-8');
			const expected = fs.readFileSync(path.join(dirPath, outputFile), 'utf-8').trim();

			try {
				const actual = (await this.runPython(pyFilePath, inputData)).trim();
				if (actual === expected) {
					outputChannel.appendLine(`✅ Case ${id}: 통과!`);
					outputChannel.appendLine(`	[정답] ${expected}`);
					outputChannel.appendLine(`	[실제] ${actual}`);
					outputChannel.appendLine(`-----------------------------------------`);
					passCount++;
				} else {
					outputChannel.appendLine(`❌ Case ${id}: 실패!`);
					outputChannel.appendLine(`	[정답] ${expected}`);
					outputChannel.appendLine(`	[실제] ${actual}`);
					outputChannel.appendLine(`-----------------------------------------`);
				}
			} catch (err: any) {
				outputChannel.appendLine(`❌ Case ${id}: 에러 발생`);
				outputChannel.appendLine(`	${err.message}`);
			}
		}
		outputChannel.appendLine(`✅ 정답 갯수 : 총 문제 ${inputFiles.length}개 중 ${passCount}개 정답`);
		outputChannel.appendLine(`	정답률 : ${passCount / inputFiles.length * 100}%`);
		outputChannel.appendLine(`-----------------------------------------`);
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
	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AtCoder Helper</title>
            <style>
                body { padding: 10px; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px; }
                
                /* 검색 영역 */
                .search-box { display: flex; gap: 5px; }
                input { flex: 1; padding: 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
                button:hover { background: var(--vscode-button-hoverBackground); }
                
                /* 문제 목록 (A, B, C 버튼) */
                #taskList { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
                .task-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); cursor: pointer; }
                .task-btn:hover { background: var(--vscode-list-hoverBackground); }
                .task-btn.active { background: var(--vscode-button-background); color: white; }

                /* 문제 뷰어 (웹뷰 영역) */
                #problemView { 
                    flex: 1; 
                    min-height: 200px; 
                    max-height: 400px;
                    overflow-y: auto; 
                    background: var(--vscode-editor-background); 
                    border: 1px solid var(--vscode-widget-border); 
                    padding: 10px;
                    font-size: 0.9em;
                }
                /* AtCoder HTML 스타일 대략 맞추기 */
                #problemView h3 { font-size: 1.1em; margin-top: 10px; border-bottom: 1px solid #555; }
                #problemView pre { background: #333; color: #fff; padding: 5px; overflow-x: auto; }

                /* 하단 액션 버튼 */
                .actions { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
                .action-btn { width: 100%; padding: 8px; font-weight: bold; }
                .btn-green { background-color: #28a745; }
                .btn-blue { background-color: #007acc; }
            </style>
        </head>
        <body>
            <div class="search-box">
                <span style="line-height:28px;">ABC</span>
                <input type="text" id="contestId" placeholder="386" />
                <button id="searchBtn">조회</button>
            </div>

            <div id="taskList"></div>

            <div id="problemView">
                <p style="color: #888; text-align: center;">문제를 선택하면 여기에 내용이 표시됩니다.</p>
            </div>

            <div class="actions">
                <button id="parseBtn" class="action-btn btn-green" disabled>📂 예제 파일 생성</button>
                <button id="testBtn" class="action-btn btn-blue">▶️ 테스트 실행</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                // 상태 변수
                let currentProblemUrl = null;
                let currentHtmlContent = null;

                // 1. 조회 버튼 클릭
                document.getElementById('searchBtn').addEventListener('click', () => {
                    const id = document.getElementById('contestId').value;
                    if(id) {
                        vscode.postMessage({ command: 'loadContest', contestId: id });
                    }
                });

                // 2. 파일 생성 버튼 클릭
                document.getElementById('parseBtn').addEventListener('click', () => {
                    if(currentProblemUrl && currentHtmlContent) {
                        vscode.postMessage({ 
                            command: 'parseProblem', 
                            url: currentProblemUrl,
                            htmlContent: currentHtmlContent
                        });
                    }
                });

                // 3. 테스트 실행 버튼 클릭
                document.getElementById('testBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'runTest' });
                });

                // 익스텐션에서 온 메시지 받기
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.type) {
                        case 'updateTaskList':
                            const listDiv = document.getElementById('taskList');
                            listDiv.innerHTML = ''; // 초기화
                            message.tasks.forEach(task => {
                                const btn = document.createElement('div');
                                btn.className = 'task-btn';
                                btn.innerText = task.label;
                                btn.onclick = () => {
                                    // 문제 선택 요청
                                    vscode.postMessage({ command: 'selectProblem', url: task.url });
                                    // 버튼 스타일 활성화
                                    document.querySelectorAll('.task-btn').forEach(b => b.classList.remove('active'));
                                    btn.classList.add('active');
                                    
                                    // 로딩 표시
                                    document.getElementById('problemView').innerHTML = '<p>불러오는 중...</p>';
                                };
                                listDiv.appendChild(btn);
                            });
                            break;

                        case 'displayProblem':
                            const viewDiv = document.getElementById('problemView');
                            viewDiv.innerHTML = message.content; // HTML 삽입
                            
                            // 상태 업데이트
                            currentProblemUrl = message.url;
                            currentHtmlContent = message.content;
                            document.getElementById('parseBtn').disabled = false; // 버튼 활성화
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
	}
}

// 파이썬 코드를 실행시키는 도우미 함수 (Promise 사용)
function runPython(scriptPath: string, input: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

		const processObj = cp.spawn(pythonCommand, [scriptPath]);

		let stdoutData = '';
		let stderrData = '';

		// 프로세스에 입력값 넣기
		processObj.stdin.write(input);
		processObj.stdin.end();

		// 출력값 받기
		processObj.stdout.on('data', (data) => {
			stdoutData += data.toString();
		});

		// 에러값 받기
		processObj.stderr.on('data', (data) => {
			stderrData += data.toString();
		});

		// 실행 종료 시 처리
		processObj.on('close', (code) => {
			if (code == 0) {
				resolve(stdoutData);
			} else {
				reject(new Error(stderrData || 'Runtime Error'));
			}
		});

		// 실행 자체가 실패했을 때 (예: python 명령어가 없을 때)
		processObj.on('error', (err) => {
			reject(err);
		});
	});
}

export function deactivate() { }