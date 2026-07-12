# 配布・パッケージ化方針

## 初期方針

Partomate は、まず Docker 版を正式配布の基準にします。

- Docker 版を macOS / Windows / Linux 共通の基準パッケージにする
- DB はホスト側の `./data/partomate.db` に保存する
- アップロードファイルはホスト側の `./data/uploads/` に保存する
- 初期公開範囲はローカルPC利用を基本にし、LAN公開は設定で扱う
- Ollama / OpenAI互換APIは同梱せず、外部接続として設定する
- macOS / Windowsアプリ化は、Docker版で保存場所・初期化・更新手順を固めてから検討する

## Docker 版の保存場所

Docker 版では、コンテナ内ではなくホスト側の `data/` ディレクトリを永続データとして使います。

```text
partomate/
  docker-compose.yml
  .env
  data/
    partomate.db
    partomate.db-shm
    partomate.db-wal
    uploads/
```

`data/` を残しておけば、コンテナやイメージを作り直しても在庫・商品・設定データは残ります。
バックアップやPC移行では、まず `data/` ディレクトリをコピー対象にします。

## 初期データ

初回起動時に部品または商品が1件も存在しない場合、以下のサンプルデータを自動投入します。

- `M2 6mm ネジ`: 100個
- `M2 ナット`: 100個
- `Pro Micro マイクロコントローラー`: 1個
- `リードタイプ 1N4148 ダイオード`: 9個
- `ゴム足`: 4個
- `商品A`: 上記部品を使うサンプル商品

既に部品または商品が存在するDBでは、初期データは投入しません。

## 起動

`.env.example` を `.env` にコピーし、`SECRET_KEY` に任意のランダム値を設定します。`SECRET_KEY` は必須で、未設定の場合は `docker compose` が起動時にエラーで停止します。

```bash
cp .env.example .env
# .env に SECRET_KEY を設定（例: openssl rand -hex 32 の出力）
docker compose up --build
```

起動後、ブラウザで以下を開きます。

```text
http://localhost:15173
```

API は以下で公開されます。

```text
http://localhost:18000
```

既に `18000` 番や `15173` 番を別アプリが使っている場合は、`.env` でポートを変更できます。

```env
FRONTEND_PORT=5173
BACKEND_PORT=8000
```

## アクセス元オリジンの制限（ALLOWED_ORIGINS）

バックエンドは、ブラウザからのCORSアクセスを許可するオリジンを環境変数 `ALLOWED_ORIGINS` で制御できます。カンマ区切りで複数指定でき、未設定の場合はすべてのオリジン（`*`）を許可します。認証はCookieではなくBearerトークン（Authorizationヘッダ）で行うため、既定のワイルドカードでも実害は限定的ですが、LAN公開時などにフロントのオリジンが確定している場合は明示的に絞り込めます。`.env` に以下のように設定します（Docker既定の `http://localhost:15173` を含め、実際に利用するオリジンをすべて列挙してください）。

```env
ALLOWED_ORIGINS=http://localhost:15173,http://192.168.1.10:15173
```

## Docker volume 版について

Docker volume は権限差やOS差に強く、サーバー運用では有利です。
ただし、一般ユーザーにはDBの実体が見えにくく、バックアップや移行手順が難しくなります。

そのため初期配布ではホスト側 `./data` を採用し、必要になった段階で上級者・サーバー向けの volume 用 `compose` を追加します。
