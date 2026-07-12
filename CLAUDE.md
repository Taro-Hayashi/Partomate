# CLAUDE.md

部品・在庫管理システム「Partomate」。概要・技術構成・ロードマップは [AGENTS.md](AGENTS.md)、仕様は [docs/spec.md](docs/spec.md)、構成・実行・検証コマンド・Git管理方針は [docs/development.md](docs/development.md)、デプロイは [docs/deployment.md](docs/deployment.md)、デスクトップ版ビルドは [docs/desktop.md](docs/desktop.md) を参照。

## 意図的な仕様（バグとして「修正」しないこと）

- チャット承認実行（`chat/execute`）の商品組み立ては在庫不足でも成功扱いとし、負数は0に切り詰める（在庫表示が0でも実物はあった前提）。MCPの `assemble_product` が在庫チェックする挙動差も許容済み。
- ユーザー管理機能は廃止済み。認証は初回 `/api/auth/setup` とログイン・`/me` のみで、公開登録・ユーザーCRUDは存在しない。パスワード忘れは users テーブルを空にして /setup をやり直す運用（README記載）。
- PartsPage の `formatApiErrorDetail` は en時のみバックエンドの生エラーを返す非対称ロジック（意図的）。

## バックエンドの約束事

- `SECRET_KEY` 環境変数は必須。未設定は起動エラー。テストは `SECRET_KEY=test-secret-key venv/bin/python -m pytest test_api.py` で実行する。
- CORSはBearerトークン前提で credentials 無効・既定全オリジン許可。制限は `ALLOWED_ORIGINS` 環境変数（docker-compose 経由でも渡る）。設定画面の `allowed_hosts` はサーバー側IP制限ミドルウェアで、CORSとは別レイヤー。
- 為替レートの定義元は `app/pricing.py` の `FALLBACK_RATE_TO_JPY` のみ（mcp_server.py・main.py はここから参照）。`models.py` の `ExchangeRate` モデルは未使用だが残置で確定。
- 設定のバージョン移行は起動時の `migrate_settings(db)` が唯一の書き込み点。`GET /settings` は読み取り専用を維持する。
- MCPサーバー（`app/mcp_server.py`）は無認証・stdio前提のローカル専用（README_MCP.md に注意書きあり）。
- デバッグ出力は `print` ではなくモジュールロガー（`logging.getLogger(__name__)`）を使う。

## フロントエンドの約束事

- 表示文言は `utils/i18n.ts` の `translations` に集約し、コンポーネントでは `const t = (key, params?) => getTranslation(language, key, params)` を使う。`language === 'en' ? ... : ...` の直書きは原則禁止。意図的な残置は4箇所のみ（ChatPageの引用符・区切り整形2、PartsPageの生エラー整形、SettingsPageの言語コード判定）。動的値は `{name}` 形式のプレースホルダで渡す。
- APIレスポンス型は `types/inventory.ts`（Part/Product/ProductPart）と `types/chat.ts`（Message/PreviewData）を使う。LLM出力由来の `previewData` は形が保証されないため無理に厳格化しない（`any` の残置は意図的）。
- ChatPage と PageChatDrawer の共通ロジックは `utils/chat.ts` / `hooks/useQuickActionsScroll.ts` に置く。`formatUnit` は `utils/inventory.ts` のものを使い独自定義しない。`fetchRateAndApply` は両者で挙動差（parts_edit対応の有無）があるため共通化しない。
- 数値入力欄は入力中の値を文字列のまま state に保持し、計算・API送信時に `Number()` で数値化する（`0.13` のような小数入力対策）。値バインドに `|| ''` を使うと 0 がfalsyで消える点に注意。
- チャット承認ボタンは `executingMessageId` で実行中を disabled にし二重送信を防ぐ。数量±ボタンは最新state基準の差分更新＋部品ごとのリクエスト世代ガードで連打レースを防ぐ。これらのパターンを崩さない。
- ページコンポーネントは App.tsx で `React.lazy` 分割。`Message` 型は `types/chat.ts` からimportする（ChatPage経由の静的importに戻すとチャンク分割が壊れる）。
- チャットドロワー（各ページの `drawerMessages`）と ChatPage（`chatMessages`）の state は独立しており共有されない。

## 検証

- バックエンド: `cd backend && SECRET_KEY=test-secret-key venv/bin/python -m pytest test_api.py`
- フロントエンド: `cd frontend && npx tsc -b && npm run build && npm run lint`（lintの既存指摘は約60件。新規に増やさないこと）

## エージェント分担方針（トークン節約）

メインエージェント（fable等の上位モデル）が直接手を動かすのは「数ファイルの小さな修正」「設計判断」「最終検証・統合・コミット」のみ。それ以外の実装・レビュー・広範な調査・機械的な一括変更・リモート操作（SSH越しのビルド等）は委任を基本とする。迷ったら委任する。

- Agentツール: バックエンドのセキュリティ・設計判断を伴う作業は `model: opus`、フロントエンド実装・機械的移行・リモートでの定型作業は `model: sonnet`。
- 外部CLI（Bash経由、自己完結した独立タスク向け）: `codex exec "<プロンプト>"`、`agy -p "<プロンプト>"`（Antigravity）。どちらも作業ツリーを直接編集するため、同じファイルを触る他の委任と並走させない。
- ファイルが重ならない分担（例: backend/ と frontend/）は並列実行してよい。同一ファイルを触る作業（例: i18n.ts への追記）は順次実行する。
- サブエージェントには「担当外のディレクトリを編集しない」「git commit しない」「検証コマンドの実行と結果報告」まで指示に含める。
- 検証（テスト・tsc・ビルド）と統合・コミットはメインエージェントが最終確認として自分で行う。作業の区切りごとにコミットする。
