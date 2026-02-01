"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServerTools = void 0;
const cache_js_1 = require("./cache.js");
class MCPServerTools {
    constructor(mavenParser, jarLocator, classExtractor) {
        this.mavenParser = mavenParser;
        this.jarLocator = jarLocator;
        this.classExtractor = classExtractor;
        // Initialize caches with reasonable sizes
        this.classDefinitionCache = new cache_js_1.LRUCache(50);
        this.dependenciesCache = new cache_js_1.LRUCache(10);
    }
    /**
     * Find class definition tool
     */
    async findClassDefinition(args) {
        const { className, module } = args;
        // Check cache first (use module-specific cache key if module is provided)
        const cacheKey = module ? `${module}:${className}` : className;
        const cached = this.classDefinitionCache.get(cacheKey);
        if (cached) {
            return this.formatClassDefinitionResponse(className, cached);
        }
        try {
            // Get project dependencies
            let dependencies;
            if (module) {
                // Find module's pom.xml
                const modulePomPath = await this.mavenParser.findModulePom(module);
                if (!modulePomPath) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Module "${module}" not found in workspace.`,
                            },
                        ],
                        isError: true,
                    };
                }
                dependencies = await this.mavenParser.parsePom(modulePomPath);
            }
            else {
                // Use root pom.xml
                dependencies = await this.mavenParser.parsePom();
            }
            // Find JAR containing the class
            const jarInfo = await this.jarLocator.findJarForClass(className, dependencies);
            if (!jarInfo) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Class ${className} not found in ${module ? `module "${module}"` : 'project'} dependencies.`,
                        },
                    ],
                };
            }
            // Get sources JAR if available
            const sourcesJar = this.jarLocator.locateSourcesJar(jarInfo.dependency);
            // Extract class definition
            const classDef = await this.classExtractor.extractClass(className, jarInfo.jarPath, sourcesJar || undefined);
            // Cache the result
            this.classDefinitionCache.set(cacheKey, classDef);
            return this.formatClassDefinitionResponse(className, classDef);
        }
        catch (error) {
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
    formatClassDefinitionResponse(className, classDef) {
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
    async listProjectDependencies(args) {
        const cacheKey = args.pomPath || 'default';
        // Check cache
        const cached = this.dependenciesCache.get(cacheKey);
        if (cached) {
            return this.formatDependenciesResponse(cached);
        }
        try {
            const dependencies = await this.mavenParser.parsePom(args.pomPath);
            // Cache the result
            this.dependenciesCache.set(cacheKey, dependencies);
            return this.formatDependenciesResponse(dependencies);
        }
        catch (error) {
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
    formatDependenciesResponse(dependencies) {
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
            }
            else {
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
    async searchClassesInJar(args) {
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
        }
        catch (error) {
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
exports.MCPServerTools = MCPServerTools;
//# sourceMappingURL=tools.js.map