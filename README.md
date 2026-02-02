# Java JAR MCP Server

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

An npm package that provides MCP (Model Context Protocol) server functionality for Java Maven projects. This server enables AI assistants to access Java class definitions from Maven dependencies, solving the limitation where Cursor and other VSCode-based IDEs cannot automatically read jar file classes.

## Features

- **Class Definition Lookup**: Find Java class definitions from Maven dependencies
- **Dependency Listing**: List all Maven dependencies for a project
- **JAR Class Search**: Search for classes within JAR files using patterns

## Installation

### Prerequisites

- Node.js 18+
- Maven installed (for Maven projects)

### Using via npx

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

## Usage

After configuration, the MCP server will automatically start and provide the following tools to AI assistants:

### Available MCP Tools

#### `find_class_definition`
Find the definition of a Java class from Maven dependencies.

**Parameters:**
- `className` (string, required): Fully qualified class name (e.g., `java.util.ArrayList`)
- `pomPath` (string, optional): Path to pom.xml file (e.g., `"/path/to/project/pom.xml"`)

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

## Support & Donation

If you find this project helpful and would like to support its development, I'd be grateful if you could buy me a coffee! ☕

Your support helps me continue improving this project and creating more useful tools for the developer community.

![Buy Me a Coffee](assets/coffee-qr-code.jpg)

*If you enjoy using this project, your support would mean a lot to me. Thank you!* 🙏

## Local Development Installation

1. Clone the repository
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Use local path in MCP configuration:
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

## How It Works

The MCP server works through the following steps:

1. **Parse pom.xml**: Read and parse the Maven project's `pom.xml` file
2. **Locate JAR files**: Find corresponding JAR files in the local Maven repository based on Maven coordinates
3. **Extract class definitions**: Extract Java class definition information from JAR files

## Development

### Project Structure

```
java-jar-mcp/
├── src/
│   ├── index.ts         # MCP server entry point
│   ├── mavenParser.ts   # pom.xml parsing
│   ├── jarLocator.ts    # JAR file location
│   ├── classExtractor.ts # Class definition extraction
│   ├── tools.ts         # MCP tool implementations
│   └── cache.ts         # LRU cache implementation
└── dist/                # Compiled MCP server
```

### Building

```bash
# Build MCP server
npm run build

# Watch mode build
npm run watch
```

### Testing

```bash
npm test
```

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

## License

MIT
