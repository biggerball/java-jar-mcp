# Java JAR MCP Server - VSCode 扩展

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

一个为 Java Maven 项目提供 MCP（模型上下文协议）服务器功能的 VSCode 扩展。该扩展使 AI 助手能够访问 Maven 依赖中的 Java 类定义，解决了 Cursor 和其他 基于VSCode 的 IDE 无法自动读取 jar 文件类的限制。

## 目录

- [功能特性](#功能特性)
- [架构设计](#架构设计)
- [安装](#安装)
- [使用方法](#使用方法)
- [工作原理](#工作原理)
- [配置](#配置)
- [开发](#开发)
- [MCP 资源](#mcp-资源)
- [限制](#限制)
- [未来改进](#未来改进)
- [支持与捐赠](#支持与捐赠)
- [许可证](#许可证)

## 功能特性

- **自动 Maven 项目检测**：通过查找 `pom.xml` 自动检测 Maven 项目
- **类定义查找**：从 Maven 依赖中查找 Java 类定义
- **依赖列表**：列出项目的所有 Maven 依赖
- **JAR 类搜索**：使用模式在 JAR 文件中搜索类

## 架构设计

扩展由两个主要组件组成：

1. **VSCode 扩展** (`src/`)：管理工作区文件夹并生成 MCP 服务器进程
2. **MCP 服务器** (`mcp-server/`)：为 AI 提供查询 Java 类信息的工具和资源

## 安装

### 前置要求

- Node.js 18+
- VSCode 1.102+
- 已安装 Maven（用于 Maven 项目）

### 从源码构建

1. 克隆仓库
2. 安装依赖：
   ```bash
   npm install
   cd mcp-server
   npm install
   cd ..
   ```

3. 构建扩展和 MCP 服务器：
   ```bash
   npm run compile
   npm run build:mcp
   ```

4. 打包扩展：
   ```bash
   npm run package
   ```

5. 在 VSCode 中安装 `.vsix` 文件：
   - 打开 VSCode
   - 转到扩展视图
   - 点击 "..." 菜单 → "从 VSIX 安装..."
   - 选择生成的 `.vsix` 文件

## 使用方法

1. 打开包含 Maven 项目的工作区文件夹（包含 `pom.xml`）
2. 扩展将自动激活并为该工作区启动 MCP 服务器
3. MCP 服务器为 AI 助手提供以下工具：

### 可用的 MCP 工具

#### `find_class_definition`
从 Maven 依赖中查找 Java 类的定义。

**参数：**
- `className` (string, 必需)：完全限定类名（例如：`java.util.ArrayList`）
- `pomPath` (string, 必需)：pom.xml 文件的路径（例如：`"/path/to/project/pom.xml"`）

**返回：** 包含源代码（如果可用）、方法和字段的类定义

**示例：**
```json
{
  "className": "com.alibaba.fastjson2.filter.BeforeFilter",
  "pomPath": "/path/to/project/pom.xml"
}
```

#### `list_project_dependencies`
列出项目的所有 Maven 依赖。

**参数：**
- `pomPath` (string, 必需)：pom.xml 文件的路径（例如：`"/path/to/project/pom.xml"`）

**返回：** 包含 JAR 文件路径的依赖列表

#### `search_classes_in_jar`
在 JAR 文件中搜索匹配模式的类。

**参数：**
- `jarPath` (string)：JAR 文件的路径
- `searchPattern` (string)：搜索模式（支持通配符 `*` 和 `?`）

**返回：** 匹配的类名列表

## 配置

如果使用全局 MCP 配置文件（例如 `~/.cursor/mcp.json`），请按以下方式配置：

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

## 开发

### 项目结构

```
java-jar-mcp-extension/
├── src/                      # VSCode 扩展代码
│   ├── extension.ts         # 扩展入口点
│   ├── mcpClientManager.ts  # MCP 客户端生命周期管理
│   └── workspaceManager.ts  # 工作区检测和 Maven 配置
├── mcp-server/              # MCP 服务器代码
│   ├── src/
│   │   ├── index.ts         # MCP 服务器入口点
│   │   ├── mavenParser.ts   # pom.xml 解析
│   │   ├── jarLocator.ts    # JAR 文件定位
│   │   ├── classExtractor.ts # 类定义提取
│   │   ├── tools.ts         # MCP 工具实现
│   │   └── cache.ts         # LRU 缓存实现
│   └── dist/                # 编译后的 MCP 服务器
└── out/                     # 编译后的扩展
```

### 构建

```bash
# 构建扩展
npm run compile

# 构建 MCP 服务器
npm run build:mcp

# 打包
npm run package
```

### 测试

1. 在 VSCode 中打开 Maven 项目
2. 检查输出面板中的 MCP 服务器日志
3. 使用支持 MCP 的 AI 助手测试工具

## 限制

- 目前支持基本的 Maven 依赖解析（直接依赖）
- 类文件解析已简化（完整实现需要 Java 类文件解析器）
- 多模块项目：使用 `pomPath` 参数指定不同模块的 pom.xml 文件
- 属性解析：基本的 Maven 属性解析（不处理所有情况）

## 未来改进

- 完整的 Maven 依赖树解析（包括传递依赖）
- 使用 `java-class-tools` 或类似工具更好地解析类文件
- 支持 Gradle 项目
- 增强的 Maven 属性解析
- 自动多模块项目检测和依赖合并

## 支持与捐赠

如果您觉得这个扩展有用并想支持其开发，如果您能请我喝杯咖啡，我将不胜感激！☕

您的支持帮助我继续改进这个项目，为开发者社区创建更多有用的工具。

![Buy Me a Coffee](https://github.com/biggerball/java-jar-mcp/raw/HEAD/assets/coffee-qr-code.png)

*如果您喜欢使用这个扩展，您的支持对我来说意义重大。谢谢！* 🙏

## 许可证

MIT
