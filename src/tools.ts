import { LRUCache } from './cache.js';
import { MavenParser, MavenDependency } from './mavenParser.js';
import { JarLocator } from './jarLocator.js';
import { ClassExtractor, ClassDefinition } from './classExtractor.js';

export class MCPServerTools {
	private mavenParser: MavenParser;
	private jarLocator: JarLocator;
	private classExtractor: ClassExtractor;
	private classDefinitionCache: LRUCache<string, ClassDefinition>;
	private dependenciesCache: LRUCache<string, MavenDependency[]>;

	constructor(mavenParser: MavenParser, jarLocator: JarLocator, classExtractor: ClassExtractor) {
		this.mavenParser = mavenParser;
		this.jarLocator = jarLocator;
		this.classExtractor = classExtractor;
		// Initialize caches with reasonable sizes
		this.classDefinitionCache = new LRUCache(50);
		this.dependenciesCache = new LRUCache(10);
	}

	/**
	 * Find class definition tool
	 */
	async findClassDefinition(args: any): Promise<any> {
		const { className, pomPath } = args;

		if (!pomPath) {
			return {
				content: [
					{
						type: 'text',
						text: 'pomPath is required for find_class_definition',
					},
				],
				isError: true,
			};
		}

		// Check cache first (use pomPath-specific cache key)
		const cacheKey = `${pomPath}:${className}`;
		const cached = this.classDefinitionCache.get(cacheKey);
		if (cached) {
			return this.formatClassDefinitionResponse(className, cached);
		}

		try {
			// Get project dependencies from specified pom.xml (including transitive dependencies)
			const dependencies = await this.mavenParser.parsePom(pomPath, {
				includeTransitive: true,
				scopes: ['compile', 'runtime'],
			});

			// Find JAR containing the class
			const jarInfo = await this.jarLocator.findJarForClass(className, dependencies);
			if (!jarInfo) {
				return {
					content: [
						{
							type: 'text',
							text: `Class ${className} not found in dependencies of ${pomPath}.`,
						},
					],
				};
			}

			// Get sources JAR if available
			const sourcesJar = this.jarLocator.locateSourcesJar(jarInfo.dependency);

			// Extract class definition
			const classDef = await this.classExtractor.extractClass(
				className,
				jarInfo.jarPath,
				sourcesJar || undefined
			);

			// Cache the result
			this.classDefinitionCache.set(cacheKey, classDef);

			return this.formatClassDefinitionResponse(className, classDef);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `Error finding class definition: ${errorMessage}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * Format class definition response
	 */
	private formatClassDefinitionResponse(className: string, classDef: ClassDefinition): any {
		let responseText = `# Class Definition: ${className}\n\n`;
		responseText += `**JAR File:** ${classDef.jarPath}\n`;
		responseText += `**Source:** ${classDef.isFromSources ? 'Sources JAR' : 'Compiled Class'}\n`;
		responseText += `**Package:** ${classDef.packageName}\n\n`;

		if (classDef.sourceCode) {
			responseText += `## Source Code\n\n\`\`\`java\n${classDef.sourceCode}\n\`\`\`\n\n`;
		}

		if (classDef.methods.length > 0) {
			responseText += `## Methods\n\n`;
			for (const method of classDef.methods) {
				responseText += `- **${method.name}**(${method.parameters.join(', ')}): ${method.returnType}\n`;
			}
			responseText += '\n';
		}

		if (classDef.fields.length > 0) {
			responseText += `## Fields\n\n`;
			for (const field of classDef.fields) {
				responseText += `- **${field.name}**: ${field.type}\n`;
			}
		}

		return {
			content: [
				{
					type: 'text',
					text: responseText,
				},
			],
		};
	}

	/**
	 * List project dependencies tool
	 */
	async listProjectDependencies(args: any): Promise<any> {
		const { pomPath } = args;

		if (!pomPath) {
			return {
				content: [
					{
						type: 'text',
						text: 'pomPath is required for list_project_dependencies',
					},
				],
				isError: true,
			};
		}

		// Use consistent options for caching (always include transitive dependencies)
		const parseOptions = {
			includeTransitive: true,
			scopes: ['compile', 'runtime'],
		};
		const cacheKey = `${pomPath}:${JSON.stringify(parseOptions)}`;

		// Check cache
		const cached = this.dependenciesCache.get(cacheKey);
		if (cached) {
			return this.formatDependenciesResponse(cached);
		}

		try {
			// Parse dependencies including transitive dependencies
			const dependencies = await this.mavenParser.parsePom(pomPath, parseOptions);
			// Cache the result
			this.dependenciesCache.set(cacheKey, dependencies);
			return this.formatDependenciesResponse(dependencies);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `Error listing dependencies: ${errorMessage}`,
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * Format dependencies response
	 */
	private formatDependenciesResponse(dependencies: MavenDependency[]): any {
		if (dependencies.length === 0) {
			return {
				content: [
					{
						type: 'text',
						text: 'No dependencies found in pom.xml',
					},
				],
			};
		}

		let responseText = `# Maven Dependencies (${dependencies.length} total)\n\n`;

		for (const dep of dependencies) {
			const jarPath = this.jarLocator.locateJar(dep);
			responseText += `## ${dep.groupId}:${dep.artifactId}:${dep.version}\n`;
			responseText += `- **Scope:** ${dep.scope || 'compile'}\n`;
			if (dep.classifier) {
				responseText += `- **Classifier:** ${dep.classifier}\n`;
			}
			if (jarPath) {
				responseText += `- **JAR Path:** ${jarPath}\n`;
			} else {
				responseText += `- **JAR Path:** Not found in local repository\n`;
			}
			responseText += '\n';
		}

		return {
			content: [
				{
					type: 'text',
					text: responseText,
				},
			],
		};
	}

	/**
	 * Search classes in JAR tool
	 */
	async searchClassesInJar(args: any): Promise<any> {
		const { jarPath, searchPattern } = args;

		try {
			const classes = await this.classExtractor.searchClassesInJar(jarPath, searchPattern);

			if (classes.length === 0) {
				return {
					content: [
						{
							type: 'text',
							text: `No classes found matching pattern "${searchPattern}" in ${jarPath}`,
						},
					],
				};
			}

			let responseText = `# Classes matching "${searchPattern}" in ${jarPath}\n\n`;
			responseText += `Found ${classes.length} class(es):\n\n`;
			for (const className of classes) {
				responseText += `- ${className}\n`;
			}

			return {
				content: [
					{
						type: 'text',
						text: responseText,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `Error searching classes: ${errorMessage}`,
					},
				],
				isError: true,
			};
		}
	}
}
