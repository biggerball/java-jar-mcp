import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pomParser from 'pom-parser';

export interface MavenDependency {
	groupId: string;
	artifactId: string;
	version: string;
	scope?: string;
	classifier?: string;
	optional?: boolean;
	exclusions?: Array<{ groupId: string; artifactId: string }>;
	depth?: number; // 依赖深度，用于版本冲突处理
}

export interface PomContext {
	properties: Map<string, string>;
	dependencyManagement: Map<string, MavenDependency>;
	parent?: {
		groupId: string;
		artifactId: string;
		version: string;
		relativePath?: string;
	};
}

export interface DependencyNode {
	dependency: MavenDependency;
	transitive: DependencyNode[];
}

export interface ParseOptions {
	includeTransitive?: boolean;
	scopes?: string[];
	maxDepth?: number;
}

export class MavenParser {
	private cache: Map<string, MavenDependency[]>;
	private pomCache: Map<string, any>; // 缓存解析的 pom 对象
	private mavenRepoPath: string;

	constructor(mavenRepoPath?: string) {
		this.cache = new Map();
		this.pomCache = new Map();
		// 如果没有提供，使用默认路径或从环境变量获取
		this.mavenRepoPath = mavenRepoPath || process.env.MAVEN_REPO_PATH || path.join(os.homedir(), '.m2', 'repository');
	}

	/**
	 * Parse pom.xml and extract dependencies (with transitive dependency support)
	 */
	async parsePom(pomPath?: string, options?: ParseOptions): Promise<MavenDependency[]> {
		if (!pomPath) {
			throw new Error('pomPath is required');
		}

		const actualPomPath = path.resolve(pomPath);
		const opts: ParseOptions = {
			includeTransitive: options?.includeTransitive !== false,
			scopes: options?.scopes || ['compile', 'runtime'],
			maxDepth: options?.maxDepth || 10,
		};

		// Build cache key including options
		const cacheKey = `${actualPomPath}:${JSON.stringify(opts)}`;

		// Check cache
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}

