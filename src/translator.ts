import * as cheerio from 'cheerio';
import { translate } from 'google-translate-api-x';

/**
 * 🤖 Gemini API를 사용한 번역 함수
 * - HTML 구조를 유지하면서 한국어로 번역
 * - 무료 티어: 분당 15회, 일일 1,500회 제한
 * 
 * @param htmlContent 번역할 HTML 콘텐츠
 * @param apiKey Google AI Studio에서 발급받은 Gemini API 키
 * @returns 번역된 HTML 문자열
 */
export async function translateWithGemini(htmlContent: string, apiKey: string): Promise<string> {
    // 1. API 키 유효성 검사 - 빈 값이면 에러 발생
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('API 키가 비어있습니다.');
    }

    // 2. Gemini API 엔드포인트 URL 구성
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // 3. 번역 프롬프트 작성 - HTML 구조 유지 및 코드/수식 보호 규칙 포함
    const prompt = `다음 HTML을 한국어로 번역해주세요. 
규칙:
1. HTML 태그 구조는 절대 변경하지 마세요
2. <var>, <code>, <pre> 태그 내부의 내용은 번역하지 마세요 (변수명, 코드)
3. 수학적 표현과 숫자는 그대로 유지하세요
4. 자연스러운 한국어로 번역하세요
5. 번역 결과만 출력하고, 설명은 추가하지 마세요

HTML:
${htmlContent}`;

    // 4. Gemini API 호출
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,        // 낮은 온도 = 더 일관된 번역
                maxOutputTokens: 8192    // 최대 출력 토큰 수
            }
        })
    });

    // 5. 응답 상태 확인 - 실패 시 상세 오류 메시지 포함
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }

    // 6. 응답 JSON 파싱 및 타입 지정
    const data = await response.json() as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: string }>
            }
        }>
    };

    // 7. 번역 결과 추출 - 첫 번째 후보의 첫 번째 파트에서 텍스트 가져오기
    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!translatedText) {
        throw new Error('No translation result from Gemini');
    }

    return translatedText;
}

/**
 * 📝 Google Translate를 사용한 번역 함수 (무료, API 키 불필요)
 * - cheerio로 DOM을 순회하며 텍스트 노드만 개별 번역
 * - 장점: 무료, 안정적
 * - 단점: 느림 (각 텍스트 노드별로 API 호출), 문맥 손실
 * 
 * @param htmlContent 번역할 HTML 콘텐츠
 * @returns 번역된 HTML 문자열
 */
export async function translateWithGoogle(htmlContent: string): Promise<string> {
    // 1. cheerio로 HTML 파싱
    const $ = cheerio.load(htmlContent);

    // 2. 번역하지 않을 태그 목록 (변수명, 코드, 스크립트 등)
    const skipTags = new Set(['var', 'code', 'pre', 'script', 'style']);

    // 3. 번역할 텍스트 노드 수집용 배열
    const textNodes: { node: any; text: string }[] = [];

    // 4. 재귀적으로 DOM을 순회하며 텍스트 노드 수집
    const collectTextNodes = (element: any) => {
        $(element).contents().each((_, child) => {
            if (child.type === 'text') {
                // 텍스트 노드인 경우 수집
                const text = $(child).text().trim();
                if (text.length > 0) {
                    textNodes.push({ node: child, text: text });
                }
            } else if (child.type === 'tag') {
                // 태그인 경우, skipTags에 없으면 내부 순회
                if (!skipTags.has(child.name.toLowerCase())) {
                    collectTextNodes(child);
                }
            }
        });
    };

    // 5. 루트부터 순회 시작
    collectTextNodes($.root());

    // 6. 각 텍스트 노드를 개별적으로 번역
    for (const item of textNodes) {
        try {
            // Google Translate API 호출
            const result = await translate(item.text, { to: 'ko' });
            const translatedText = result.text;

            // 원본 공백 유지 (앞뒤 공백 보존)
            const originalFull = $(item.node).text();
            const leadingSpace = originalFull.match(/^\s*/)?.[0] || '';
            const trailingSpace = originalFull.match(/\s*$/)?.[0] || '';

            // 번역된 텍스트로 교체
            $(item.node).replaceWith(leadingSpace + translatedText.trim() + trailingSpace);
        } catch {
            // 개별 번역 실패 시 원문 유지 (에러 무시)
        }
    }

    // 7. 번역 완료된 HTML 반환
    return $.html();
}
