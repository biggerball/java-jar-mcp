# Java JAR MCP Server - VSCode Extension

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

A VSCode extension that provides MCP (Model Context Protocol) server functionality for Java Maven projects. This extension enables AI assistants to access Java class definitions from Maven dependencies, solving the limitation where Cursor and other IDEs cannot automatically read jar file classes.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Development](#development)
- [Limitations](#limitations)
- [Future Improvements](#future-improvements)
- [Support & Donation](#support--donation)
- [License](#license)

## Features

- **Automatic Maven Project Detection**: Automatically detects Maven projects by looking for `pom.xml`
- **Class Definition Lookup**: Find Java class definitions from Maven dependencies
- **Dependency Listing**: List all Maven dependencies for a project
- **JAR Class Search**: Search for classes within JAR files using patterns

## Architecture

The extension consists of two main components:

1. **VSCode Extension** (`src/`): Manages workspace folders and spawns MCP server processes
2. **MCP Server** (`mcp-server/`): Provides tools and resources for AI to query Java class information

## Installation

### Prerequisites

- Node.js 18+ 
- VSCode 1.102+
- Maven installed (for Maven projects)

### Build from Source

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd mcp-server
   npm install
   cd ..
   ```

3. Build the extension and MCP server:
   ```bash
   npm run compile
   npm run build:mcp
   ```

4. Package the extension:
   ```bash
   npm run package
   ```

5. Install the `.vsix` file in VSCode:
   - Open VSCode
   - Go to Extensions view
   - Click "..." menu → "Install from VSIX..."
   - Select the generated `.vsix` file

## Usage

1. Open a workspace folder containing a Maven project (with `pom.xml`)
2. The extension will automatically activate and start an MCP server for that workspace
3. The MCP server provides the following tools to AI assistants:

### Available MCP Tools

#### `find_class_definition`
Find the definition of a Java class from Maven dependencies.

**Parameters:**
- `className` (string, required): Fully qualified class name (e.g., `java.util.ArrayList`)
- `pomPath` (string, required): Path to pom.xml file (e.g., `"/path/to/project/pom.xml"`)

**Returns:** Class definition with source code (if available), methods, and fields

**Example:**
```json
{
  "className": "com.alibaba.fastjson2.filter.BeforeFilter",
  "pomPath": "/path/to/project/pom.xml"
}
```

#### `list_project_dependencies`
List all Maven dependencies for a project.

**Parameters:**
- `pomPath` (string, required): Path to pom.xml file (e.g., `"/path/to/project/pom.xml"`)

**Returns:** List of dependencies with JAR file paths

#### `search_classes_in_jar`
Search for classes matching a pattern in a JAR file.

**Parameters:**
- `jarPath` (string): Path to the JAR file
- `searchPattern` (string): Search pattern (supports wildcards `*` and `?`)

**Returns:** List of matching class names

## Configuration

If you're using a global MCP configuration file (e.g., `~/.cursor/mcp.json`), configure it as follows:

```json
{
  "mcpServers": {
    "java-jar-mcp": {
      "command": "sh",
      "args": [
        "-c",
        "node \"$(ls -d /Users/username/.cursor/extensions/javajarmcp.javajarmcp-* 2>/dev/null | sort -V -r | head -n 1)/mcp-server/dist/index.js\""
      ],
      "env": {
        "MAVEN_REPO_PATH": "/Users/username/.m2/repository"
      },
      "disabled": false
    }
  }
}
```

## Development

### Project Structure

```
java-jar-mcp-extension/
├── src/                      # VSCode extension code
│   ├── extension.ts         # Extension entry point
│   ├── mcpClientManager.ts  # MCP client lifecycle management
│   └── workspaceManager.ts  # Workspace detection and Maven config
├── mcp-server/              # MCP server code
│   ├── src/
│   │   ├── index.ts         # MCP server entry point
│   │   ├── mavenParser.ts   # pom.xml parsing
│   │   ├── jarLocator.ts    # JAR file location
│   │   ├── classExtractor.ts # Class definition extraction
│   │   ├── tools.ts         # MCP tool implementations
│   │   └── cache.ts         # LRU cache implementation
│   └── dist/                # Compiled MCP server
└── out/                     # Compiled extension
```

### Building

```bash
# Build extension
npm run compile

# Build MCP server
npm run build:mcp

# Package
npm run package
```

### Testing

1. Open a Maven project in VSCode
2. Check the Output panel for MCP server logs
3. Use an AI assistant that supports MCP to test the tools

## Limitations

- Currently supports basic Maven dependency resolution (direct dependencies)
- Class file parsing is simplified (full implementation would require Java class file parser)
- Multi-module projects: Use `pomPath` parameter to specify different module pom.xml files
- Property resolution: Basic Maven property resolution (does not handle all cases)

## Future Improvements

- Full Maven dependency tree resolution (including transitive dependencies)
- Better class file parsing using `java-class-tools` or similar
- Support for Gradle projects
- Enhanced Maven property resolution
- Automatic multi-module project detection and dependency merging

## Support & Donation

If you find this extension helpful and would like to support its development, I'd be grateful if you could buy me a coffee! ☕

Your support helps me continue improving this project and creating more useful tools for the developer community.

![Buy Me a Coffee](https://github.com/biggerball/java-jar-mcp/raw/HEAD/assets/coffee-qr-code.png)

*If you enjoy using this extension, your support would mean a lot to me. Thank you!* 🙏

## License

MIT
