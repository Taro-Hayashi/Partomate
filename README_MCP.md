# Partomate MCP サーバー接続マニュアル

本システムには、外部のLLMクライアント（Cursor や Claude Desktop など）から、部品在庫情報や商品構成データを参照・操作するための MCP（Model Context Protocol）サーバーが内蔵されています。

本マニュアルに従って設定を行うことで、AIエディタなどから直接「Partomateの現在の在庫を確認して」「商品を組み立てて」といった指示が可能になります。

---

## 起動要件
- 仮想環境の Python インタプリタ: `/path/to/Partomate/backend/venv/bin/python`
- カレントディレクトリ: `/path/to/Partomate/backend`

---

## 1. Cursor での設定方法

1. Cursor の設定（ギアアイコン）を開きます。
2. **Features** > **MCP** セクションへ移動します。
3. **「+ Add New MCP Server」** ボタンをクリックします。
4. 以下の通り設定項目を入力します。
   - **Name**: `Partomate`
   - **Type**: `command`
   - **Command**:
     ```bash
     /path/to/Partomate/backend/venv/bin/python -m app.mcp_server
     ```
5. **「Save」** をクリックして保存します。
6. ステータスが `Connected` になり、提供されるツール（`get_parts_list`, `update_part_quantity`, `get_products`, `create_product`）が認識されていることを確認してください。

---

## 2. Claude Desktop での設定方法

1. Claude Desktop の設定ファイルを開きます（通常 macOS では以下のパスに存在します）：
   `~/Library/Application Support/Claude/claude_desktop_config.json`
2. `mcpServers` オブジェクト配下に以下の設定を追加します：

```json
{
  "mcpServers": {
    "partomate": {
      "command": "/path/to/Partomate/backend/venv/bin/python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/Partomate/backend"
    }
  }
}
```

3. Claude Desktop を再起動します。チャット入力欄の右下にハンマーアイコン（ツール一覧）が表示され、Partomate のツールがロードされていることを確認してください。

---

## セキュリティ上の注意

本 MCP サーバーは **認証機構を持ちません**。クライアント（Cursor / Claude Desktop など）がローカルのサブプロセスとして起動し、標準入出力（stdio）経由で通信する前提で設計されています。

- **ローカル（同一マシン）専用で利用してください。** LAN やインターネットへ公開しないでください。
- 提供ツールには `create_part` / `update_part_quantity` / `create_product` / `update_product_components` / `assemble_product` / `set_part_alert_threshold` などの**更新系ツール**が含まれます。認証がないため、このサーバーに到達できる者は誰でも在庫・商品データを追加・変更・消費できます。
- 上記の理由から、ネットワーク経由で到達可能な形（HTTP公開やポート転送など）での起動は避け、あくまで信頼できる自分のマシン上でのみ実行してください。

---

## 提供ツール一覧

| ツール名 | 説明 | 引数 |
| :--- | :--- | :--- |
| `get_parts_list` | 在庫部品の一覧を取得します。 | なし |
| `create_part` | 新しい部品情報を在庫登録します（同一名・同カテゴリの場合は数量を加算）。 | `name` (str), `category1` (str), `category2` (str, 任意), `category3` (str, 任意), `quantity` (float, 任意), `unit` (str, 任意), `purchase_price` (float, 任意), `currency` (str, 任意), `purchase_date` (str, 任意), `alert_threshold` (float, 任意) |
| `update_part_quantity` | 特定の部品IDの在庫数量を加減（または直接上書き指定）します。 | `part_id` (int), `quantity_change` (float), `absolute` (bool, 任意: デフォルトは `false`) |
| `get_products` | 登録済み商品の一覧と構成部品、概算原価を取得します。 | なし |
| `create_product` | 新しい商品と、その構成部品情報を登録します。 | `name` (str), `parts_json` (str: `[{"part_id": 1, "quantity": 4}]`), `description` (str, 任意) |
| `update_product_components` | 既存の商品の構成部品情報を上書き更新します。 | `product_id` (int), `parts_json` (str: `[{"part_id": 1, "quantity": 5}]`) |
| `assemble_product` | 指定された商品の構成部品を在庫から消費して組み立てます（在庫が不足している場合はエラーとなります）。 | `product_id` (int), `count` (float, 任意: デフォルトは `1.0`) |
| `set_part_alert_threshold` | 指定された部品のアラート閾値（最低在庫数）を設定します（0指定でアラート無効化）。 | `part_id` (int), `threshold` (float) |
| `get_low_stock_parts` | 在庫数がアラート閾値以下になっている部品の一覧を取得します（閾値が0の無効設定は除く）。 | なし |
