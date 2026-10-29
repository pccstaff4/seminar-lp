# BEST SALON REPORT 無料オンラインセミナー申し込みLP（2026年11月）

仕様：依頼書 LP_SPEC.md（リポジトリには載せず、手元で管理）

```
index.html          LP本体（HTML・CSS・JS）
assets/banner.jpg   メインバナー
assets/hashiguchi.jpg 登壇者写真
gas/Code.gs         申し込み受付（Google Apps Script）
```

## 差し替える値（プレースホルダー）

| 場所 | 値 | 内容 |
| --- | --- | --- |
| `index.html` の `CONFIG.GAS_URL` | `REPLACE_WITH_GAS_WEBAPP_URL` | Apps Script をウェブアプリとして公開したときのURL（…/exec） |
| `index.html` の `CONFIG.LINE_URL` | `REPLACE_WITH_SEMINAR_LINE_URL` | セミナー専用のLINE友だち追加URL（既存の無料相談LINEとは別） |
| Apps Script のスクリプト プロパティ `ZOOM_URL` | （コードには書かない） | ZoomウェビナーのURL（両日共通） |
| Apps Script のスクリプト プロパティ `SPREADSHEET_ID` | （コードには書かない） | 申し込みを保存するスプレッドシートのID |
| `gas/Code.gs` の `CONFIG.FROM_ADDRESS` | `info@pccinc.jp` | 自動返信・社内通知の送信元。s.mori のGmailに送信元エイリアスとして登録済み。空欄にすると s.mori@pccinc.jp から送信 |
| `gas/Code.gs` の `CONFIG.NOTIFY_TO` | `support@pccinc.jp` | 申し込みがあったことを知らせる社内向けメールの宛先（返信すると申込者に届く） |
| `index.html` の登壇者プロフィール | — | 社長の本人確認後に文面を確定 |

申込締切は `index.html` と `gas/Code.gs` の `DEADLINE`（2026-11-12 19:00 日本時間。18:59まで受付）。変える場合は両方を同じ値にします。

## ローカルでの確認

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/?utm_source=test を開きます。`GAS_URL` を入れるまでは、送信すると「送信できませんでした」と表示されます（ピクセルのイベントも発火しません）。

## Apps Script の設定（s.mori@pccinc.jp で作業）

1. Googleドライブで新しいスプレッドシートを作る（例：「BSRセミナー_2026-11_申込」）。共有は必要なメンバーだけにする
2. スプレッドシートのURL `https://docs.google.com/spreadsheets/d/【ここ】/edit` の【ここ】の部分（ID）を控える
3. メニュー「拡張機能 → Apps Script」を開き、`gas/Code.gs` の中身を貼り付けて保存
4. 左の歯車「プロジェクトの設定」→ いちばん下の「スクリプト プロパティ」→「スクリプト プロパティを追加」で次の2つを登録して保存
   - プロパティ `ZOOM_URL` ／ 値：ZoomウェビナーのURL
   - プロパティ `SPREADSHEET_ID` ／ 値：手順2で控えたID
5. 関数 `setupSheet` を選んで実行（初回は権限の許可を求められるので許可）。「202611申し込み」シートに見出し行ができる
6. 関数 `sendTestMail` を実行し、自分宛てに届く自動返信メールの文面を確認。続けて `sendTestNotify` を実行し、support@pccinc.jp に社内通知が届くことを確認
7. 「デプロイ → 新しいデプロイ → 種類：ウェブアプリ」。実行するユーザー：**自分**、アクセスできるユーザー：**全員**
8. 発行されたURLを `index.html` の `CONFIG.GAS_URL` に入れる

スクリプト プロパティが未登録のときは、申し込みを受け付けずにエラーを返します（参加URLのないメールを送らないため）。ZoomのURLを変えるときはスクリプト プロパティを書き換えるだけでよく、再デプロイは不要です。
`Code.gs` を直したときは「デプロイを管理 → 編集 → バージョン：新バージョン」で更新します（URLは変わりません）。
自動返信メール・社内通知の送信に失敗した場合でも申し込みは保存されます。失敗は Apps Script の「実行数」のログで確認できます。

## 公開前チェック

- Metaイベントマネージャで、ピクセルの「自動詳細マッチング」がオフになっていることを確認（LPのコードからは止められないため）
- テスト申し込み → スプシ保存・自動返信メール・完了メッセージを確認（テストの行は「テスト」と分かるようにする）
- イベントマネージャのテストイベントで PageView と CompleteRegistration が1回ずつ届くことを確認
- 入力エラーのまま送信してもイベントが発火しないことを確認
- スマホとPCで表示とボタンの動きを確認
- そのほか依頼書（LP_SPEC.md）「公開前チェック」の項目
