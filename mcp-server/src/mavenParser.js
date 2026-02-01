"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MavenParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pom_parser_1 = __importDefault(require("pom-parser"));
class MavenParser {
    constructor(workspaceFolder) {
        this.cache = new Map();
        this.workspaceFolder = workspaceFolder;
    }
    /**
     * Parse pom.xml and extract dependencies
     */
    async parsePom(pomPath) {
        const actualPomPath = pomPath || path.join(this.workspaceFolder, 'pom.xml');
        const cacheKey = actualPomPath;
        // Check cache
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        try {
            return new Promise((resolve, reject) => {
                pom_parser_1.default.parse({ filePath: actualPomPath }, (err, pomResponse) => {
                    if (err) {
                        reject(new Error(`Failed to parse pom.xml at ${actualPomPath}: ${err}`));
                        return;
                    }
                    const dependencies = [];
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
        }
        catch (error) {
            throw new Error(`Failed to parse pom.xml at ${actualPomPath}: ${error}`);
        }
    }
    /**
     * Resolve Maven properties (simplified)
     */
    resolveProperty(value, project) {
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
     * Find parent pom.xml
     */
    async findParentPom() {
        let currentPath = this.workspaceFolder;
        const rootPath = path.parse(currentPath).root;
        while (currentPath !== rootPath) {
            const pomPath = path.join(currentPath, 'pom.xml');
            try {
                await fs.promises.access(pomPath, fs.constants.F_OK);
                return pomPath;
            }
            catch {
                // Continue searching
            }
            currentPath = path.dirname(currentPath);
        }
        return null;
    }
    /**
     * Find pom.xml for a specific module
     * @param moduleName The name of the module (e.g., "ume-rentcar-api")
     * @returns Path to the module's pom.xml or null if not found
     */
    async findModulePom(moduleName) {
        const modulePomPath = path.join(this.workspaceFolder, moduleName, 'pom.xml');
        try {
            await fs.promises.access(modulePomPath, fs.constants.F_OK);
            return modulePomPath;
        }
        catch {
            return null;
        }
    }
}
exports.MavenParser = MavenParser;
//# sourceMappingURL=mavenParser.js.map