# VeilFrame Lite

iOS 26上で、動画をサーバーへ送信せず端末内だけで編集・変換するVeilFrameの軽量版です。

## 実証対象

- HEVC / MP4 / MOVの読込と再生
- 動画情報表示
- 90度単位の回転
- 前後トリム
- 画面範囲のトリミング
- 左右音声レベル解析
- 音量差に応じた補正提案
- 右→左右、左→左右、安全な自動均衡
- H.264 / AAC MP4書き出し
- X向け、高画質、高速の書き出しプリセット
- 処理進捗と中止
- 書き出し中の軽量ライトアウトパズル「Veil Lights」
- ホーム画面追加とオフライン起動

Windows版の黒塗り、画像・テキスト配置、複数カット、詳細タイムラインなどは搭載せず、出先で使う主要機能へ絞っています。

## 開発

```bash
npm install
npm run dev
```

本番ビルド:

```bash
npm run build
```

GitHub PagesはGitHub Actionsの `Deploy to GitHub Pages` を使用します。
