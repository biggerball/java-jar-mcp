import * as vscode from 'vscode';
import { MCPClientManager } from './mcpClientManager';
import { WorkspaceManager } from './workspaceManager';

let mcpClientManager: MCPClientManager | undefined;
let workspaceManager: WorkspaceManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Java JAR MCP Extension is now active');

	workspaceManager = new WorkspaceManager();
	mcpClientManager = new MCPClientManager(context);

	// Initialize MCP clients for existing workspace folders
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		for (const folder of workspaceFolders) {
			if (await workspaceManager.isMavenProject(folder)) {
				await mcpClientManager.createClient(folder);
			}
		}
	}

	// Listen for workspace folder changes
	const disposable = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
		// Handle added folders
		for (const folder of event.added) {
			if (workspaceManager && await workspaceManager.isMavenProject(folder)) {
				await mcpClientManager?.createClient(folder);
			}
		}
		// Handle removed folders
		for (const folder of event.removed) {
			await mcpClientManager?.disposeClient(folder);
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push({
		dispose: () => {
			mcpClientManager?.dispose();
			workspaceManager?.dispose();
		}
	});
}

export function deactivate() {
	mcpClientManager?.dispose();
	workspaceManager?.dispose();
}
