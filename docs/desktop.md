# デスクトップアプリ（トレイ常駐版）

Mac（メニューバー）/ Windows（タスクトレイ）に常駐する配布用ビルド。ウィンドウは持たず、トレイアイコンのメニューから「ブラウザで開く」「ログイン時に起動」「終了」を選ぶ。

- メニューの言語はOSのUI言語が日本語なら日本語、それ以外は英語（macOS: `defaults read -g AppleLocale`、Windows: `GetUserDefaultUILanguage`）。
- 「ログイン時に起動」はチェック式トグル。macOSは `~/Library/LaunchAgents/com.partomate.desktop.plist`、Windowsは `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` のレジストリ値で登録・解除する。

## 仕組み

- エントリポイントは [backend/desktop_launcher.py](../backend/desktop_launcher.py)。uvicorn をバックグラウンドスレッドで起動し、pystray でトレイアイコンを表示する。
- フロントエンドは `frontend/dist` のビルド成果物を同梱し、バックエンドが `PARTOMATE_STATIC_DIR` 経由で同一ポートから配信する（`app/main.py`）。同一オリジンになるため CORS 設定は不要。
- ポートは既定 **18000**、バインド先は既定 **127.0.0.1**（ローカル専用）。初回起動時（データディレクトリに `partomate.db` が無い場合）のみサーバー起動を待ってブラウザを自動で開き、トレイアイコンから開ける旨の通知を出す（macOSは通知センター経由のベストエフォート、Windowsはトレイ通知）。2回目以降は自動では開かず、トレイメニューの「ブラウザで開く」で `http://localhost:18000` を開く。フロントの API フォールバック（`hostname:18000`）がそのまま同一オリジンを指すため、フロント側のビルド時設定は不要。
- 起動時にポートが使用中なら二重起動とみなし、ブラウザを開くだけで終了する。
- ホスト・ポートはデータディレクトリの `config.json` で変更できる（環境変数 `PARTOMATE_DESKTOP_HOST` / `PARTOMATE_DESKTOP_PORT` が優先）。他端末（LAN・Tailscale）からアクセスしたい場合は `{"host": "0.0.0.0"}` を置いてアプリを再起動する。設定ページの「外部からのアクセスを許可する」トグルでも `host` を `0.0.0.0` / `127.0.0.1` に切替可能（いずれも要再起動で反映。環境変数 `PARTOMATE_DESKTOP_HOST` が設定されている場合はそちらが優先される）。この場合、非ローカル接続には設定画面の `allowed_hosts`（サーバー側IP制限）が効くので、必要に応じてそこで絞る。Windows は初回に外部公開する際、ファイアウォールの受信許可が必要になることがある。

## データの保存場所

| OS | 場所 |
|---|---|
| macOS | `~/Library/Application Support/Partomate/` |
| Windows | `%APPDATA%\Partomate\` |

`partomate.db`・`uploads/`・`secret_key`（初回起動時に自動生成、パーミッション600）をここに置く。開発時のリポジトリ内 DB とは独立している。

## ビルド手順

クロスビルド不可のため、各 OS 上で実行する。

### macOS

```bash
# 1. フロントエンドをビルド
cd frontend && npm run build

# 2. デスクトップ用依存をインストール（初回のみ）
cd ../backend
venv/bin/python -m pip install -r requirements.txt -r requirements-desktop.txt

# 3. パッケージング
venv/bin/python -m PyInstaller partomate_desktop.spec --noconfirm
```

`backend/dist/Partomate.app` が生成される。`LSUIElement=1` により Dock に出ずメニューバーのみに常駐する。

### Windows

前提: Python 3.11 と Node.js をインストール済みであること（Python はインストーラの「Add python.exe to PATH」にチェック）。PowerShell でリポジトリ直下から:

```powershell
# 1. フロントエンドをビルド
cd frontend
npm install
npm run build

# 2. venv作成とデスクトップ用依存のインストール（初回のみ）
cd ..\backend
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt -r requirements-desktop.txt

# 3. パッケージング
venv\Scripts\python -m PyInstaller partomate_desktop.spec --noconfirm
```

`backend\dist\Partomate\Partomate.exe`（コンソールなし）が生成される。フォルダごと配置して exe を起動するとタスクトレイに常駐する（トレイの矢印に隠れている場合はドラッグで固定）。

### Windows版のGitHub Actionsビルド

[Build Windows package](../.github/workflows/build-windows.yml) は、GitHubのActions画面から手動実行するか、`v` で始まるタグをpushするとWindows版をビルドする。完了後、実行結果のArtifactsから `Partomate-Windows-x64` をダウンロードする。

- GitHub-hosted Windows Runner上でビルドするため、署名情報は使用しない。
- Artifactには `Partomate-Windows-x64.zip` が入り、展開後はフォルダ内の `Partomate.exe` を起動する。
- Artifactの保存期間は14日。

## アイコン

- ソースは `assets/icon/`（アプリ用、サイズ別PNG + SVG）と `assets/icon_mono/`（トレイ用、黒＋透過のサイズ別PNG）。
- アプリアイコンは生成済みの `assets/Partomate.icns`（macOS）/ `assets/Partomate.ico`（Windows）を spec が参照する。PNG を差し替えたら再生成する:
  - `.icns`: iconset ディレクトリに `icon_16x16.png`〜`icon_512x512@2x.png` の命名でコピーし `iconutil -c icns`（macOS のみ）
  - `.ico`: Pillow で `app-256.png` に `append_images=[16,24,32,48,64,128]` を付けて保存
- トレイアイコンは `assets/icon_mono/` を同梱し実行時に読み込む。macOS は 18pt のテンプレート画像（Retina・メニューバーのライト/ダークに自動追従）、Windows はライトテーマで黒のまま、ダークテーマではレジストリ判定で白に反転して表示する。

## macOS の署名・公証

Developer ID Application 証明書（キーチェーン登録済み）を前提に、以下で署名付きビルド〜公証まで行う。署名は `PARTOMATE_CODESIGN_IDENTITY` 未設定なら行われない（Windows ビルドや手元検証用はそのまま）。entitlements は [backend/entitlements.plist](../backend/entitlements.plist)（PyInstaller 製 Python アプリの hardened runtime 対応）。

```bash
PARTOMATE_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
  scripts/build_macos_dmg.sh
```

スクリプトはフロントエンドと `.app` をビルドし、コード署名を検証してから `backend/dist/Partomate.dmg` を作成する。そのDMGをAppleへ公証し、チケットのstapleとGatekeeper検証まで実行する。公証資格情報は `notarytool store-credentials` で保存した `partomate-notary` を既定で使用する。別名の場合は `PARTOMATE_NOTARY_PROFILE` で指定する。

## 既知の注意点

- Windows は未署名だと SmartScreen 警告が出る（配布する場合は Microsoft Store 配布を予定）。自分のマシンでビルドして LAN 内で使う分には警告は出ない。
