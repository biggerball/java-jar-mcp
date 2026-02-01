import * as fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface ClassDefinition {
	className: string;
	packageName: string;
	sourceCode?: string;
	methods: MethodInfo[];
	fields: FieldInfo[];
	jarPath: string;
	isFromSources: boolean;
}

export interface MethodInfo {
	name: string;
	parameters: string[];
	returnType: string;
	modifiers: string[];
}

export interface FieldInfo {
	name: string;
	type: string;
	modifiers: string[];
}

export class ClassExtractor {
	/**
	 * Extract class definition from JAR file
	 */
	async extractClass(className: string, jarPath: string, sourcesJarPath?: string): Promise<ClassDefinition> {
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
	async extractSourceFromJar(className: string, sourcesJarPath: string): Promise<string | null> {
		try {
			const AdmZip = require('adm-zip');
			const zip = new AdmZip(sourcesJarPath);
			const classPath = className.replace(/\./g, '/') + '.java';
			const entry = zip.getEntry(classPath);

			if (entry) {
				return entry.getData().toString('utf-8');
			}
		} catch (error) {
			console.error(`Failed to extract source from ${sourcesJarPath}:`, error);
		}

		return null;
	}

	/**
	 * Parse class file to extract metadata (simplified)
	 */
	async parseClassFile(className: string, jarPath: string): Promise<{ methods: MethodInfo[]; fields: FieldInfo[] }> {
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
	parseMethodsFromSource(sourceCode: string): MethodInfo[] {
		const methods: MethodInfo[] = [];

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
	private removeCommentsAndStrings(sourceCode: string): string {
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
	private extractClassBody(sourceCode: string): string | null {
		let braceCount = 0;
		let classBodyStart = -1;

		for (let i = 0; i < sourceCode.length; i++) {
			const char = sourceCode[i];
			if (char === '{') {
				if (braceCount === 0) {
					classBodyStart = i + 1;
				}
				braceCount++;
			} else if (char === '}') {
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
	private parseMethodsFromClassBody(classBody: string, methods: MethodInfo[]): void {
		// Method definition pattern:
		// [modifiers] [annotations] [generic] returnType methodName(parameters) [throws] {
		// We require modifiers (public/private/protected) to ensure we only match class-level methods
		// Exclude: constructor calls (new), variable declarations, control flow statements
		// Strict pattern: require at least one modifier to ensure we only match class-level methods
		// This avoids matching method body content like "new Type()" or variable declarations
		const methodPattern = /(?:(?:public|private|protected|static|final|synchronized|native|abstract|strictfp)\s+)+(?:@[\w.]+\s+)*(?:<[^>]+>\s+)?([\w.<>\[\]\s,]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{/g;

		const seenMethods = new Set<string>();
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
	private parseParameters(paramsStr: string): string[] {
		if (!paramsStr || !paramsStr.trim()) {
			return [];
		}

		// Split by comma, but be careful with generics
		const parameters: string[] = [];
		let currentParam = '';
		let angleBracketDepth = 0;

		for (let i = 0; i < paramsStr.length; i++) {
			const char = paramsStr[i];
			if (char === '<') {
				angleBracketDepth++;
				currentParam += char;
			} else if (char === '>') {
				angleBracketDepth--;
				currentParam += char;
			} else if (char === ',' && angleBracketDepth === 0) {
				const trimmed = currentParam.trim();
				if (trimmed && !trimmed.includes('=')) { // Exclude default values
					parameters.push(trimmed);
				}
				currentParam = '';
			} else {
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
	private extractModifiers(text: string): string[] {
		const modifiers: string[] = [];
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
	parseFieldsFromSource(sourceCode: string): FieldInfo[] {
		const fields: FieldInfo[] = [];
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
	getSimpleClassName(className: string): string {
		const lastDot = className.lastIndexOf('.');
		return lastDot >= 0 ? className.substring(lastDot + 1) : className;
	}

	/**
	 * Get package name from fully qualified class name
	 */
	getPackageName(className: string): string {
		const lastDot = className.lastIndexOf('.');
		return lastDot >= 0 ? className.substring(0, lastDot) : '';
	}

	/**
	 * Search for classes in a JAR file
	 */
	async searchClassesInJar(jarPath: string, searchPattern: string): Promise<string[]> {
		const classes: string[] = [];
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
		} catch (error) {
			console.error(`Failed to search classes in ${jarPath}:`, error);
		}

		return classes;
	}
}
