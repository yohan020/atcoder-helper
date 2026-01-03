
# 💻 AtCoder Helper

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.104%2B-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

> アルゴリズム問題サイト [AtCoder](https://atcoder.jp/) での問題解決をより簡単にする VS Code 拡張機能

## 📸 スクリーンショット

<img width="322" height="613" alt="AtCoder Helper Screenshot" src="https://github.com/user-attachments/assets/09b42bc5-d5f7-4a85-8b8a-93ae318d31fe" />

## ✨ 主な機能

- 🔍 **問題検索** - AtCoder Daily Training、AtCoder Beginner Contest の問題検索
- ▶️ **ワンクリックテスト** - ボタン一つで全てのサンプルケースを実行し、正解・不正解を確認
- 🌐 **自動翻訳** - 問題文の韓国語自動翻訳（ChatGPT、Gemini API 対応）
- 📝 **多言語対応** - 様々なプログラミング言語で問題解決可能

## 🗣️ 対応言語

| 言語 | 拡張子 |
|------|--------|
| Python | `.py` |
| C | `.c` |
| C++ | `.cpp` |
| Java | `.java` |
| JavaScript | `.js` |
| TypeScript | `.ts` |
| Go | `.go` |
| Rust | `.rs` |

## 📦 インストール方法

> ⚠️ 現在 AtCoder 側に問い合わせ中です。問題がなければ正式リリース予定です。

## 📖 使い方

### 問題検索とテスト実行

| コンテスト種類 | 検索方法 |
|--------------|----------|
| AtCoder Daily Training (ADT) | 難易度、日付、回数を入力 |
| AtCoder Beginner Contest (ABC) | コンテスト番号3桁を入力（例：123）|

- **テスト実行**ボタンで問題の全サンプルケースを一括テスト
- テストケースごとの最大実行時間：10秒（設定で変更可能）

### 問題言語の変更

1. 問題選択時、右上の言語変更ドロップダウンメニューを使用
2. 翻訳オプション：
   - **AI翻訳**（高品質）：ChatGPT または Gemini API キーの設定が必要
   - **Google翻訳**（デフォルト）：APIキー不要で利用可能

### solve ファイル作成

1. 希望のプログラミング言語を選択
2. **📄 ファイル作成/開く**ボタンをクリック
3. テンプレート付きの `solve.{拡張子}` ファイルが自動生成

## ⚙️ 設定

VS Code 設定ページ、またはサイドバーの **⚙️ 設定** ボタンからアクセスできます。

| 設定項目 | 説明 |
|----------|------|
| UI言語 | 拡張機能の表示言語（韓国語/英語/日本語）|
| 翻訳モデル | AI翻訳に使用するモデル選択（Gemini/ChatGPT）|
| APIキー | Gemini または OpenAI API キー入力 |
| タイムアウト | テストケースごとの最大実行時間（1-60秒）|

## 💻 動作環境

- **VS Code** 1.104.0 以上
- Windows 環境推奨

> ⚠️ macOS および Linux は追加テストが必要です。

## 🐛 既知の問題

- macOS/Linux 環境テスト進行中
- 一部の特殊文字を含む問題でパースエラーの可能性あり

## 🤝 コントリビュート

1. このリポジトリを Fork します
2. 新しいブランチを作成します（`git checkout -b feature/新機能`）
3. 変更をコミットします（`git commit -m 'Add: 新機能追加'`）
4. ブランチに Push します（`git push origin feature/新機能`）
5. Pull Request を作成します

## 👤 作成者

- GitHub: [@yohan020](https://github.com/yohan020)

## 📄 ライセンス

このプロジェクトは [MIT ライセンス](LICENSE) の下で公開されています。
