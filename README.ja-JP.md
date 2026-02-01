# Java JAR MCP Server - VSCode 拡張機能

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

Java Maven プロジェクトに MCP（Model Context Protocol）サーバー機能を提供する VSCode 拡張機能です。この拡張機能により、AI アシスタントが Maven 依存関係から Java クラス定義にアクセスできるようになり、Cursor やその他の IDE が jar ファイルのクラスを自動的に読み取れないという制限を解決します。

## 目次

- [機能](#機能)
- [アーキテクチャ](#アーキテクチャ)
- [インストール](#インストール)
- [使用方法](#使用方法)
- [動作原理](#動作原理)
- [設定](#設定)
- [開発](#開発)
- [制限事項](#制限事項)
- [今後の改善](#今後の改善)
- [サポートと寄付](#サポートと寄付)
- [ライセンス](#ライセンス)

## 機能

- **自動 Maven プロジェクト検出**：`pom.xml` を探して Maven プロジェクトを自動検出
- **クラス定義検索**：Maven 依存関係から Java クラス定義を検索
- **依存関係一覧**：プロジェクトのすべての Maven 依存関係を一覧表示
- **JAR クラス検索**：パターンを使用して JAR ファイル内のクラスを検索

## アーキテクチャ

拡張機能は 2 つの主要コンポーネントで構成されています：

1. **VSCode 拡張機能** (`src/`)：ワークスペースフォルダを管理し、MCP サーバープロセスを生成
2. **MCP サーバー** (`mcp-server/`)：AI が Java クラス情報をクエリするためのツールとリソースを提供

## インストール

### 前提条件

- Node.js 18+
- VSCode 1.102+
- Maven がインストールされていること（Maven プロジェクト用）

### ソースからビルド

1. リポジトリをクローン
2. 依存関係をインストール：
   ```bash
   npm install
   cd mcp-server
   npm install
   cd ..
   ```

3. 拡張機能と MCP サーバーをビルド：
   ```bash
   npm run compile
   npm run build:mcp
   ```

4. 拡張機能をパッケージ化：
   ```bash
   npm run package
   ```

5. VSCode に `.vsix` ファイルをインストール：
   - VSCode を開く
   - 拡張機能ビューに移動
   - "..." メニューをクリック → "VSIX からインストール..."
   - 生成された `.vsix` ファイルを選択

## 使用方法

1. Maven プロジェクトを含むワークスペースフォルダを開く（`pom.xml` を含む）
2. 拡張機能が自動的にアクティブ化され、そのワークスペースの MCP サーバーが起動します
3. MCP サーバーは AI アシスタントに以下のツールを提供します：

### 利用可能な MCP ツール

#### `find_class_definition`
Maven 依存関係から Java クラスの定義を検索します。

**パラメータ：**
- `className` (string, 必須)：完全修飾クラス名（例：`java.util.ArrayList`）
- `pomPath` (string, 必須)：pom.xml ファイルのパス（例：`"/path/to/project/pom.xml"`）

**戻り値：** ソースコード（利用可能な場合）、メソッド、フィールドを含むクラス定義

**例：**
```json
{
  "className": "com.alibaba.fastjson2.filter.BeforeFilter",
  "pomPath": "/path/to/project/pom.xml"
}
```

#### `list_project_dependencies`
プロジェクトのすべての Maven 依存関係を一覧表示します。

**パラメータ：**
- `pomPath` (string, 必須)：pom.xml ファイルのパス（例：`"/path/to/project/pom.xml"`）

**戻り値：** JAR ファイルパスを含む依存関係のリスト

#### `search_classes_in_jar`
JAR ファイル内でパターンに一致するクラスを検索します。

**パラメータ：**
- `jarPath` (string)：JAR ファイルのパス
- `searchPattern` (string)：検索パターン（ワイルドカード `*` と `?` をサポート）

**戻り値：** 一致するクラス名のリスト

## 設定

グローバル MCP 設定ファイル（例：`~/.cursor/mcp.json`）を使用している場合、次のように設定します：

```json
{
  "mcpServers": {
    "java-jar-mcp": {
      "command": "node",
      "args": [
        "/Users/username/.cursor/extensions/javajarmcp.javajarmcp-0.0.1/mcp-server/dist/index.js"
      ],
      "env": {
        "MAVEN_REPO_PATH": "/Users/username/.m2/repository"
      },
      "disabled": false
    }
  }
}
```

## 開発

### プロジェクト構造

```
java-jar-mcp-extension/
├── src/                      # VSCode 拡張機能コード
│   ├── extension.ts         # 拡張機能エントリーポイント
│   ├── mcpClientManager.ts  # MCP クライアントライフサイクル管理
│   └── workspaceManager.ts  # ワークスペース検出と Maven 設定
├── mcp-server/              # MCP サーバーコード
│   ├── src/
│   │   ├── index.ts         # MCP サーバーエントリーポイント
│   │   ├── mavenParser.ts   # pom.xml 解析
│   │   ├── jarLocator.ts    # JAR ファイル位置特定
│   │   ├── classExtractor.ts # クラス定義抽出
│   │   ├── tools.ts         # MCP ツール実装
│   │   └── cache.ts         # LRU キャッシュ実装
│   └── dist/                # コンパイル済み MCP サーバー
└── out/                     # コンパイル済み拡張機能
```

### ビルド

```bash
# 拡張機能をビルド
npm run compile

# MCP サーバーをビルド
npm run build:mcp

# パッケージ化
npm run package
```

### テスト

1. VSCode で Maven プロジェクトを開く
2. 出力パネルで MCP サーバーログを確認
3. MCP をサポートする AI アシスタントを使用してツールをテスト

## 制限事項

- 現在、基本的な Maven 依存関係解決（直接依存関係）をサポート
- クラスファイルの解析は簡略化されています（完全な実装には Java クラスファイルパーサーが必要）
- マルチモジュールプロジェクト：`pomPath` パラメータを使用して異なるモジュールの pom.xml ファイルを指定
- プロパティ解決：基本的な Maven プロパティ解決（すべてのケースを処理しない）

## 今後の改善

- 完全な Maven 依存関係ツリー解決（推移的依存関係を含む）
- `java-class-tools` または類似ツールを使用したより良いクラスファイル解析
- Gradle プロジェクトのサポート
- 強化された Maven プロパティ解決
- 自動マルチモジュールプロジェクト検出と依存関係マージ

## サポートと寄付

この拡張機能が役に立ち、開発をサポートしたい場合は、コーヒーをご購入いただければ幸いです！☕

皆様のサポートにより、このプロジェクトを継続的に改善し、開発者コミュニティ向けにより有用なツールを作成できます。

![Buy Me a Coffee](https://github.com/biggerball/java-jar-mcp/raw/HEAD/assets/coffee-qr-code.png)

*この拡張機能をお楽しみいただいている場合、皆様のサポートは私にとって非常に意味があります。ありがとうございます！* 🙏

## ライセンス

MIT
