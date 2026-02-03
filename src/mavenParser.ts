import * as fs from 'fs';
import * as path from 'path';
import pomParser from 'pom-parser';

export interface MavenDependency {
	groupId: string;
	artifactId: string;
	version: string;
	scope?: string;
	classifier?: string;
}

export class MavenParser {
	private cache: Map<string, MavenDependency[]>;

	constructor() {
		this.cache = new Map();
	}

	/**
	 * Parse pom.xml and extract dependencies
	 */
	async parsePom(pomPath?: string): Promise<MavenDependency[]> {
		if (!pomPath) {
			throw new Error('pomPath is required');
		}
		const actualPomPath = path.resolve(pomPath);
		const cacheKey = actualPomPath;

		// Check cache
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}

		try {
			return new Promise((resolve, reject) => {
				pomParser.parse({ filePath: actualPomPath }, (err: Error | null, pomResponse: any) => {
					if (err) {
						reject(new Error(`Failed to parse pom.xml at ${actualPomPath}: ${err}`));
						return;
					}

					const dependencies: MavenDependency[] = [];
					const pomObject = pomResponse.pomObject;

					// pom-parser returns structure as pomObject.project.*
					// Also, keys are lowercase (groupid, artifactid, etc.)
					const project = pomObject.project || pomObject;
					const projectDeps = project.dependencies || project.Dependencies;

					// Extract dependencies
					if (projectDeps && projectDeps.dependency) {
						const deps = Array.isArray(projectDeps.dependency)
							? projectDeps.dependency
							: [projectDeps.dependency];

						for (const dep of deps) {
							// Handle both camelCase and lowercase keys
							const groupIdRaw = dep.groupId || dep.groupid || '';
							const artifactIdRaw = dep.artifactId || dep.artifactid || '';
							const versionRaw = dep.version || dep.Version || '';
							const scopeRaw = dep.scope || dep.Scope || 'compile';
							const classifierRaw = dep.classifier || dep.Classifier;

							const groupId = this.resolveProperty(groupIdRaw, project);
							const artifactId = this.resolveProperty(artifactIdRaw, project);
							const version = this.resolveProperty(versionRaw, project);
							const scope = scopeRaw || 'compile';
							const classifier = classifierRaw;

							// Only add dependency if we have groupId, artifactId, and version
							// Note: version might come from parent's dependencyManagement
							if (groupId && artifactId) {
								// If version is missing, try to get from parent or skip
								if (version) {
									dependencies.push({
										groupId,
										artifactId,
										version,
										scope,
										classifier,
									});
								}
							}
						}
					}

					// Cache result
					this.cache.set(cacheKey, dependencies);
					resolve(dependencies);
				});
			});
		} catch (error) {
			throw new Error(`Failed to parse pom.xml at ${actualPomPath}: ${error}`);
		}
	}

	/**
	 * Resolve Maven properties (simplified)
	 */
	private resolveProperty(value: string, project: any): string {
		if (!value || typeof value !== 'string') {
			return value || '';
		}

		if (!value.includes('${')) {
			return value;
		}

		// Simple property resolution
		const propertyMatch = value.match(/\$\{([^}]+)\}/);
		if (propertyMatch) {
			const propName = propertyMatch[1];
			const properties = project.properties || project.Properties || {};

			// Try both camelCase and lowercase property names
			if (properties[propName] || properties[propName.toLowerCase()]) {
				const propValue = properties[propName] || properties[propName.toLowerCase()];
				return value.replace(`\${${propName}}`, propValue);
			}

			// Check parent properties
			const parent = project.parent || project.Parent;
			if (parent) {
				if (propName === 'project.version' && (parent.version || parent.Version)) {
					const parentVersion = parent.version || parent.Version;
					return value.replace(`\${${propName}}`, parentVersion);
				}
			}
		}

		return value;
	}

	/**
	 * Find parent pom.xml from a given pom.xml path
	 */
	async findParentPom(pomPath: string): Promise<string | null> {
		let currentPath = path.dirname(pomPath);
		const rootPath = path.parse(currentPath).root;

		while (currentPath !== rootPath) {
			const parentPomPath = path.join(currentPath, 'pom.xml');
			try {
				await fs.promises.access(parentPomPath, fs.constants.F_OK);
				return parentPomPath;
			} catch {
				// Continue searching
			}
			currentPath = path.dirname(currentPath);
		}

		return null;
	}
}
