import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MCPServerTools } from './tools.js';
import { MavenParser } from './mavenParser.js';
import { JarLocator } from './jarLocator.js';
import { ClassExtractor } from './classExtractor.js';
import * as os from 'os';
import * as path from 'path';

describe('MCPServerTools - findClassDefinition', () => {
	const mavenRepoPath = path.join(os.homedir(), '.m2', 'repository');
	const mavenParser = new MavenParser();
	const jarLocator = new JarLocator(mavenRepoPath);
	const classExtractor = new ClassExtractor();
	const tools = new MCPServerTools(mavenParser, jarLocator, classExtractor);

	console.log('mavenRepoPath:', mavenRepoPath);
	it('应该能够反编译 com.umetrip.mid.umeruler.UmeCommonRuler 类', async () => {
		const className = 'com.umetrip.mid.umeruler.UmeCommonRuler';
		const pomPath = '/Users/baoxy/Documents/javaWork/ume-rentcar/ume-rentcar-api/pom.xml';

		const result = await tools.findClassDefinition({
			className,
			pomPath,
		});

		// 验证结果不为空
		assert(result !== null, '结果不应为空');
		assert(result !== undefined, '结果不应为 undefined');

		// 验证没有错误
		assert(
			!result.isError,
			`不应该返回错误，但得到了: ${JSON.stringify(result)}`
		);

		// 验证返回了内容
		assert(
			result.content && result.content.length > 0,
			'应该返回内容数组'
		);

		// 验证内容格式
		const textContent = result.content.find((c: any) => c.type === 'text');
		assert(textContent !== undefined, '应该包含文本内容');
		assert(
			typeof textContent.text === 'string',
			'文本内容应该是字符串'
		);
		assert(
			textContent.text.length > 0,
			'文本内容不应为空'
		);

		// 验证包含类名
		assert(
			textContent.text.includes(className),
			`应该包含类名 ${className}`
		);

		// 验证包含反编译的源代码（关键要求）
		// 必须包含 "Source Code" 标题和 Java 代码块
		assert(
			textContent.text.includes('Source Code'),
			`应该包含 "Source Code" 标题。实际内容: ${textContent.text.substring(0, 500)}`
		);
		
		// 验证包含 Java 代码块标记
		assert(
			textContent.text.includes('```java'),
			`应该包含 Java 代码块标记 (\`\`\`java)。实际内容: ${textContent.text.substring(0, 1000)}`
		);
		
		// 验证包含类定义关键字（确保是真正的源代码）
		const hasJavaKeywords = textContent.text.includes('public') || 
			textContent.text.includes('class') ||
			textContent.text.includes('private') ||
			textContent.text.includes('protected');
		
		assert(
			hasJavaKeywords,
			`应该包含 Java 关键字（public/class/private/protected）。实际内容: ${textContent.text.substring(0, 1000)}`
		);
		
		// 验证源代码长度合理（反编译的代码应该有一定长度）
		const codeBlockStart = textContent.text.indexOf('```java');
		const codeBlockEnd = textContent.text.indexOf('```', codeBlockStart + 6);
		if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
			const sourceCode = textContent.text.substring(codeBlockStart + 7, codeBlockEnd);
			assert(
				sourceCode.length > 100,
				`反编译的源代码应该有一定长度（至少100字符），实际长度: ${sourceCode.length}`
			);
		}

		// 验证包含 JAR 文件路径信息
		assert(
			textContent.text.includes('JAR File') || textContent.text.includes('.jar'),
			'应该包含 JAR 文件路径信息'
		);

		console.log('测试通过！成功反编译了类:', className);
		console.log('返回内容长度:', textContent.text.length);
		console.log('内容预览:', textContent.text);
	});

	it('当 pomPath 缺失时应该返回错误', async () => {
		const result = await tools.findClassDefinition({
			className: 'com.umetrip.mid.umeruler.UmeCommonRuler',
			// pomPath 缺失
		});

		assert(result !== null, '结果不应为空');
		assert(result.isError === true, '应该返回错误');
		assert(
			result.content && result.content.length > 0,
			'应该返回错误内容'
		);

		const textContent = result.content.find((c: any) => c.type === 'text');
		assert(
			textContent.text.includes('pomPath is required'),
			'错误消息应该说明 pomPath 是必需的'
		);
	});

	it('当类不存在时应该返回适当的错误消息', async () => {
		const result = await tools.findClassDefinition({
			className: 'com.nonexistent.ClassThatDoesNotExist',
			pomPath: '/Users/baoxy/Documents/javaWork/ume-rentcar/ume-rentcar-api/pom.xml',
		});

		// 如果类不存在，应该返回错误或提示信息
		assert(result !== null, '结果不应为空');
		
		const textContent = result.content.find((c: any) => c.type === 'text');
		assert(textContent !== undefined, '应该返回文本内容');
		
		// 应该说明类未找到
		assert(
			textContent.text.includes('not found') || 
			textContent.text.includes('Class') ||
			result.isError === true,
			'应该说明类未找到或返回错误'
		);
	});
});
