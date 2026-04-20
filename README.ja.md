[English](README.md) | 日本語 | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

# Maida

**Steam ライブラリに 200 本。今夜何をプレイするか思いつかない。**

Maida は一度に一本のゲームを表示します。プレイするか、スキップするか。一覧なし、スクロールなし、選択疲れなし。

## ダウンロード

**[Maida をダウンロード](https://github.com/devBrightRaven/maida/releases/latest)** — Windows(.exe)と Linux(.deb、.AppImage)

![Rin モード](screenshot/trimmed/rinView.png)

## 使い方

1. Maida がインストール済みの Steam ゲームを読み取る
2. ゲームが一本表示される — **プレイ** または **今はスキップ**
3. プレイを押すとゲームが起動。スキップを押すと次のゲームが表示される
4. それだけ。リストなし、レーティングなし、推薦なし

![Kamae モード](screenshot/trimmed/kamaeView.png)

## 機能

- **2 つのモード** — Rin は即断用、Kamae はゲームを型(気分ベースのプレイリスト)に分類
- **あなたから学習** — 選択に重み付けし、日々ニュートラルへ減衰
- **4 言語対応** — 英語、日本語、繁体字中国語、簡体字中国語
- **キーボードとゲームパッド** — 十字キーと左スティックで操作、右スティックで長いページをスクロール、ROG Ally のような携帯機向けに設計
- **スクリーンリーダー対応** — Windows の NVDA で検証済み
- **自動アップデート** — 今後のバージョンは自動でインストール

## 詳細情報

- **ユーザーマニュアル**: [オンライン版(英語)](https://brightraven.world/maida/manual/) または [Gist の 4 言語版](https://gist.github.com/devBrightRaven/b26da3e8aef40d683a92e66e5b783fec)
- **プライバシー**: ゲームデータはすべて端末内に保存。起動時に匿名 ping が一度送信されるが、設定でオフ可能
- **アクセシビリティ**: キーボード、スクリーンリーダー(NVDA 検証済み、Orca 部分対応)、フォーカス管理、prefers-reduced-motion 尊重。詳細は [brightraven.world/accessibility/](https://brightraven.world/accessibility/)
- **開発**: セットアップ、テスト、ビルド手順は [DEVELOPMENT.md](DEVELOPMENT.md)
- **コントリビューション**: 現在は受け付けていません

## ライセンス

[MIT](LICENSE)

## 支援

Maida が役に立ったら:

[![Sponsor](https://img.shields.io/github/sponsors/devBrightRaven?label=Sponsor&logo=github&style=flat-square&color=black)](https://github.com/sponsors/devBrightRaven)

連絡先: bertram@brightraven.world
