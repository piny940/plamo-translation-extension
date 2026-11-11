# PLaMo Translate

ローカルの Ollama で動かす PLaMo 3 Translate を使い、閲覧中のページを日本語に翻訳する Chrome 拡張機能です。

## 必要なもの

- Node.js
- pnpm
- Ollama
- Chrome

## Ollama の準備

1. Ollama をインストールします（https://ollama.com/download ）。

2. 翻訳モデルを取得します。

   ```sh
   ollama pull hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M
   ```

   拡張機能はこのモデル名で Ollama を呼び出します（[src/background.ts](src/background.ts) の `MODEL`）。

3. 拡張機能からのアクセスを許可して Ollama を起動します。

   ```sh
   OLLAMA_ORIGINS="chrome-extension://*" ollama serve
   ```

   Ollama が既定で許可するオリジンには `chrome-extension://` が含まれないため、`OLLAMA_ORIGINS` を設定しないとリクエストが 403 で拒否されます。

   macOS のメニューバーアプリとして常駐させる場合は、次を実行してから Ollama アプリを再起動します。

   ```sh
   launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
   ```

拡張機能の接続先は `http://localhost:11434` に固定されています（[public/manifest.json](public/manifest.json) の `host_permissions`）。

## 拡張機能のビルド

```sh
pnpm install
pnpm build
```

ビルド結果は `dist/` に出力されます。

## Chrome への読み込み

1. `chrome://extensions` を開きます。
2. 右上の「デベロッパーモード」を有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、`dist/` ディレクトリを選択します。

## 使い方

1. 翻訳したいページを開きます。
2. ツールバーの拡張機能アイコンをクリックしてポップアップを開きます。
3. 「翻訳」タブの「翻訳」ボタンをクリックします。

翻訳結果はページごとにキャッシュされます。キャッシュはポップアップの「キャッシュ」タブで確認・削除できます。
