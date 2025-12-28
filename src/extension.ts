import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as cp from "child_process";

// 결과를 출력할 채널 생성 (터미널 탭 옆 '출력' 탭에 표시됨)
const outputChannel = vscode.window.createOutputChannel('AtCoder Helper');

export function activate(context: vscode.ExtensionContext) {

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