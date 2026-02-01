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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JarLocator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const module_1 = require("module");
const require = (0, module_1.createRequire)(import.meta.url);
class JarLocator {
    constructor(mavenRepoPath) {
        this.mavenRepoPath = mavenRepoPath;
    }
    /**
     * Locate JAR file for a Maven dependency
     */
    locateJar(dependency) {
        const { groupId, artifactId, version, classifier } = dependency;
        // Build Maven repository path: groupId/artifactId/version/artifactId-version[-classifier].jar
        const groupPath = groupId.replace(/\./g, '/');
        const versionDir = path.join(this.mavenRepoPath, groupPath, artifactId, version);
        // Try different JAR file names
        const baseName = classifier
            ? `${artifactId}-${version}-${classifier}.jar`
            : `${artifactId}-${version}.jar`;
        const jarPath = path.join(versionDir, baseName);
        if (fs.existsSync(jarPath)) {
            return jarPath;
        }
        // Try without classifier
        const simpleJarPath = path.join(versionDir, `${artifactId}-${version}.jar`);
        if (fs.existsSync(simpleJarPath)) {
            return simpleJarPath;
        }
        return null;
    }
    /**
     * Locate sources JAR file for a Maven dependency
     */
    locateSourcesJar(dependency) {
        const { groupId, artifactId, version } = dependency;
        const groupPath = groupId.replace(/\./g, '/');
        const versionDir = path.join(this.mavenRepoPath, groupPath, artifactId, version);
        const sourcesJarPath = path.join(versionDir, `${artifactId}-${version}-sources.jar`);
        if (fs.existsSync(sourcesJarPath)) {
            return sourcesJarPath;
        }
        return null;
    }
    /**
     * Find JAR file containing a specific class
     */
    async findJarForClass(className, dependencies) {
        // Convert class name to file path (e.g., java.util.ArrayList -> java/util/ArrayList.class)
        const classPath = className.replace(/\./g, '/') + '.class';
        for (const dep of dependencies) {
            const jarPath = this.locateJar(dep);
            if (!jarPath) {
                continue;
            }
            // Check if class exists in JAR
            if (await this.classExistsInJar(jarPath, classPath)) {
                return { jarPath, dependency: dep };
            }
        }
        return null;
    }
    /**
     * Check if a class file exists in a JAR
     */
    async classExistsInJar(jarPath, classPath) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(jarPath);
            const entries = zip.getEntries();
            for (const entry of entries) {
                const entryName = entry.entryName;
                // Check exact match first, then endsWith
                if (entryName === classPath) {
                    return Promise.resolve(true);
                }
                // Use endsWith to handle cases where entryName might have a prefix
                if (entryName.endsWith('/' + classPath) || entryName.endsWith(classPath)) {
                    return Promise.resolve(true);
                }
            }
            // If we get here, class was not found
            return Promise.resolve(false);
        }
        catch (error) {
            // Try with yauzl as fallback
            try {
                const yauzl = require('yauzl');
                return new Promise((resolve) => {
                    yauzl.open(jarPath, { lazyEntries: true }, (err, zipfile) => {
                        if (err) {
                            resolve(false);
                            return;
                        }
                        let found = false;
                        zipfile.on('entry', (entry) => {
                            if (!found) {
                                const fileName = entry.fileName;
                                if (fileName === classPath || fileName.endsWith('/' + classPath) || fileName.endsWith(classPath)) {
                                    found = true;
                                    zipfile.close();
                                    resolve(true);
                                    return;
                                }
                            }
                            zipfile.readEntry();
                        });
                        zipfile.on('end', () => {
                            resolve(found);
                        });
                        zipfile.readEntry();
                    });
                });
            }
            catch {
                return Promise.resolve(false);
            }
        }
    }
}
exports.JarLocator = JarLocator;
//# sourceMappingURL=jarLocator.js.map