# 開発メモ

## 構成

- `backend/`: FastAPIアプリケーション
- `backend/app/routers/`: APIルーター
- `backend/app/models.py`: SQLAlchemyモデル
- `backend/app/schemas.py`: Pydanticスキーマ
- `frontend/`: Vite + Reactアプリケーション
- `frontend/src/components/`: 画面・UIコンポーネント
- `frontend/src/utils/`: 表示・計算などの共通処理

## 実行

バックエンド:

`SECRET_KEY` はJWT署名に必須です。未設定または空の場合、バックエンドは起動時にエラーで停止します。開発用には以下のように任意のランダム値を設定します。

```bash
cd backend
source venv/bin/activate
export SECRET_KEY=$(openssl rand -hex 32)
uvicorn app.main:app --reload --port 18000
```

フロントエンド:

```bash
cd frontend
npm run dev
```

ブラウザで `http://localhost:15173` を開きます。

Docker配布版:

```bash
docker compose up --build
```

Docker版のDBとアップロードファイルはホスト側の `data/` に保存します。

デスクトップ版（トレイ常駐アプリ）のビルドは [desktop.md](desktop.md) を参照してください。

初回起動時に部品または商品が1件も存在しない場合は、配布確認用の初期サンプルデータを自動投入します。手動で投入したい場合は以下を実行します。

```bash
cd backend
python seed_initial_data.py
```

## 検証

バックエンド:

```bash
cd backend
python -m pytest test_api.py
```

フロントエンド:

```bash
cd frontend
npm run lint
npm run build
```

## Git管理方針

管理対象に含めるもの:
- アプリケーションコード
- 仕様書・開発ドキュメント
- `package-lock.json` など再現性に必要なロックファイル
- サンプルデータ

管理対象に含めないもの:
- `frontend/node_modules/`
- `backend/venv/`
- `frontend/dist/`
- `backend/partomate.db*`
- `data/`
- `backend/uploads/`
- `__pycache__/`
- `.DS_Store`
- `.env*` や認証情報

## 実装方針

- 既存のFastAPI + React構成を維持します。
- 画面固有のロジックはコンポーネント内に置き、複数画面で使う表示・計算処理は `frontend/src/utils/` へ寄せます。
- 在庫数量と商品構成数量は小数を許容します。
- 通貨換算は将来的に設定APIへ寄せる前提で、フロントでは共通ユーティリティ経由にします。
- 破壊的なDBマイグレーションは避け、既存データを保った追加型マイグレーションを優先します。
