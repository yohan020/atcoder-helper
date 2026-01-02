# 💻 AtCoder Helper

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.104%2B-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

> 일본을 포함한 외국에서 주로 사용하는 알고리즘 문제 풀이 사이트 [AtCoder](https://atcoder.jp/)에서 좀 더 문제를 풀기 쉽게 도와주는 VS Code 확장 프로그램 </br>
> [Japanese README](https://github.com/yohan020/atcoder-helper/blob/main/README_JP.md)
## 📸 스크린샷

<img width="322" height="613" alt="AtCoder Helper Screenshot" src="https://github.com/user-attachments/assets/09b42bc5-d5f7-4a85-8b8a-93ae318d31fe" />

## ✨ 주요 기능

- 🔍 **문제 검색** - AtCoder Daily Training, AtCoder Beginner Contest 문제 검색
- ▶️ **원클릭 테스트** - 버튼 한 번으로 모든 예제를 실행하여 정답 여부 확인
- 🌐 **자동 번역** - 알고리즘 문제 한국어 자동 번역 (ChatGPT, Gemini API 지원)
- 📝 **다양한 언어 지원** - 여러 프로그래밍 언어로 문제 풀이 가능

## 🗣️ 지원 언어

| 언어 | 확장자 |
|------|--------|
| Python | `.py` |
| C | `.c` |
| C++ | `.cpp` |
| Java | `.java` |
| JavaScript | `.js` |
| TypeScript | `.ts` |
| Go | `.go` |
| Rust | `.rs` |

## 📦 설치 방법

> ⚠️ 현재 AtCoder 측에 문의를 한 상태이며, 문제가 없을 경우 정식 배포할 예정입니다.

## 📖 사용 방법

### 문제 검색 및 테스트 실행

| 대회 유형 | 검색 방법 |
|----------|----------|
| AtCoder Daily Training (ADT) | 난이도, 날짜, 대회번호 입력 |
| AtCoder Beginner Contest (ABC) | 대회 번호 3자리 입력 (예: 123) |

- **테스트 실행** 버튼으로 문제의 모든 예제를 한 번에 테스트
- 테스트 케이스별 최대 실행 시간: 10초 (설정에서 변경 가능)

### 문제 언어 변경

1. 문제 선택 시 오른쪽 상단의 언어 변경 드롭다운 메뉴 사용
2. 번역 옵션:
   - **AI 번역** (고품질): ChatGPT 또는 Gemini API 키 설정 필요
   - **Google 번역** (기본): API 키 없이도 사용 가능

### solve 파일 생성

1. 원하는 프로그래밍 언어 선택
2. **📄 파일 열기/생성** 버튼 클릭
3. 자동으로 템플릿이 포함된 `solve.{확장자}` 파일 생성

## ⚙️ 설정

VS Code 설정 페이지 또는 사이드바의 **⚙️ 설정** 버튼을 통해 접근할 수 있습니다.

| 설정 항목 | 설명 |
|----------|------|
| UI 언어 | 확장 프로그램 표시 언어 (한국어/영어/일본어) |
| 번역 모델 | AI 번역에 사용할 모델 선택 (Gemini/ChatGPT) |
| API 키 | Gemini 또는 OpenAI API 키 입력 |
| 타임아웃 | 테스트 케이스별 최대 실행 시간 (1-60초) |

## 💻 요구 사항

- **VS Code** 1.104.0 이상
- Windows 환경 권장

> ⚠️ macOS 및 Linux는 추가 테스트가 필요합니다.

## 🐛 알려진 이슈

- macOS/Linux 환경 테스트 진행 중
- 일부 특수 문자가 포함된 문제에서 파싱 오류 가능성

## 👤 작성자

- GitHub: [@yohan020](https://github.com/yohan020)

## 📄 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)를 따릅니다.
