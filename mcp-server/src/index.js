#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const mavenParser_js_1 = require("./mavenParser.js");
const jarLocator_js_1 = require("./jarLocator.js");
const classExtractor_js_1 = require("./classExtractor.js");
const tools_js_1 = require("./tools.js");
// Get workspace context from environment variables
const WORKSPACE_FOLDER = process.env.WORKSPACE_FOLDER || process.cwd();
const MAVEN_REPO_PATH = process.env.MAVEN_REPO_PATH || '';
const WORKSPACE_NAME = process.env.WORKSPACE_NAME || 'unknown';
console.error(`[${WORKSPACE_NAME}] MCP Server starting...`);
console.error(`[${WORKSPACE_NAME}] Workspace: ${WORKSPACE_FOLDER}`);
console.error(`[${WORKSPACE_NAME}] Maven Repo: ${MAVEN_REPO_PATH}`);
// Initialize components
const mavenParser = new mavenParser_js_1.MavenParser(WORKSPACE_FOLDER);
const jarLocator = new jarLocator_js_1.JarLocator(MAVEN_REPO_PATH);
const classExtractor = new classExtractor_js_1.ClassExtractor();
const tools = new tools_js_1.MCPServerTools(mavenParser, jarLocator, classExtractor);
// Create MCP server
const server = new index_js_1.Server({
    name: 'java-jar-mcp-server',
    version: '0.0.1',
}, {
    capabilities: {
        tools: {},
        resources: {},
    },
});
// List available tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'find_class_definition',
                description: 'Find the definition of a Java class from Maven dependencies',
                inputSchema: {
                    type: 'object',
                    properties: {
                        className: {
                            type: 'string',
                            description: 'Fully qualified class name (e.g., java.util.ArrayList)',
                        },
                        module: {
                            type: 'string',
                            description: 'Optional module name (e.g., "ume-rentcar-api") to search in a specific module\'s dependencies',
                        },
                    },
                    required: ['className'],
                },
            },
            {
                name: 'list_project_dependencies',
                description: 'List all Maven dependencies for the current project',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pomPath: {
                            type: 'string',
                            description: 'Path to pom.xml (optional, defaults to workspace root)',
                        },
                    },
                },
            },
            {
                name: 'search_classes_in_jar',
                description: 'Search for classes matching a pattern in a JAR file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        jarPath: {
                            type: 'string',
                            description: 'Path to the JAR file',
                        },
                        searchPattern: {
                            type: 'string',
                            description: 'Search pattern (supports wildcards)',
                        },
                    },
                    required: ['jarPath', 'searchPattern'],
                },
            },
        ],
    };
});
// Handle tool calls
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'find_class_definition':
                return await tools.findClassDefinition(args);
            case 'list_project_dependencies':
                return await tools.listProjectDependencies(args);
            case 'search_classes_in_jar':
                return await tools.searchClassesInJar(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});
// List available resources
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: 'maven://dependencies',
                name: 'Maven Dependencies',
                description: 'List of all Maven dependencies for the project',
                mimeType: 'application/json',
            },
        ],
    };
});
// Handle resource reads
server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
        if (uri.startsWith('maven://dependencies')) {
            const dependencies = await tools.listProjectDependencies({});
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(dependencies, null, 2),
                    },
                ],
            };
        }
        throw new Error(`Unknown resource: ${uri}`);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            contents: [
                {
                    uri,
                    mimeType: 'text/plain',
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});
// Start the server
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error(`[${WORKSPACE_NAME}] MCP Server connected and ready`);
}
main().catch((error) => {
    console.error(`[${WORKSPACE_NAME}] Fatal error:`, error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map