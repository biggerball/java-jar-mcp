# Java JAR MCP Server

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

一个为 Java Maven 项目提供 MCP（模型上下文协议）服务器功能的 npm 包。该服务器使 AI 助手能够访问 Maven 依赖中的 Java 类定义，解决了 Cursor 和其他基于 VSCode 的 IDE 无法自动读取 jar 文件类的限制。

## 功能特性

- **类定义查找**：从 Maven 依赖中查找 Java 类定义
- **依赖列表**：列出项目的所有 Maven 依赖
- **JAR 类搜索**：使用模式在 JAR 文件中搜索类

## 安装

### 前置要求

- Node.js 18+
- 已安装 Maven（用于 Maven 项目）

### 通过 npx 使用

```json
{
   "mcpServers": {
      "java-jar-mcp": {
         "command": "npx",
         "args": ["-y", "@biggerball/java-jar-mcp@latest"],
         "env": {
            "MAVEN_REPO_PATH": "/Users/username/.m2/repository"
         }
      }
   }
}
```

## 使用方法

配置完成后，MCP 服务器将自动启动，并为 AI 助手提供以下工具：

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

## 支持与捐赠

如果您觉得这个项目有用并想支持其开发，如果您能请我喝杯咖啡，我将不胜感激！☕

您的支持帮助我继续改进这个项目，为开发者社区创建更多有用的工具。

![Buy Me a Coffee](assets/coffee-qr-code.jpg)

*如果您喜欢使用这个项目，您的支持对我来说意义重大。谢谢！* 🙏

## 本地开发安装

1. 克隆仓库
2. 安装依赖并构建：
   ```bash
   npm install
   npm run build
   ```

3. 在 MCP 配置文件中使用本地路径：
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

## 工作原理

MCP 服务器通过以下步骤工作：

1. **解析 pom.xml**：读取并解析 Maven 项目的 `pom.xml` 文件
2. **定位 JAR 文件**：根据 Maven 坐标在本地 Maven 仓库中查找对应的 JAR 文件
3. **提取类定义**：从 JAR 文件中提取 Java 类的定义信息

## 开发

### 项目结构

```
java-jar-mcp/
├── src/
│   ├── index.ts         # MCP 服务器入口点
│   ├── mavenParser.ts   # pom.xml 解析
│   ├── jarLocator.ts    # JAR 文件定位
│   ├── classExtractor.ts # 类定义提取
│   ├── tools.ts         # MCP 工具实现
│   └── cache.ts         # LRU 缓存实现
└── dist/                # 编译后的 MCP 服务器
```

### 构建

```bash
# 构建 MCP 服务器
npm run build

# 监听模式构建
npm run watch
```

### 测试

```bash
npm test
```
## 未来改进

- 支持 Gradle 项目
- 增强的 Maven 属性解析
- 自动多模块项目检测和依赖合并

## 许可证

MIT
