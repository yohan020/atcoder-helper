import * as vscode from 'vscode';

export interface LocaleMessages {
    // 알림 및 에러 메시지
    folderError: string;
    contestNotFound: string;
    fetchError: string;
    detailError: string;
    fileCreated: string;
    fileOpenError: string;
    noEditorError: string;
    noDataError: string;
    unsupportedFile: string;
    compilerCmdEmpty: string;
    selectProblemFirst: string;

    // 출력 로그 (Output Channel)
    testingStart: string;
    compiling: string;
    compileSuccess: string;
    compileFail: string;
    casePass: string;
    caseFail: string;
    caseError: string;
    expected: string;
    actual: string;
    allPass: string;
    resultSummary: string;
    resultRatio: string;

    // UI (HTML)
    ui_searchPlaceholder: string;
    ui_searchBtn: string;
    ui_selectProblemPrompt: string;
    ui_loading: string;
    ui_createBtn: string;
    ui_testBtn: string;
    ui_webBtn: string;
    ui_testBtnRunning: string; // 테스트 실행 중 텍스트
}

const MESSAGES: { [key: string]: LocaleMessages } = {
    ko: {
        folderError: '폴더를 먼저 열어주세요!',
        contestNotFound: '문제를 찾을 수 없습니다. 대회 번호를 확인하세요.',
        fetchError: '대회 정보를 가져오는데 실패했습니다',
        detailError: '문제 상세 내용을 가져오는데 실패했습니다.',
        fileCreated: '파일이 생성되었습니다.',
        fileOpenError: '파일을 여는 도중 오류가 발생했습니다.',
        noEditorError: '코드를 작성한 파일을 열고 실행해주세요!',
        noDataError: '테스트할 예제 데이터가 없습니다. 목록에서 문제를 다시 선택해주세요.',
        unsupportedFile: '지원하지 않는 파일 형식입니다. (.py, .c, .cpp 만 지원)',
        compilerCmdEmpty: '컴파일러 명령어(cmd)가 비어있습니다.',
        selectProblemFirst: '먼저 문제를 선택해주세요.',

        testingStart: '테스트 시작',
        compiling: '컴파일 중...',
        compileSuccess: '컴파일 성공!',
        compileFail: '컴파일 실패',
        casePass: '통과!',
        caseFail: '실패!',
        caseError: '에러 발생',
        expected: '정답',
        actual: '실제',
        allPass: '모든 테스트 통과! 🎉',
        resultSummary: '정답 갯수',
        resultRatio: '정답률',

        ui_searchPlaceholder: '386',
        ui_searchBtn: '조회',
        ui_selectProblemPrompt: '문제를 선택하세요.',
        ui_loading: '불러오는 중...',
        ui_createBtn: '📄 파일 열기/생성',
        ui_testBtn: '▶️ 테스트 실행',
        ui_webBtn: '🌐 웹사이트에서 보기 (Original)',
        ui_testBtnRunning: '▶️ 테스트 실행'
    },
    en: {
        folderError: 'Please open a folder first!',
        contestNotFound: 'Tasks not found. Please check the contest ID.',
        fetchError: 'Failed to fetch contest information',
        detailError: 'Failed to fetch problem details.',
        fileCreated: 'File created successfully.',
        fileOpenError: 'Error opening file.',
        noEditorError: 'Please open a source code file to run!',
        noDataError: 'No test data found. Please select a problem again.',
        unsupportedFile: 'Unsupported file type. (Only .py, .c, .cpp)',
        compilerCmdEmpty: 'Compiler command is empty.',
        selectProblemFirst: 'Please select a problem first.',

        testingStart: 'Testing',
        compiling: 'Compiling...',
        compileSuccess: 'Compilation Successful!',
        compileFail: 'Compilation Failed',
        casePass: 'Passed!',
        caseFail: 'Failed!',
        caseError: 'Error',
        expected: 'Expected',
        actual: 'Actual',
        allPass: 'All tests passed! 🎉',
        resultSummary: 'Correct Answers',
        resultRatio: 'Accuracy',

        ui_searchPlaceholder: '386',
        ui_searchBtn: 'Search',
        ui_selectProblemPrompt: 'Select a problem.',
        ui_loading: 'Loading...',
        ui_createBtn: '📄 Open/Create File',
        ui_testBtn: '▶️ Run Test',
        ui_webBtn: '🌐 Open Website (Original)',
        ui_testBtnRunning: '▶️ Run Test'
    },
    ja: {
        folderError: 'フォルダを開いてください！',
        contestNotFound: '問題が見つかりません。コンテストIDを確認してください。',
        fetchError: 'コンテスト情報の取得に失敗しました',
        detailError: '問題詳細の取得に失敗しました。',
        fileCreated: 'ファイルが作成されました。',
        fileOpenError: 'ファイルを開く際にエラーが発生しました。',
        noEditorError: 'ソースコードファイルを開いてから実行してください！',
        noDataError: 'テストデータがありません。問題を再選択してください。',
        unsupportedFile: 'サポートされていないファイル形式です。(.py, .c, .cpp のみ)',
        compilerCmdEmpty: 'コンパイラコマンドが空です。',
        selectProblemFirst: '先に問題を選択してください。',

        testingStart: 'テスト開始',
        compiling: 'コンパイル中...',
        compileSuccess: 'コンパイル成功！',
        compileFail: 'コンパイル失敗',
        casePass: '正解！',
        caseFail: '不正解！',
        caseError: 'エラー発生',
        expected: '正解',
        actual: '出力',
        allPass: '全テスト通過！ 🎉',
        resultSummary: '正解数',
        resultRatio: '正解率',

        ui_searchPlaceholder: '386',
        ui_searchBtn: '検索',
        ui_selectProblemPrompt: '問題を選択してください。',
        ui_loading: '読み込み中...',
        ui_createBtn: '📄 ファイル作成/開く',
        ui_testBtn: '▶️ テスト実行',
        ui_webBtn: '🌐 Webサイトで見る',
        ui_testBtnRunning: '▶️ テスト実行'
    }
};

export function getLocalizedMessages(): LocaleMessages {
    const config = vscode.workspace.getConfiguration('atcoder-helper');
    const lang = config.get<string>('language') || 'ko';
    return MESSAGES[lang] || MESSAGES['ko'];
}