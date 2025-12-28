import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

export function activate(context: vscode.ExtensionContext) {

	// 명령어 등록
	let disposable = vscode.commands.registerCommand('atcoder-helper.createFile', async () => {

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

			// 4. 일본어(lang-ja) 영역만 선택 (중복 방지)
			let targetArea = $('lang-ja');
			if (targetArea.length == 0) { targetArea = $('body'); }

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

	context.subscriptions.push(disposable);
}

export function deactivate() { }