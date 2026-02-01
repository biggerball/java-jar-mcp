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
exports.ClassExtractor = void 0;
const fs = __importStar(require("fs"));
const module_1 = require("module");
const require = (0, module_1.createRequire)(import.meta.url);
class ClassExtractor {
    /**
     * Extract class definition from JAR file
     */
    async extractClass(className, jarPath, sourcesJarPath) {
        // Try to get from sources JAR first
        if (sourcesJarPath && fs.existsSync(sourcesJarPath)) {
            const sourceCode = await this.extractSourceFromJar(className, sourcesJarPath);
            if (sourceCode) {
                return {
                    className: this.getSimpleClassName(className),
                    packageName: this.getPackageName(className),
                    sourceCode,
                    methods: this.parseMethodsFromSource(sourceCode),
                    fields: this.parseFieldsFromSource(sourceCode),
                    jarPath: sourcesJarPath,
                    isFromSources: true,
                };
            }
        }
        // Fallback to parsing class file
        const classInfo = await this.parseClassFile(className, jarPath);
        return {
            className: this.getSimpleClassName(className),
            packageName: this.getPackageName(className),
            methods: classInfo.methods,
            fields: classInfo.fields,
            jarPath,
            isFromSources: false,
        };
    }
    /**
     * Extract source code from sources JAR
     */
    async extractSourceFromJar(className, sourcesJarPath) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(sourcesJarPath);
            const classPath = className.replace(/\./g, '/') + '.java';
            const entry = zip.getEntry(classPath);
            if (entry) {
                return entry.getData().toString('utf-8');
            }
        }
        catch (error) {
            console.error(`Failed to extract source from ${sourcesJarPath}:`, error);
        }
        return null;
    }
    /**
     * Parse class file to extract metadata (simplified)
     */
    async parseClassFile(className, jarPath) {
        // For now, return minimal info
        // In a full implementation, we would use java-class-tools or similar
        return {
            methods: [],
            fields: [],
        };
    }
    /**
     * Parse methods from source code
     */
    parseMethodsFromSource(sourceCode) {
        const methods = [];
        // Remove comments and string literals to avoid false matches
        const cleanedCode = this.removeCommentsAndStrings(sourceCode);
        // Find the class body (content between the first opening brace and its matching closing brace)
        const classBody = this.extractClassBody(cleanedCode);
        if (!classBody) {
            return methods;
        }
        // Parse methods from class body
        this.parseMethodsFromClassBody(classBody, methods);
        return methods;
    }
    /**
     * Remove comments and string literals from source code
     */
    removeCommentsAndStrings(sourceCode) {
        let result = sourceCode;
        // Remove single-line comments
        result = result.replace(/\/\/.*$/gm, '');
        // Remove multi-line comments
        result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove string literals (replace with placeholder to preserve structure)
        result = result.replace(/"[^"]*"/g, '""');
        result = result.replace(/'[^']*'/g, "''");
        return result;
    }
    /**
     * Extract class body content
     */
    extractClassBody(sourceCode) {
        let braceCount = 0;
        let classBodyStart = -1;
        for (let i = 0; i < sourceCode.length; i++) {
            const char = sourceCode[i];
            if (char === '{') {
                if (braceCount === 0) {
                    classBodyStart = i + 1;
                }
                braceCount++;
            }
            else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && classBodyStart >= 0) {
                    return sourceCode.substring(classBodyStart, i);
                }
            }
        }
        return null;
    }
    /**
     * Parse methods from class body
     */
    parseMethodsFromClassBody(classBody, methods) {
        // Method definition pattern:
        // [modifiers] [annotations] [generic] returnType methodName(parameters) [throws] {
        // We require modifiers (public/private/protected) to ensure we only match class-level methods
        // Exclude: constructor calls (new), variable declarations, control flow statements
        // Strict pattern: require at least one modifier to ensure we only match class-level methods
        // This avoids matching method body content like "new Type()" or variable declarations
        const methodPattern = /(?:(?:public|private|protected|static|final|synchronized|native|abstract|strictfp)\s+)+(?:@[\w.]+\s+)*(?:<[^>]+>\s+)?([\w.<>\[\]\s,]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{/g;
        const seenMethods = new Set();
        let match;
        while ((match = methodPattern.exec(classBody)) !== null) {
            const returnType = match[1].trim();
            const methodName = match[2];
            const paramsStr = match[3];
            // Skip if return type is "new" (constructor call)
            if (returnType === 'new' || methodName === 'new') {
                continue;
            }
            // Skip common non-method patterns
            if (['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try'].includes(methodName)) {
                continue;
            }
            // Skip Java keywords that might be matched incorrectly
            const javaKeywords = ['class', 'interface', 'enum', 'extends', 'implements', 'import', 'package'];
            if (javaKeywords.includes(methodName)) {
                continue;
            }
            // Check context: ensure this is at class level by checking what comes before
            const beforeMatch = classBody.substring(Math.max(0, match.index - 150), match.index);
            // If we see "new " before this (not part of modifiers), it's likely a constructor call, skip it
            // But allow "new" as part of modifiers like "public static final"
            const beforeTrimmed = beforeMatch.trim();
            if (beforeTrimmed.endsWith('new ') || /\bnew\s+$/.test(beforeTrimmed)) {
                continue;
            }
            // Skip if the return type looks like a variable declaration (e.g., "ParameterizedTypeImpl" without modifiers in context)
            // Check if there's a modifier before the return type
            const hasModifier = /(?:public|private|protected|static|final|synchronized|native|abstract|strictfp)\s+/.test(beforeMatch);
            if (!hasModifier && returnType.split('.').length > 1) {
                // If no modifier and return type is qualified, might be a variable, skip
                continue;
            }
            const methodKey = `${methodName}(${paramsStr})`;
            if (seenMethods.has(methodKey)) {
                continue;
            }
            seenMethods.add(methodKey);
            // Parse parameters
            const parameters = this.parseParameters(paramsStr);
            // Extract modifiers from the match and context
            const modifiers = this.extractModifiers(match[0] + beforeMatch);
            methods.push({
                name: methodName,
                parameters,
                returnType,
                modifiers,
            });
        }
    }
    /**
     * Parse method parameters
     */
    parseParameters(paramsStr) {
        if (!paramsStr || !paramsStr.trim()) {
            return [];
        }
        // Split by comma, but be careful with generics
        const parameters = [];
        let currentParam = '';
        let angleBracketDepth = 0;
        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];
            if (char === '<') {
                angleBracketDepth++;
                currentParam += char;
            }
            else if (char === '>') {
                angleBracketDepth--;
                currentParam += char;
            }
            else if (char === ',' && angleBracketDepth === 0) {
                const trimmed = currentParam.trim();
                if (trimmed && !trimmed.includes('=')) { // Exclude default values
                    parameters.push(trimmed);
                }
                currentParam = '';
            }
            else {
                currentParam += char;
            }
        }
        // Add last parameter
        const trimmed = currentParam.trim();
        if (trimmed && !trimmed.includes('=')) {
            parameters.push(trimmed);
        }
        return parameters;
    }
    /**
     * Extract modifiers from text before method definition
     */
    extractModifiers(text) {
        const modifiers = [];
        const modifierKeywords = [
            'public', 'private', 'protected', 'static', 'final',
            'synchronized', 'native', 'abstract', 'strictfp'
        ];
        for (const keyword of modifierKeywords) {
            // Check if keyword appears as a whole word
            const regex = new RegExp(`\\b${keyword}\\b`);
            if (regex.test(text)) {
                modifiers.push(keyword);
            }
        }
        return modifiers;
    }
    /**
     * Parse fields from source code (simplified)
     */
    parseFieldsFromSource(sourceCode) {
        const fields = [];
        const fieldRegex = /(?:public|private|protected|static|final|\s)*\s*(\w+)\s+(\w+)\s*[=;]/g;
        let match;
        while ((match = fieldRegex.exec(sourceCode)) !== null) {
            const type = match[1];
            const name = match[2];
            fields.push({
                name,
                type,
                modifiers: [],
            });
        }
        return fields;
    }
    /**
     * Get simple class name from fully qualified name
     */
    getSimpleClassName(className) {
        const lastDot = className.lastIndexOf('.');
        return lastDot >= 0 ? className.substring(lastDot + 1) : className;
    }
    /**
     * Get package name from fully qualified class name
     */
    getPackageName(className) {
        const lastDot = className.lastIndexOf('.');
        return lastDot >= 0 ? className.substring(0, lastDot) : '';
    }
    /**
     * Search for classes in a JAR file
     */
    async searchClassesInJar(jarPath, searchPattern) {
        const classes = [];
        const pattern = new RegExp(searchPattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(jarPath);
            const entries = zip.getEntries();
            for (const entry of entries) {
                if (entry.entryName.endsWith('.class')) {
                    const className = entry.entryName
                        .replace(/\.class$/, '')
                        .replace(/\//g, '.');
                    if (pattern.test(className)) {
                        classes.push(className);
                    }
                }
            }
        }
        catch (error) {
            console.error(`Failed to search classes in ${jarPath}:`, error);
        }
        return classes;
    }
}
exports.ClassExtractor = ClassExtractor;
//# sourceMappingURL=classExtractor.js.map