		try {
			// 1. Parse current pom.xml
			const project = await this.parsePomFile(actualPomPath);

			// 2. Parse parent pom (if exists)
			const parentContext = await this.parseParentPom(project, actualPomPath);

			// 3. Build PomContext (merge properties and dependencyManagement)
			const properties = this.extractProperties(project, parentContext || undefined);
			const dependencyManagement = this.extractDependencyManagement(project, parentContext || undefined);
			const context: PomContext = {
				properties,
				dependencyManagement,
				parent: parentContext?.parent,
			};

			// 4. Parse direct dependencies
			const directDependencies: MavenDependency[] = [];
			const projectDeps = project.dependencies || project.Dependencies;

			if (projectDeps && projectDeps.dependency) {
				const deps = Array.isArray(projectDeps.dependency)
					? projectDeps.dependency
					: [projectDeps.dependency];

				for (const dep of deps) {
					const groupIdRaw = dep.groupId || dep.groupid || '';
					const artifactIdRaw = dep.artifactId || dep.artifactid || '';
					const versionRaw = dep.version || dep.Version || '';
					const scopeRaw = dep.scope || dep.Scope || 'compile';
					const optionalRaw = dep.optional || dep.Optional === 'true' || dep.Optional === true;
					const classifierRaw = dep.classifier || dep.Classifier;

					// Extract exclusions
					const exclusions: Array<{ groupId: string; artifactId: string }> = [];
					if (dep.exclusions && dep.exclusions.exclusion) {
						const exclArray = Array.isArray(dep.exclusions.exclusion)
							? dep.exclusions.exclusion
							: [dep.exclusions.exclusion];
						for (const excl of exclArray) {
							exclusions.push({
								groupId: excl.groupId || excl.groupid || '*',
								artifactId: excl.artifactId || excl.artifactid || '*',
							});
						}
					}

					const groupId = this.resolveProperty(groupIdRaw, project, context);
					const artifactId = this.resolveProperty(artifactIdRaw, project, context);
					let version = this.resolveProperty(versionRaw, project, context);

					// Apply dependencyManagement
					const depMgmtKey = `${groupId}:${artifactId}`;
					const managedDep = context.dependencyManagement.get(depMgmtKey);
					if (managedDep) {
						if (!version && managedDep.version) {
							version = managedDep.version;
						}
						if (managedDep.scope && !scopeRaw) {
							// Only apply scope from dependencyManagement if not specified
						}
					}

					if (groupId && artifactId && version) {
						const mavenDep: MavenDependency = {
							groupId,
							artifactId,
							version,
							scope: scopeRaw,
							optional: optionalRaw,
							classifier: classifierRaw,
							exclusions: exclusions.length > 0 ? exclusions : undefined,
							depth: 0,
						};

						directDependencies.push(mavenDep);
					}
				}
			}

			// 5. Resolve transitive dependencies (if enabled)
			let allDependencies: MavenDependency[] = [...directDependencies];

			if (opts.includeTransitive) {
				const transitiveDeps: MavenDependency[] = [];
				const visited = new Set<string>();

				for (const directDep of directDependencies) {
					if (!directDep.optional) {
						const transitive = await this.resolveTransitiveDependencies(
							directDep,
							context,
							visited,
							0,
							opts.maxDepth!,
							directDep.exclusions
						);
						transitiveDeps.push(...transitive);
					}
				}

				allDependencies = [...directDependencies, ...transitiveDeps];
			}

			// 6. Apply dependency mediation (version conflict resolution)
			allDependencies = this.resolveVersionConflict(allDependencies);

			// 7. Apply scope filtering
			allDependencies = this.filterByScope(allDependencies, opts.scopes!);

			// Cache result
			this.cache.set(cacheKey, allDependencies);
			return allDependencies;
		} catch (error) {
			throw new Error(`Failed to parse pom.xml at ${actualPomPath}: ${error}`);
		}
	}

	/**
	 * Resolve Maven properties with support for built-in properties and parent pom properties
	 */
	private resolveProperty(value: string, project: any, context?: PomContext): string {
		if (!value || typeof value !== 'string') {
			return value || '';
		}

		if (!value.includes('${')) {
			return value;
		}

		// Resolve all property references in the value
		let result = value;
		const propertyRegex = /\$\{([^}]+)\}/g;
		let match;

		while ((match = propertyRegex.exec(value)) !== null) {
			const propName = match[1];
			let propValue: string | undefined;

			// 1. Check built-in Maven properties
			if (propName === 'project.version' || propName === 'pom.version') {
				propValue = project.version || project.Version || '';
			} else if (propName === 'project.groupId' || propName === 'pom.groupId') {
				propValue = project.groupId || project.groupid || '';
			} else if (propName === 'project.artifactId' || propName === 'pom.artifactId') {
				propValue = project.artifactId || project.artifactid || '';
			} else if (propName === 'project.parent.version' || propName === 'pom.parent.version') {
				const parent = project.parent || project.Parent;
				propValue = parent?.version || parent?.Version || '';
			} else if (propName === 'project.parent.groupId' || propName === 'pom.parent.groupId') {
				const parent = project.parent || project.Parent;
				propValue = parent?.groupId || parent?.groupid || '';
			} else if (propName === 'project.parent.artifactId' || propName === 'pom.parent.artifactId') {
				const parent = project.parent || project.Parent;
				propValue = parent?.artifactId || parent?.artifactid || '';
			} else {
				// 2. Check project properties
				const properties = project.properties || project.Properties || {};
				propValue = properties[propName] || properties[propName.toLowerCase()];

				// 3. Check context properties (from parent pom)
				if (!propValue && context) {
					propValue = context.properties.get(propName);
				}
			}

			if (propValue) {
				result = result.replace(match[0], propValue);
			}
		}

		// Recursively resolve nested properties
		if (result.includes('${') && result !== value) {
			return this.resolveProperty(result, project, context);
		}

		return result;
	}

	/**
	 * Find parent pom.xml from a given pom.xml path (filesystem-based)
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

	/**
	 * Locate pom.xml file in Maven repository for a dependency
	 */
	async locatePomInRepository(dependency: MavenDependency): Promise<string | null> {
		const { groupId, artifactId, version } = dependency;
		if (!groupId || !artifactId || !version) {
			return null;
		}

		// Build Maven repository path: groupId/artifactId/version/artifactId-version.pom
		const groupPath = groupId.replace(/\./g, '/');
		const pomPath = path.join(
			this.mavenRepoPath,
			groupPath,
			artifactId,
			version,
			`${artifactId}-${version}.pom`
		);

		try {
			await fs.promises.access(pomPath, fs.constants.F_OK);
			return pomPath;
		} catch {
			return null;
		}
	}

	/**
	 * Parse a pom.xml file and return the parsed object
	 */
	private async parsePomFile(pomPath: string): Promise<any> {
		const cacheKey = pomPath;
		
		// Check cache
		if (this.pomCache.has(cacheKey)) {
			return this.pomCache.get(cacheKey);
		}

		return new Promise((resolve, reject) => {
			pomParser.parse({ filePath: pomPath }, (err: Error | null, pomResponse: any) => {
				if (err) {
					reject(new Error(`Failed to parse pom.xml at ${pomPath}: ${err}`));
					return;
				}

				const pomObject = pomResponse.pomObject;
				const project = pomObject.project || pomObject;
				
				// Cache the result
				this.pomCache.set(cacheKey, project);
				resolve(project);
			});
		});
	}

	/**
	 * Extract dependencyManagement from project and merge with parent context
	 */
	private extractDependencyManagement(project: any, parentContext?: PomContext): Map<string, MavenDependency> {
		const depMgmtMap = new Map<string, MavenDependency>();

		// Start with parent's dependencyManagement (if exists)
		if (parentContext) {
			parentContext.dependencyManagement.forEach((dep, key) => {
				depMgmtMap.set(key, { ...dep });
			});
		}

		// Extract from current project
		const depMgmt = project.dependencyManagement || project.DependencyManagement;
		if (depMgmt && depMgmt.dependencies) {
			const deps = depMgmt.dependencies.dependency || [];
			const depArray = Array.isArray(deps) ? deps : [deps];

			for (const dep of depArray) {
				const groupIdRaw = dep.groupId || dep.groupid || '';
				const artifactIdRaw = dep.artifactId || dep.artifactid || '';
				const versionRaw = dep.version || dep.Version || '';
				const scopeRaw = dep.scope || dep.Scope;

				const groupId = this.resolveProperty(groupIdRaw, project, parentContext);
				const artifactId = this.resolveProperty(artifactIdRaw, project, parentContext);
				const version = this.resolveProperty(versionRaw, project, parentContext);

				if (groupId && artifactId) {
					const key = `${groupId}:${artifactId}`;
					const managedDep: MavenDependency = {
						groupId,
						artifactId,
						version: version || '',
						scope: scopeRaw,
					};

					// Current project's dependencyManagement overrides parent's
					depMgmtMap.set(key, managedDep);
				}
			}
		}

		return depMgmtMap;
	}

	/**
	 * Extract properties from project and merge with parent context
	 */
	private extractProperties(project: any, parentContext?: PomContext): Map<string, string> {
		const propertiesMap = new Map<string, string>();

		// Start with parent's properties (if exists)
		if (parentContext) {
			parentContext.properties.forEach((value, key) => {
				propertiesMap.set(key, value);
			});
		}

		// Extract from current project
		const properties = project.properties || project.Properties || {};
		for (const [key, value] of Object.entries(properties)) {
			if (typeof value === 'string') {
				// Resolve property references
				const resolvedValue = this.resolveProperty(value, project, parentContext);
				propertiesMap.set(key, resolvedValue);
			}
		}

		return propertiesMap;
	}

	/**
	 * Parse parent pom recursively and build PomContext
	 */
	private async parseParentPom(project: any, currentPomPath: string): Promise<PomContext | null> {
		const parent = project.parent || project.Parent;
		if (!parent) {
			return null;
		}

		const parentGroupId = parent.groupId || parent.groupid || '';
		const parentArtifactId = parent.artifactId || parent.artifactid || '';
		const parentVersion = parent.version || parent.Version || '';
		const relativePath = parent.relativePath || parent.RelativePath || '../pom.xml';

		if (!parentGroupId || !parentArtifactId || !parentVersion) {
			return null;
		}

		// Try to locate parent pom
		let parentPomPath: string | null = null;

		// First, try relativePath (filesystem-based)
		if (relativePath && relativePath !== '../pom.xml') {
			const currentDir = path.dirname(currentPomPath);
			const relativePomPath = path.resolve(currentDir, relativePath);
			try {
				await fs.promises.access(relativePomPath, fs.constants.F_OK);
				parentPomPath = relativePomPath;
			} catch {
				// Continue to try repository-based lookup
			}
		}

		// If relativePath didn't work, try repository-based lookup
		if (!parentPomPath) {
			const parentDep: MavenDependency = {
				groupId: parentGroupId,
				artifactId: parentArtifactId,
				version: parentVersion,
			};
			parentPomPath = await this.locatePomInRepository(parentDep);
		}

		if (!parentPomPath) {
			return null;
		}

		// Parse parent pom
		let parentProject: any;
		try {
			parentProject = await this.parsePomFile(parentPomPath);
		} catch {
			return null;
		}

		// Recursively parse parent's parent
		const grandParentContext = await this.parseParentPom(parentProject, parentPomPath);

		// Build context for parent
		const parentProperties = this.extractProperties(parentProject, grandParentContext || undefined);
		const parentDepMgmt = this.extractDependencyManagement(parentProject, grandParentContext || undefined);

		const context: PomContext = {
			properties: parentProperties,
			dependencyManagement: parentDepMgmt,
			parent: {
				groupId: parentGroupId,
				artifactId: parentArtifactId,
				version: parentVersion,
				relativePath,
			},
		};

		return context;
	}

	/**
	 * Filter dependencies by scope
	 */
	private filterByScope(dependencies: MavenDependency[], scopes: string[]): MavenDependency[] {
		return dependencies.filter((dep) => {
			const scope = dep.scope || 'compile';
			return scopes.includes(scope);
		});
	}

	/**
	 * Resolve version conflicts using Maven's "nearest definition" rule
	 */
	private resolveVersionConflict(dependencies: MavenDependency[]): MavenDependency[] {
		const dependencyMap = new Map<string, MavenDependency>();

		for (const dep of dependencies) {
			const key = `${dep.groupId}:${dep.artifactId}`;
			const existing = dependencyMap.get(key);

			if (!existing) {
				dependencyMap.set(key, dep);
			} else {
				// Maven's "nearest definition" rule:
				// 1. Choose the dependency with the shallowest depth
				// 2. If depths are equal, keep the first one (already in map)
				const existingDepth = existing.depth ?? 0;
				const newDepth = dep.depth ?? 0;

				if (newDepth < existingDepth) {
					// New dependency is closer, replace
					dependencyMap.set(key, dep);
				}
				// Otherwise, keep existing (first declaration wins at same depth)
			}
		}

		return Array.from(dependencyMap.values());
	}

	/**
	 * Check if a dependency is excluded
	 */
	private isExcluded(dep: MavenDependency, exclusions?: Array<{ groupId: string; artifactId: string }>): boolean {
		if (!exclusions || exclusions.length === 0) {
			return false;
		}

		return exclusions.some(
			(exclusion) =>
				(exclusion.groupId === '*' || exclusion.groupId === dep.groupId) &&
				(exclusion.artifactId === '*' || exclusion.artifactId === dep.artifactId)
		);
	}

	/**
	 * Resolve transitive dependencies recursively
	 */
	private async resolveTransitiveDependencies(
		dependency: MavenDependency,
		context: PomContext,
		visited: Set<string>,
		depth: number,
		maxDepth: number,
		parentExclusions?: Array<{ groupId: string; artifactId: string }>
	): Promise<MavenDependency[]> {
		// Check depth limit
		if (depth >= maxDepth) {
			return [];
		}

		// Check for circular dependencies
		const depKey = `${dependency.groupId}:${dependency.artifactId}`;
		if (visited.has(depKey)) {
			return [];
		}

		// Skip optional dependencies
		if (dependency.optional) {
			return [];
		}

		// Check if this dependency is excluded
		if (this.isExcluded(dependency, parentExclusions)) {
			return [];
		}

		// Locate and parse the dependency's pom.xml
		const depPomPath = await this.locatePomInRepository(dependency);
		if (!depPomPath) {
			return [];
		}

		let depProject: any;
		try {
			depProject = await this.parsePomFile(depPomPath);
		} catch {
			return [];
		}

		// Parse parent pom for this dependency
		const depParentContext = await this.parseParentPom(depProject, depPomPath);

		// Merge contexts
		const mergedContext: PomContext = {
			properties: new Map([...context.properties, ...(depParentContext?.properties || new Map())]),
			dependencyManagement: new Map([
				...context.dependencyManagement,
				...(depParentContext?.dependencyManagement || new Map()),
			]),
		};

		// Extract dependencies from the dependency's pom
		const transitiveDeps: MavenDependency[] = [];
		const projectDeps = depProject.dependencies || depProject.Dependencies;

		if (projectDeps && projectDeps.dependency) {
			const deps = Array.isArray(projectDeps.dependency) ? projectDeps.dependency : [projectDeps.dependency];

			for (const dep of deps) {
				const groupIdRaw = dep.groupId || dep.groupid || '';
				const artifactIdRaw = dep.artifactId || dep.artifactid || '';
				const versionRaw = dep.version || dep.Version || '';
				const scopeRaw = dep.scope || dep.Scope || 'compile';
				const optionalRaw = dep.optional || dep.Optional === 'true' || dep.Optional === true;
				const classifierRaw = dep.classifier || dep.Classifier;

				// Extract exclusions
				const exclusions: Array<{ groupId: string; artifactId: string }> = [];
				if (dep.exclusions && dep.exclusions.exclusion) {
					const exclArray = Array.isArray(dep.exclusions.exclusion)
						? dep.exclusions.exclusion
						: [dep.exclusions.exclusion];
					for (const excl of exclArray) {
						exclusions.push({
							groupId: excl.groupId || excl.groupid || '*',
							artifactId: excl.artifactId || excl.artifactid || '*',
						});
					}
				}

				// Merge exclusions from parent
				const mergedExclusions = [...(parentExclusions || []), ...exclusions];

				const groupId = this.resolveProperty(groupIdRaw, depProject, mergedContext);
				const artifactId = this.resolveProperty(artifactIdRaw, depProject, mergedContext);
				let version = this.resolveProperty(versionRaw, depProject, mergedContext);

				// Apply dependencyManagement
				const depMgmtKey = `${groupId}:${artifactId}`;
				const managedDep = mergedContext.dependencyManagement.get(depMgmtKey);
				if (managedDep) {
					if (!version && managedDep.version) {
						version = managedDep.version;
					}
					if (managedDep.scope) {
						// dependencyManagement scope only applies if not specified in dependency
						if (!versionRaw) {
							// Only apply scope from dependencyManagement if version came from there
						}
					}
				}

				if (groupId && artifactId && version) {
					const transitiveDep: MavenDependency = {
						groupId,
						artifactId,
						version,
						scope: scopeRaw,
						optional: optionalRaw,
						classifier: classifierRaw,
						exclusions: mergedExclusions.length > 0 ? mergedExclusions : undefined,
						depth: depth + 1,
					};

					// Skip if excluded
					if (!this.isExcluded(transitiveDep, mergedExclusions)) {
						transitiveDeps.push(transitiveDep);
					}
				}
			}
		}

		// Recursively resolve transitive dependencies
		const allTransitive: MavenDependency[] = [...transitiveDeps];
		
		// Mark current dependency as visited to prevent cycles
		visited.add(depKey);

		for (const transitiveDep of transitiveDeps) {
			const transitiveKey = `${transitiveDep.groupId}:${transitiveDep.artifactId}`;
			
			// Skip if already visited (circular dependency)
			if (visited.has(transitiveKey)) {
				continue;
			}

			const nestedTransitive = await this.resolveTransitiveDependencies(
				transitiveDep,
				mergedContext,
				visited, // Use same set to detect cycles
				depth + 1,
				maxDepth,
				transitiveDep.exclusions
			);
			allTransitive.push(...nestedTransitive);
		}

		// Remove from visited set after processing (allows same dependency in different branches)
		visited.delete(depKey);

		return allTransitive;
	}
}
