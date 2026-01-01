import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// 분리된 모듈 import
import { SampleData, ProblemContent, TaskData } from './types';
import { translateWithGemini, translateWithGoogle, translateWithChatGPT } from './translator';
import { runPython, compileCode, runExecutable } from './compiler';
import { getHtmlForWebview } from './webview';
import { getLocalizedMessages } from './locale';

const outputChannel = vscode.window.createOutputChannel('AtCoder Helper');

export function activate(context: vscode.ExtensionContext) {
	const provider = new AtCoderSidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('atcoder.sidebar', provider)
	);

	// 언어 설정이 바뀌면 웹뷰를 새로고침
	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('atcoder-helper.language')) {
			provider.refresh();
		}
	});
}

class AtCoderSidebarProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _currentSamples: SampleData[] = [];
	private _currentProblemUrl: string = '';
	private _currentTasks: TaskData[] = [];
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

		webviewView.webview.html = getHtmlForWebview();

		webviewView.webview.onDidReceiveMessage(async (data) => {
			const t = getLocalizedMessages();

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

			const tasks: TaskData[] = [];
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
			this._currentTasks = tasks;
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

			const taskStatement = $('#task-statement');
			this._currentContent = { ja: '', en: '' };
			this._currentProblemUrl = url;

			const langJa = taskStatement.find('.lang-ja').html();
			const langEn = taskStatement.find('.lang-en').html();

			if (langJa && langEn) {
				this._currentContent = { ja: langJa, en: langEn };
			} else {
				const raw = taskStatement.html() || '';
				this._currentContent = { ja: raw, en: raw };
			}

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

			this._view?.webview.postMessage({
				type: 'displayProblem',
				content: this._currentContent.ja,
				sampleCount: this._currentSamples.length,
				btnText: t.ui_testBtn,
				enableLanguageSelect: true
			});
		} catch (error) {
			vscode.window.showErrorMessage(t.detailError);
		}
	}

	// ---- 기능 3: 문제 표시 언어 변경 ----
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
				// 별도 메소드로 분리된 번역 로직 호출
				await this.translateToKorean();
				return;
			}
		}

		this._view?.webview.postMessage({
			type: 'updateProblemContent',
			content: contentToShow
		});
	}

	// ---- 기능 3-1: 한국어 번역 수행 ----
	private async translateToKorean(): Promise<void> {
		const config = vscode.workspace.getConfiguration('atcoder-helper');
		const translationModel = config.get<string>('translationModel') || 'gemini';
		const geminiApiKey = config.get<string>('geminiApiKey') || '';
		const openaiApiKey = config.get<string>('openaiApiKey') || '';

		// 선택된 모델에 맞는 API키 확인
		let useAI = false;
		let selectedApiKey = '';
		let modelName = '';

		if (translationModel === "Gemini (Google AI)" && geminiApiKey.trim() !== '') {
			useAI = true;
			selectedApiKey = geminiApiKey;
			modelName = 'Gemini';
		} else if (translationModel === "ChatGPT (OpenAI)" && openaiApiKey.trim() !== '') {
			useAI = true;
			selectedApiKey = openaiApiKey;
			modelName = 'ChatGPT';
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: useAI ? `${modelName}로 번역 중...` : "한국어로 번역 중... (1분 정도 소요)",
			cancellable: false
		}, async () => {
			let contentToShow = '';
			try {
				let translatedHtml = '';
				if (useAI) {
					// AI 번역 시도
					if (modelName === 'Gemini') {
						translatedHtml = await translateWithGemini(this._currentContent.ja, selectedApiKey);
					} else {
						translatedHtml = await translateWithChatGPT(this._currentContent.ja, selectedApiKey);
					}
				} else {
					// Google Translate 사용
					translatedHtml = await translateWithGoogle(this._currentContent.ja);
				}
				this._currentContent.ko = translatedHtml;
				contentToShow = translatedHtml;
			} catch (e: any) {
				if (useAI) {
					// AI 실패 시 Google Translate로 폴백
					vscode.window.showWarningMessage(`${modelName} 실패, Google Translate로 전환 중...`);
					try {
						const translatedHtml = await translateWithGoogle(this._currentContent.ja);
						this._currentContent.ko = translatedHtml;
						contentToShow = translatedHtml;
					} catch {
						vscode.window.showErrorMessage('번역 실패! 원문을 표시합니다.');
						contentToShow = this._currentContent.ja;
					}
				} else {
					vscode.window.showErrorMessage('번역 실패! 원문을 표시합니다.');
					contentToShow = this._currentContent.ja;
				}
			}
			this._view?.webview.postMessage({
				type: 'updateProblemContent',
				content: contentToShow
			});
		});
	}
	// ---- 기능 4: 소스 코드 파일 생성 ----
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

	// ---- 기능 5: 테스트 실행 ----
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
				executablePath = await compileCode(filePath, ext);
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
					actualOutput = (await runExecutable(executablePath, sample.input)).trim();
				} else if (ext === '.py') {
					actualOutput = (await runPython(filePath, sample.input)).trim();
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
			outputChannel.appendLine(`✅ ${t.resultSummary} : ${this._currentSamples.length} / ${passCount}`);
			outputChannel.appendLine(`  ${t.resultRatio} : ${ratio}%`);
		}
		outputChannel.appendLine(`-----------------------------------------`);
	}

	// 언어 설정 변경 감지시 강제로 다시 그리는 함수
	public refresh() {
		if (this._view) {
			const t = getLocalizedMessages();
			this._view.webview.html = getHtmlForWebview();

			if (this._currentTasks.length > 0) {
				this._view.webview.postMessage({ type: 'updateTaskList', tasks: this._currentTasks });
			}
			if (this._currentContent.ja) {
				this._view.webview.postMessage({
					type: 'displayProblem',
					content: this._currentContent.ja,
					sampleCount: this._currentSamples.length,
					btnText: t.ui_testBtnRunning
				});
			}
		}
	}
}

export function deactivate() { }