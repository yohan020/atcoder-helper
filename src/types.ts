// 예제 데이터 타입
export interface SampleData {
    input: string;
    output: string;
    id: number;
}

// 문제 본문 저장용 (언어별)
export interface ProblemContent {
    ja: string; // 일본어 원문
    en: string; // 영어 원문
    ko?: string; // 한국어 번역본
}

// 문제 목록 아이템
export interface TaskData {
    label: string;
    url: string;
}
