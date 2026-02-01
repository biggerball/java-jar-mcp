import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

export class WorkspaceManager {
	private mavenRepoPath: string;

	constructor() {
		this.mavenRepoPath = this.findMavenRepository();
	}

	/**
	 * Check if a workspace folder contains a Maven project (has pom.xml)
	 */
	async isMavenProject(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
		const pomPath = path.join(workspaceFolder.uri.fsPath, 'pom.xml');
		try {
			await fs.promises.access(pomPath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Find the Maven local repository path
	 * Checks ~/.m2/repository first, then looks for settings.xml
	 */
	private findMavenRepository(): string {
		// Default Maven repository location
		const defaultRepo = path.join(os.homedir(), '.m2', 'repository');

		// Check if default location exists
		if (fs.existsSync(defaultRepo)) {
			return defaultRepo;
		}

		// Try to find settings.xml and parse it
		const settingsPath = path.join(os.homedir(), '.m2', 'settings.xml');
		if (fs.existsSync(settingsPath)) {
			try {
				const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
				// Simple regex to find localRepository setting
				const match = settingsContent.match(/<localRepository>(.*?)<\/localRepository>/);
				if (match && match[1]) {
					const repoPath = match[1].trim();
					if (fs.existsSync(repoPath)) {
						return repoPath;
					}
				}
			} catch (error) {
				console.warn('Failed to parse Maven settings.xml:', error);
			}
		}

		// Fallback to default
		return defaultRepo;
	}

	/**
	 * Get the Maven repository path
	 */
	getMavenRepositoryPath(): string {
		return this.mavenRepoPath || path.join(os.homedir(), '.m2', 'repository');
	}

	/**
	 * Find parent pom.xml for multi-module projects
	 */
	async findParentPom(workspaceFolder: vscode.WorkspaceFolder): Promise<string | null> {
		let currentPath = workspaceFolder.uri.fsPath;
		const rootPath = path.parse(currentPath).root;

		while (currentPath !== rootPath) {
			const pomPath = path.join(currentPath, 'pom.xml');
			try {
				await fs.promises.access(pomPath, fs.constants.F_OK);
				return pomPath;
			} catch {
				// Continue searching parent directory
			}
			currentPath = path.dirname(currentPath);
		}

		return null;
	}

	dispose() {
		// Cleanup if needed
	}
}
