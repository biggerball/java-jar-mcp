import * as fs from 'fs';
import { createRequire } from 'module';
import { JavaClassFileReader, JavaClassFile, ConstantType, Utf8Info, ClassInfo, NameAndTypeInfo } from 'java-class-tools';

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
			sourceCode: classInfo.sourceCode,
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
	 * Parse class file to extract metadata and generate source code
	 */
	async parseClassFile(className: string, jarPath: string): Promise<{ methods: MethodInfo[]; fields: FieldInfo[]; sourceCode?: string }> {
		try {
			const AdmZip = require('adm-zip');
			const zip = new AdmZip(jarPath);
			const classPath = className.replace(/\./g, '/') + '.class';
			const entry = zip.getEntry(classPath);

			if (!entry) {
				return { methods: [], fields: [] };
			}

			const classFileBuffer = entry.getData();
			const reader = new JavaClassFileReader();
			const classFile = reader.read(classFileBuffer);

			// Helper function to get UTF-8 string from constant pool
			const getUtf8 = (index: number): string => {
				const utf8Info = classFile.constant_pool[index] as Utf8Info;
				if (!utf8Info || utf8Info.tag !== ConstantType.UTF8) {
					return '';
				}
				return String.fromCharCode.apply(null, utf8Info.bytes);
			};

			// Helper function to get class name from constant pool
			const getClassName = (index: number): string => {
				const classInfo = classFile.constant_pool[index] as ClassInfo;
				if (!classInfo || classInfo.tag !== ConstantType.CLASS) {
					return '';
				}
				return getUtf8(classInfo.name_index).replace(/\//g, '.');
			};

			// Extract methods
			const methods: MethodInfo[] = [];
			for (const method of classFile.methods) {
				const methodName = getUtf8(method.name_index);
				const descriptor = getUtf8(method.descriptor_index);
				
				// Parse descriptor to get return type and parameters
				const { returnType, parameters } = this.parseMethodDescriptor(descriptor);
				
				// Extract access flags
				const modifiers = this.getAccessFlags(method.access_flags);
				
				methods.push({
					name: methodName,
					parameters,
					returnType,
					modifiers,
				});
			}

			// Extract fields
			const fields: FieldInfo[] = [];
			for (const field of classFile.fields) {
				const fieldName = getUtf8(field.name_index);
				const descriptor = getUtf8(field.descriptor_index);
				const fieldType = this.parseFieldDescriptor(descriptor);
				const modifiers = this.getAccessFlags(field.access_flags);
				
				fields.push({
					name: fieldName,
					type: fieldType,
					modifiers,
				});
			}

			// Generate source code from class file
			const sourceCode = this.generateSourceCodeFromClassFile(classFile, className, methods, fields, getUtf8, getClassName);

			return { methods, fields, sourceCode };
		} catch (error) {
			console.error(`Failed to parse class file ${className} from ${jarPath}:`, error);
			return { methods: [], fields: [] };
		}
	}

	/**
	 * Parse method descriptor to extract return type and parameters
	 */
	private parseMethodDescriptor(descriptor: string): { returnType: string; parameters: string[] } {
		// Method descriptor format: (paramTypes)returnType
		// Example: (Ljava/lang/String;I)V
		const match = descriptor.match(/^\((.*)\)(.+)$/);
		if (!match) {
			return { returnType: 'void', parameters: [] };
		}

		const paramDescriptors = match[1];
		const returnDescriptor = match[2];

		// Parse parameters
		const parameters: string[] = [];
		let i = 0;
		while (i < paramDescriptors.length) {
			const { type, nextIndex } = this.parseTypeDescriptor(paramDescriptors, i);
			parameters.push(type);
			i = nextIndex;
		}

		// Parse return type
		const { type: returnType } = this.parseTypeDescriptor(returnDescriptor, 0);

		return { returnType, parameters };
	}

	/**
	 * Parse a single type descriptor
	 */
	private parseTypeDescriptor(descriptor: string, startIndex: number): { type: string; nextIndex: number } {
		if (startIndex >= descriptor.length) {
			return { type: 'void', nextIndex: startIndex };
		}

		const char = descriptor[startIndex];

		switch (char) {
			case 'B':
				return { type: 'byte', nextIndex: startIndex + 1 };
			case 'C':
				return { type: 'char', nextIndex: startIndex + 1 };
			case 'D':
				return { type: 'double', nextIndex: startIndex + 1 };
			case 'F':
				return { type: 'float', nextIndex: startIndex + 1 };
			case 'I':
				return { type: 'int', nextIndex: startIndex + 1 };
			case 'J':
				return { type: 'long', nextIndex: startIndex + 1 };
			case 'S':
				return { type: 'short', nextIndex: startIndex + 1 };
			case 'Z':
				return { type: 'boolean', nextIndex: startIndex + 1 };
			case 'V':
				return { type: 'void', nextIndex: startIndex + 1 };
			case 'L':
				// Object type: Lpackage/name/ClassName;
				const endIndex = descriptor.indexOf(';', startIndex);
				if (endIndex === -1) {
					return { type: 'Object', nextIndex: startIndex + 1 };
				}
				const className = descriptor.substring(startIndex + 1, endIndex).replace(/\//g, '.');
				return { type: className, nextIndex: endIndex + 1 };
			case '[':
				// Array type: [type
				const { type: elementType, nextIndex } = this.parseTypeDescriptor(descriptor, startIndex + 1);
				return { type: `${elementType}[]`, nextIndex };
			default:
				return { type: 'Object', nextIndex: startIndex + 1 };
		}
	}

	/**
	 * Parse field descriptor
	 */
	private parseFieldDescriptor(descriptor: string): string {
		const { type } = this.parseTypeDescriptor(descriptor, 0);
		return type;
	}

	/**
	 * Get access flags as string array
	 */
	private getAccessFlags(flags: number): string[] {
		const modifiers: string[] = [];
		
		// Java access flags (order matters for readability)
		// Access modifiers first
		if (flags & 0x0001) modifiers.push('public');
		else if (flags & 0x0002) modifiers.push('private');
		else if (flags & 0x0004) modifiers.push('protected');
		
		// Other modifiers
		if (flags & 0x0008) modifiers.push('static');
		if (flags & 0x0010) modifiers.push('final');
		if (flags & 0x0020) modifiers.push('synchronized');
		if (flags & 0x0100) modifiers.push('native');
		if (flags & 0x0400) modifiers.push('abstract');
		if (flags & 0x0800) modifiers.push('strictfp');
		
		// Default to public if no access modifier specified
		if (!modifiers.some(m => ['public', 'private', 'protected'].includes(m))) {
			modifiers.unshift('public');
		}
		
		return modifiers;
	}

	/**
	 * Generate source code from class file information
	 */
	private generateSourceCodeFromClassFile(
		classFile: JavaClassFile,
		className: string,
		methods: MethodInfo[],
		fields: FieldInfo[],
		getUtf8: (index: number) => string,
		getClassName: (index: number) => string
	): string {
		const packageName = this.getPackageName(className);
		const simpleClassName = this.getSimpleClassName(className);
		
		// Get class access flags (filter out method-only modifiers)
		const allModifiers = this.getAccessFlags(classFile.access_flags);
		// Remove modifiers that don't apply to classes (synchronized, native)
		const classModifiers = allModifiers.filter(m => !['synchronized', 'native'].includes(m));
		const isInterface = (classFile.access_flags & 0x0200) !== 0;
		const isEnum = (classFile.access_flags & 0x4000) !== 0;
		
		let sourceCode = '';
		
		// Package declaration
		if (packageName) {
			sourceCode += `package ${packageName};\n\n`;
		}
		
		// Class declaration
		const classKeyword = isInterface ? 'interface' : isEnum ? 'enum' : 'class';
		// Ensure we have at least 'public' if no access modifier
		const modifiersStr = classModifiers.length > 0 ? classModifiers.join(' ') : 'public';
		sourceCode += `${modifiersStr} ${classKeyword} ${simpleClassName}`;
		
		// Superclass (if any)
		if (classFile.super_class !== 0 && !isInterface && !isEnum) {
			const superClassName = getClassName(classFile.super_class);
			if (superClassName !== 'java.lang.Object') {
				sourceCode += ` extends ${superClassName}`;
			}
		}
		
		// Interfaces
		if (classFile.interfaces && classFile.interfaces.length > 0) {
			const interfaces = classFile.interfaces
				.map((idx: number) => getClassName(idx))
				.join(', ');
			sourceCode += isInterface ? ` extends ${interfaces}` : ` implements ${interfaces}`;
		}
		
		sourceCode += ' {\n\n';
		
		// Fields
		if (fields.length > 0) {
			for (const field of fields) {
				const modifiersStr = field.modifiers.join(' ');
				sourceCode += `    ${modifiersStr ? modifiersStr + ' ' : ''}${field.type} ${field.name};\n`;
			}
			sourceCode += '\n';
		}
		
		// Methods
		for (const method of methods) {
			const modifiersStr = method.modifiers.join(' ');
			const paramsStr = method.parameters.join(', ');
			sourceCode += `    ${modifiersStr ? modifiersStr + ' ' : ''}${method.returnType} ${method.name}(${paramsStr}) {\n`;
			sourceCode += `        // Method body not available from compiled class\n`;
			sourceCode += `    }\n\n`;
		}
		
		sourceCode += '}';
		
		return sourceCode;
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
