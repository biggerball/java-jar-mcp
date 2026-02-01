import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WorkspaceManager } from './workspaceManager';

interface MCPClient {
	process: ChildProcess;
	workspace: vscode.WorkspaceFolder;
}

export class MCPClientManager {
	private clients: Map<string, MCPClient> = new Map();
	private context: vscode.ExtensionContext;
	private workspaceManager: WorkspaceManager;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.workspaceManager = new WorkspaceManager();
	}

	/**
	 * Create an MCP client for a workspace folder
	 */
	async createClient(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		const workspaceUri = workspaceFolder.uri.toString();

		// Check if client already exists
		if (this.clients.has(workspaceUri)) {
			console.log(`MCP client already exists for workspace: ${workspaceFolder.name}`);
			return;
		}

		// Ensure MCP server dependencies are installed
		await this.ensureMCPServerDependencies();

		// Get MCP server path
		const mcpServerPath = this.getMCPServerPath();
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs');
		if (!mcpServerPath || !fs.existsSync(mcpServerPath)) {
			vscode.window.showErrorMessage(`MCP server not found at ${mcpServerPath}. Please build the MCP server first.`);
			return;
		}

		// Prepare environment variables - only MAVEN_REPO_PATH is needed
		const env = {
			...process.env,
			MAVEN_REPO_PATH: this.workspaceManager.getMavenRepositoryPath()
		};

		console.log(`Starting MCP server for workspace: ${workspaceFolder.name}`);
		console.log(`  Maven Repo: ${env.MAVEN_REPO_PATH}`);

		// Register MCP server in VSCode configuration for this workspace folder
		await this.registerMCPServer(workspaceFolder, mcpServerPath, env);

		// Get MCP server directory for proper module resolution
		const mcpServerDir = path.dirname(path.dirname(mcpServerPath)); // mcp-server directory

		// Spawn MCP server process with correct working directory
		const mcpProcess = spawn('node', [mcpServerPath], {
			cwd: mcpServerDir, // Set working directory to mcp-server for proper module resolution
			env,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		// Handle process output
		mcpProcess.stdout.on('data', (data) => {
			console.log(`[MCP ${workspaceFolder.name}] ${data.toString()}`);
		});

		mcpProcess.stderr.on('data', (data) => {
			console.error(`[MCP ${workspaceFolder.name}] ${data.toString()}`);
		});

		// Handle process exit
		mcpProcess.on('exit', (code, signal) => {
			console.log(`MCP server for ${workspaceFolder.name} exited with code ${code}, signal ${signal}`);
			this.clients.delete(workspaceUri);
		});

		// Handle process error
		mcpProcess.on('error', (error) => {
			console.error(`Failed to start MCP server for ${workspaceFolder.name}:`, error);
			vscode.window.showErrorMessage(`Failed to start MCP server: ${error.message}`);
			this.clients.delete(workspaceUri);
		});

		// Store client
		this.clients.set(workspaceUri, {
			process: mcpProcess,
			workspace: workspaceFolder
		});
	}

	/**
	 * Register MCP server in VSCode configuration
	 */
	private async registerMCPServer(workspaceFolder: vscode.WorkspaceFolder, mcpServerPath: string, env: NodeJS.ProcessEnv): Promise<void> {
		try {
			// Get MCP servers configuration for this workspace folder
			const config = vscode.workspace.getConfiguration('mcp', workspaceFolder.uri);
			const servers = config.get<Record<string, any>>('servers') || {};

			// Create server configuration
			const serverName = `java-jar-${workspaceFolder.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
			servers[serverName] = {
				command: 'node',
				args: [mcpServerPath],
				env: {
					MAVEN_REPO_PATH: env.MAVEN_REPO_PATH
				}
			};

			// Update configuration for this workspace folder
			await config.update('servers', servers, vscode.ConfigurationTarget.WorkspaceFolder);
			console.log(`Registered MCP server "${serverName}" for workspace: ${workspaceFolder.name}`);
		} catch (error) {
			console.warn(`Failed to register MCP server in configuration: ${error}`);
			// Continue anyway - the server will still run, just may not be discoverable by VSCode MCP system
		}
	}

	/**
	 * Dispose MCP client for a workspace folder
	 */
	async disposeClient(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		const workspaceUri = workspaceFolder.uri.toString();
		const client = this.clients.get(workspaceUri);

		if (client) {
			console.log(`Disposing MCP client for workspace: ${workspaceFolder.name}`);

			// Unregister MCP server from configuration
			await this.unregisterMCPServer(workspaceFolder);

			// Kill the process
			if (client.process && !client.process.killed) {
				client.process.kill('SIGTERM');
				// Force kill after timeout
				setTimeout(() => {
					if (client.process && !client.process.killed) {
						client.process.kill('SIGKILL');
					}
				}, 5000);
			}

			this.clients.delete(workspaceUri);
		}
	}

	/**
	 * Unregister MCP server from VSCode configuration
	 */
	private async unregisterMCPServer(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('mcp', workspaceFolder.uri);
			const servers = config.get<Record<string, any>>('servers') || {};
			const serverName = `java-jar-${workspaceFolder.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

			if (servers[serverName]) {
				delete servers[serverName];
				await config.update('servers', servers, vscode.ConfigurationTarget.WorkspaceFolder);
				console.log(`Unregistered MCP server "${serverName}" for workspace: ${workspaceFolder.name}`);
			}
		} catch (error) {
			console.warn(`Failed to unregister MCP server from configuration: ${error}`);
		}
	}

	/**
	 * Ensure MCP server dependencies are installed
	 */
	private async ensureMCPServerDependencies(): Promise<void> {
		const extensionPath = this.context.extensionPath;
		const mcpServerDir = path.join(extensionPath, 'mcp-server');
		const nodeModulesPath = path.join(mcpServerDir, 'node_modules');
		const packageJsonPath = path.join(mcpServerDir, 'package.json');
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs');

		// Check if node_modules exists
		if (fs.existsSync(nodeModulesPath) && fs.existsSync(path.join(nodeModulesPath, '@modelcontextprotocol', 'sdk'))) {
			console.log('MCP server dependencies already installed');
			return;
		}

		// Check if package.json exists
		if (!fs.existsSync(packageJsonPath)) {
			console.warn('MCP server package.json not found, skipping dependency installation');
			return;
		}

		// Show progress notification
		const progressOptions: vscode.ProgressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: 'Installing MCP server dependencies...',
			cancellable: false
		};

		await vscode.window.withProgress(progressOptions, async (progress) => {
			progress.report({ increment: 0, message: 'Installing dependencies...' });

			return new Promise<void>((resolve, reject) => {
				console.log(`Installing MCP server dependencies in ${mcpServerDir}`);
				
				// Use npm install --production to only install runtime dependencies
				const installProcess = spawn('npm', ['install', '--production', '--no-audit', '--no-fund'], {
					cwd: mcpServerDir,
					stdio: ['ignore', 'pipe', 'pipe'],
					shell: true
				});

				let output = '';
				installProcess.stdout.on('data', (data) => {
					output += data.toString();
				});

				installProcess.stderr.on('data', (data) => {
					output += data.toString();
				});

				installProcess.on('close', (code) => {
					if (code === 0) {
						console.log('MCP server dependencies installed successfully');
						progress.report({ increment: 100, message: 'Dependencies installed' });
						resolve();
					} else {
						const errorMsg = `Failed to install dependencies: ${output}`;
						console.error(errorMsg);
						vscode.window.showWarningMessage('Failed to install MCP server dependencies. Please install manually: cd mcp-server && npm install --production');
						reject(new Error(errorMsg));
					}
				});

				installProcess.on('error', (error) => {
					const errorMsg = `Failed to spawn npm install: ${error.message}`;
					console.error(errorMsg);
					vscode.window.showWarningMessage('Failed to install MCP server dependencies. Please install manually: cd mcp-server && npm install --production');
					reject(new Error(errorMsg));
				});
			});
		});
	}

	/**
	 * Get the path to the MCP server executable
	 */
	private getMCPServerPath(): string | null {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs');

		// Try to find the MCP server in the extension directory
		const extensionPath = this.context.extensionPath;
		const mcpServerPath = path.join(extensionPath, 'mcp-server', 'dist', 'index.js');
		if (fs.existsSync(mcpServerPath)) {
			return mcpServerPath;
		}

		// Fallback: try relative to current file (for development)
		const relativePath = path.join(__dirname, '..', 'mcp-server', 'dist', 'index.js');
		if (fs.existsSync(relativePath)) {
			return relativePath;
		}

		// Additional fallback: try to find in common extension locations
		const homeDir = os.homedir();
		const possiblePaths = [
			// Cursor extensions
			path.join(homeDir, '.cursor', 'extensions', 'java-jar-mcp.java-jar-mcp-0.0.1', 'mcp-server', 'dist', 'index.js'),
			path.join(homeDir, '.cursor', 'extensions', 'java-jar-mcp-0.0.1', 'mcp-server', 'dist', 'index.js'),
			// VSCode extensions
			path.join(homeDir, '.vscode', 'extensions', 'java-jar-mcp.java-jar-mcp-0.0.1', 'mcp-server', 'dist', 'index.js'),
			path.join(homeDir, '.vscode', 'extensions', 'java-jar-mcp-0.0.1', 'mcp-server', 'dist', 'index.js'),
		];

		for (const possiblePath of possiblePaths) {
			if (fs.existsSync(possiblePath)) {
				return possiblePath;
			}
		}

		console.error(`MCP server not found. Tried: ${mcpServerPath}, ${relativePath}, and common extension paths`);
		return null;
	}

	/**
	 * Dispose all clients
	 */
	dispose(): void {
		console.log('Disposing all MCP clients');
		for (const [uri, client] of this.clients.entries()) {
			if (client.process && !client.process.killed) {
				client.process.kill('SIGTERM');
			}
		}
		this.clients.clear();
	}
}
