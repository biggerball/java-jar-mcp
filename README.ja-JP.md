# Java JAR MCP Server

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

Java Maven プロジェクトに MCP（Model Context Protocol）サーバー機能を提供する npm パッケージです。このサーバーにより、AI アシスタントが Maven 依存関係から Java クラス定義にアクセスできるようになり、Cursor やその他の VSCode ベースの IDE が jar ファイルのクラスを自動的に読み取れないという制限を解決します。

## 機能特性

- **クラス定義検索**：Maven 依存関係から Java クラス定義を検索
- **依存関係一覧**：プロジェクトのすべての Maven 依存関係を一覧表示
- **JAR クラス検索**：パターンを使用して JAR ファイル内のクラスを検索

## インストール

### 前提条件

- Node.js 18+
- Maven がインストールされていること（Maven プロジェクト用）

### npx 経由で使用

```json
{
  "mcpServers": {
    "java-jar-mcp": {
      "command": "npx",
      "args": ["-y", "@biggerball/java-jar-mcp"],
      "env": {
        "MAVEN_REPO_PATH": "/Users/username/.m2/repository"
      }
    }
  }
}
```

## 使用方法

設定後、MCP サーバーは自動的に起動し、AI アシスタントに以下のツールを提供します：

### 利用可能な MCP ツール

#### `find_class_definition`
Maven 依存関係から Java クラスの定義を検索します。

**パラメータ：**
- `className` (string, 必須)：完全修飾クラス名（例：`java.util.ArrayList`）
- `pomPath` (string, オプション)：pom.xml ファイルのパス（例：`"/path/to/project/pom.xml"`）

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

## サポートと寄付

このプロジェクトが役に立ち、開発をサポートしたい場合は、コーヒーをご購入いただければ幸いです！☕

皆様のサポートにより、このプロジェクトを継続的に改善し、開発者コミュニティ向けにより有用なツールを作成できます。

![Buy Me a Coffee](assets/coffee-qr-code.jpg)

*このプロジェクトをお楽しみいただいている場合、皆様のサポートは私にとって非常に意味があります。ありがとうございます！* 🙏

## ローカル開発インストール

1. リポジトリをクローン
2. 依存関係をインストールしてビルド：
   ```bash
   npm install
   npm run build
   ```

3. MCP 設定ファイルでローカルパスを使用：
   ```json
   {
     "mcpServers": {
       "java-jar-mcp": {
         "command": "node",
         "args": ["/path/to/java-jar-mcp/dist/index.js"],
         "env": {
           "MAVEN_REPO_PATH": "/Users/username/.m2/repository"
         }
       }
     }
   }
   ```

## 動作原理

MCP サーバーは以下の手順で動作します：

1. **pom.xml の解析**：Maven プロジェクトの `pom.xml` ファイルを読み取り、解析
2. **JAR ファイルの位置特定**：Maven 座標に基づいてローカル Maven リポジトリ内の対応する JAR ファイルを検索
3. **クラス定義の抽出**：JAR ファイルから Java クラスの定義情報を抽出

## 開発

### プロジェクト構造

```
java-jar-mcp/
├── src/
│   ├── index.ts         # MCP サーバーエントリーポイント
│   ├── mavenParser.ts   # pom.xml 解析
│   ├── jarLocator.ts    # JAR ファイル位置特定
│   ├── classExtractor.ts # クラス定義抽出
│   ├── tools.ts         # MCP ツール実装
│   └── cache.ts         # LRU キャッシュ実装
└── dist/                # コンパイル済み MCP サーバー
```

### ビルド

```bash
# MCP サーバーをビルド
npm run build

# ウォッチモードでビルド
npm run watch
```

### テスト

```bash
npm test
```

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

## ライセンス

MIT
