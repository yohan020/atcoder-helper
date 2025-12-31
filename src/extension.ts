import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as cp from "child_process";
import { translate } from 'google-translate-api-x'; // 번역 라이브러리

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

interface ProblemContent {
	ja: string; // 일본어 원문
	en: string; // 영어 원문
	ko?: string; // 한국어 번역본
}

interface TaskData {
	label: string;
	url: string;
}

class AtCoderSidebarProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;

	// 💾 상태 저장소
	private _currentSamples: SampleData[] = [];
	private _currentProblemUrl: string = '';
	private _currentTasks: TaskData[] = []; // 현재 조회된 문제 목록 저장

	// 🌐 언어별 문제 본문 저장 (매 문제마다 초기화)
	private _currentContent: ProblemContent = { ja: '', en: '' };

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
				case 'changeProblemLanguage':
					await this.changeProblemDisplayLang(data.lang);
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

	// ---- 기능 2: 문제 선택 및 데이터 파싱 (일본어/영어 분리 저장)----
	private async selectProblem(url: string) {
		const t = getLocalizedMessages();
		try {
			const response = await axios.get(url);
			const $ = cheerio.load(response.data);

			// 1. 문제 본문 파싱 (언어별 분리)
			const taskStatement = $('#task-statement');

			// 초기화
			this._currentContent = { ja: '', en: '' };
			this._currentProblemUrl = url;

			// AtCoder는 보통 span.lang-ja / span.lang-en으로 구분
			const langJa = taskStatement.find('.lang-ja').html();
			const langEn = taskStatement.find('.lang-en').html();

			if (langJa && langEn) {
				// 신규 문제 포맷 (다국어 지원)
				this._currentContent = { ja: langJa, en: langEn };
			} else {
				// 구형 문제 포맷 (구분없음, 그냥 통쨰로 저장)
				const raw = taskStatement.html() || '';
				this._currentContent = { ja: raw, en: raw }; // 기본을 일본어로 취급, 영어도 똑같이 저장
			}

			// 2. 예제 입출력 파싱
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

			// 3. 화면에 전송 (기본값 : 일본어)
			this._view?.webview.postMessage({
				type: 'displayProblem',
				content: this._currentContent.ja,
				sampleCount: this._currentSamples.length,
				enableLanguageSelect: true // 언어 선택창 활성화
			});
		} catch (error) {
			vscode.window.showErrorMessage(t.detailError);
		}
	}

	// 🔄 [중요] 문제 표시 언어 변경 로직 (cheerio DOM 순회 방식)
	private async changeProblemDisplayLang(lang: string) {
		if (!this._currentContent.ja) return;

		let contentToShow = '';

		if (lang === 'ja') {
			contentToShow = this._currentContent.ja;
		} else if (lang === 'en') {
			contentToShow = this._currentContent.en;
		} else if (lang === 'ko') {
			if (this._currentContent.ko) {
				contentToShow = this._currentContent.ko;
			} else {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "한국어로 번역 중입니다... (1분 정도 소요)",
					cancellable: false
				}, async () => {
					try {
						// cheerio로 HTML 파싱
						const $ = cheerio.load(this._currentContent.ja);

						// 번역하지 않을 태그들 (수식, 코드 등)
						const skipTags = new Set(['var', 'code', 'pre', 'script', 'style']);

						// 텍스트 노드만 수집
						const textNodes: { node: any; text: string }[] = [];

						const collectTextNodes = (element: any) => {
							$(element).contents().each((_, child) => {
								if (child.type === 'text') {
									const text = $(child).text().trim();
									if (text.length > 0) {
										textNodes.push({ node: child, text: text });
									}
								} else if (child.type === 'tag') {
									// skipTags에 해당하는 태그는 내부 순회 안함
									if (!skipTags.has(child.name.toLowerCase())) {
										collectTextNodes(child);
									}
								}
							});
						};

						// body 또는 root에서 시작
						collectTextNodes($.root());

						// 각 텍스트 노드를 개별적으로 번역
						for (const item of textNodes) {
							try {
								const result = await translate(item.text, { to: 'ko' });
								const translatedText = result.text;

								// 원본 공백 유지를 위해 앞뒤 공백 보존
								const originalFull = $(item.node).text();
								const leadingSpace = originalFull.match(/^\s*/)?.[0] || '';
								const trailingSpace = originalFull.match(/\s*$/)?.[0] || '';
								$(item.node).replaceWith(leadingSpace + translatedText.trim() + trailingSpace);
							} catch {
								// 개별 번역 실패 시 원문 유지
							}
						}

						const translatedHtml = $.html();
						this._currentContent.ko = translatedHtml;
						contentToShow = translatedHtml;

					} catch (e) {
						vscode.window.showErrorMessage('번역 실패! 원문을 표시합니다.');
						contentToShow = this._currentContent.ja;
					}

					// 번역 완료 후 웹뷰 업데이트
					this._view?.webview.postMessage({
						type: 'updateProblemContent',
						content: contentToShow
					});
				});
				return; // withProgress 안에서 처리하므로 여기서 리턴
			}
		}

		// ko가 아니거나 캐시된 ko가 있을 경우 바로 업데이트
		this._view?.webview.postMessage({
			type: 'updateProblemContent',
			content: contentToShow
		});
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

	private _getHtmlForWebview(webview: vscode.Webview) {
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
                
                /* ✨ 헤더: 기본 상태는 숨김(display: none) 처리 */
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

                // 문제 언어 변경 이벤트 리스너 (JA/EN/KO)
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
                                    
                                    // ✨ 문제 선택 시: 1. 언어 선택창 보이기 2. 값은 일본어로 리셋
                                    document.getElementById('problemHeader').style.display = 'flex';
                                    document.getElementById('problemLangSelect').value = 'ja';
                                };
                                listDiv.appendChild(btn);
                            });
                            
                            // 새 대회 로드 시, 문제 보는 창의 언어 선택은 다시 숨김
                            document.getElementById('problemHeader').style.display = 'none';
                            document.getElementById('problemView').innerHTML = '<p style="color: #888; text-align: center;">${t.ui_selectProblemPrompt}</p>';
                            break;

                        case 'displayProblem':
                            // 문제 내용 렌더링
                            document.getElementById('problemView').innerHTML = message.content;
                            
                            // 문제 선택창 확실하게 표시
                            document.getElementById('problemHeader').style.display = 'flex';

                            const testBtn = document.getElementById('testBtn');
                            testBtn.disabled = false;
                            testBtn.innerText = message.btnText + ' (' + message.sampleCount + ')';
                            
                            document.getElementById('openWebBtn').style.display = 'block';
                            break;

                        case 'updateProblemContent':
                            // ✨ 언어 변경 시, 본문 내용만 갈아끼우기 (갱신 로직)
                            document.getElementById('problemView').innerHTML = message.content;
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
			const t = getLocalizedMessages();
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);

			// 데이터 복구
			if (this._currentTasks.length > 0) {
				this._view.webview.postMessage({ type: 'updateTaskList', tasks: this._currentTasks });
			}
			if (this._currentContent.ja) {
				this._view.webview.postMessage({
					type: 'displayProblem',
					content: this._currentContent.ja, // 기본 리셋
					sampleCount: this._currentSamples.length,
					btnText: t.ui_testBtnRunning
				});
			}
		}
	}
}

export function deactivate() { }