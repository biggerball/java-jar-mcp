#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MavenParser } from './mavenParser.js';
import { JarLocator } from './jarLocator.js';
import { ClassExtractor } from './classExtractor.js';
import { MCPServerTools } from './tools.js';

// Get Maven repository path from environment variables
const MAVEN_REPO_PATH = process.env.MAVEN_REPO_PATH || '';

console.error('MCP Server starting...');
console.error(`Maven Repo: ${MAVEN_REPO_PATH || 'default (~/.m2/repository)'}`);

// Initialize components
const mavenParser = new MavenParser();
const jarLocator = new JarLocator(MAVEN_REPO_PATH);
const classExtractor = new ClassExtractor();
const tools = new MCPServerTools(mavenParser, jarLocator, classExtractor);

// Create MCP server
const server = new Server(
	{
		name: 'java-jar-mcp-server',
		version: '0.0.1',
	},
	{
		capabilities: {
			tools: {},
			resources: {},
		},
	}
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
						pomPath: {
							type: 'string',
							description: 'Path to pom.xml (optional, for multi-workspace support)',
						},
					},
					required: ['className'],
				},
			},
			{
				name: 'list_project_dependencies',
				description: 'List all Maven dependencies for a project',
				inputSchema: {
					type: 'object',
					properties: {
						pomPath: {
							type: 'string',
							description: 'Path to pom.xml file (e.g., "/path/to/project/pom.xml")',
						},
					},
					required: ['pomPath'],
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
	} catch (error) {
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
server.setRequestHandler(ListResourcesRequestSchema, async () => {
	return {
		resources: [
			{
				uri: 'maven://dependencies?pomPath={pomPath}',
				name: 'Maven Dependencies',
				description: 'List of all Maven dependencies for a project. Use format: maven://dependencies?pomPath=/path/to/pom.xml',
				mimeType: 'application/json',
			},
		],
	};
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const { uri } = request.params;

	try {
		if (uri.startsWith('maven://dependencies')) {
			// Parse pomPath from URI query parameter
			// Handle custom protocol by replacing with http:// for URL parsing
			const urlString = uri.replace('maven://', 'http://');
			const url = new URL(urlString);
			const pomPath = url.searchParams.get('pomPath');
			
			if (!pomPath) {
				throw new Error('pomPath parameter is required in resource URI. Use format: maven://dependencies?pomPath=/path/to/pom.xml');
			}

			const dependencies = await tools.listProjectDependencies({ pomPath });
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
	} catch (error) {
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
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('MCP Server connected and ready');
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
