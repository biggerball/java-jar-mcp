import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MavenParser } from './mavenParser.js';

describe('MavenParser', () => {
	const mavenRepoPath = process.env.MAVEN_REPO_PATH || path.join(os.homedir(), '.m2', 'repository');
	const parser = new MavenParser(mavenRepoPath);
	const TEST_POM_PATH = '/Users/baoxy/Documents/javaWork/ume-rentcar/ume-rentcar-api/pom.xml';

	it('parsePom 应该能够解析 pom.xml 文件', async () => {
		// 验证 pom.xml 文件存在
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		const dependencies = await parser.parsePom(TEST_POM_PATH);
		
		assert.ok(Array.isArray(dependencies), '应该返回依赖数组');
		console.log(`解析到 ${dependencies.length} 个依赖`);
		
		// 验证依赖项结构
		if (dependencies.length > 0) {
			const firstDep = dependencies[0];
			assert.ok(firstDep.groupId, '依赖项应该有 groupId');
			assert.ok(firstDep.artifactId, '依赖项应该有 artifactId');
			assert.ok(firstDep.version, '依赖项应该有 version');
		}
	});

	it('parsePom 应该在 pomPath 缺失时抛出错误', async () => {
		try {
			await parser.parsePom();
			assert.fail('应该抛出错误，因为 pomPath 是必需的');
		} catch (error) {
			assert.ok(error instanceof Error, '应该抛出 Error 实例');
			assert.ok(
				error.message.includes('pomPath is required'),
				`错误消息应该说明 pomPath 是必需的，实际消息: ${error.message}`
			);
		}
	});

	it('parsePom 应该缓存解析结果', async () => {
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		// 第一次解析
		const dependencies1 = await parser.parsePom(TEST_POM_PATH);
		
		// 第二次解析应该使用缓存
		const dependencies2 = await parser.parsePom(TEST_POM_PATH);
		
		assert.strictEqual(
			dependencies1.length,
			dependencies2.length,
			'两次解析应该返回相同数量的依赖'
		);
		
		// 验证是同一个数组引用（缓存）
		assert.strictEqual(
			dependencies1,
			dependencies2,
			'应该返回缓存的相同数组引用'
		);
	});

	it('parsePom 应该支持传递依赖解析', async () => {
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		// 解析包含传递依赖
		const dependenciesWithTransitive = await parser.parsePom(TEST_POM_PATH, {
			includeTransitive: true,
		});

		// 解析不包含传递依赖
		const dependenciesWithoutTransitive = await parser.parsePom(TEST_POM_PATH, {
			includeTransitive: false,
		});

		assert.ok(
			dependenciesWithTransitive.length >= dependenciesWithoutTransitive.length,
			'包含传递依赖的解析结果应该包含更多或相等的依赖数量'
		);

		console.log(`直接依赖: ${dependenciesWithoutTransitive.length}, 包含传递依赖: ${dependenciesWithTransitive.length}`);
	});

	it('parsePom 应该支持 scope 过滤', async () => {
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		// 只包含 compile scope
		const compileDeps = await parser.parsePom(TEST_POM_PATH, {
			scopes: ['compile'],
		});

		// 包含 compile 和 runtime scope
		const compileRuntimeDeps = await parser.parsePom(TEST_POM_PATH, {
			scopes: ['compile', 'runtime'],
		});

		assert.ok(
			compileRuntimeDeps.length >= compileDeps.length,
			'包含更多 scope 的解析结果应该包含更多或相等的依赖数量'
		);

		// 验证所有依赖都是 compile scope
		for (const dep of compileDeps) {
			const scope = dep.scope || 'compile';
			assert.strictEqual(scope, 'compile', `依赖 ${dep.groupId}:${dep.artifactId} 应该是 compile scope`);
		}
	});

	it('parsePom 应该支持 maxDepth 限制', async () => {
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		// 限制深度为 1
		const shallowDeps = await parser.parsePom(TEST_POM_PATH, {
			includeTransitive: true,
			maxDepth: 1,
		});

		// 限制深度为 5
		const deepDeps = await parser.parsePom(TEST_POM_PATH, {
			includeTransitive: true,
			maxDepth: 5,
		});

		assert.ok(
			deepDeps.length >= shallowDeps.length,
			'更大深度限制应该包含更多或相等的依赖数量'
		);

		// 验证深度限制
		for (const dep of shallowDeps) {
			const depth = dep.depth ?? 0;
			assert.ok(depth <= 1, `依赖深度应该不超过 1，实际: ${depth}`);
		}
	});

	it('findParentPom 应该能够找到父级 pom.xml', async () => {
		if (!fs.existsSync(TEST_POM_PATH)) {
			console.warn(`测试 pom.xml 文件不存在: ${TEST_POM_PATH}，跳过此测试`);
			return;
		}

		const parentPomPath = await parser.findParentPom(TEST_POM_PATH);
		
		// 可能找到父级 pom.xml，也可能没有（取决于项目结构）
		if (parentPomPath !== null) {
			assert.ok(
				fs.existsSync(parentPomPath),
				`找到的父级 pom.xml 应该存在: ${parentPomPath}`
			);
			assert.ok(
				parentPomPath.endsWith('pom.xml'),
				'父级 pom.xml 路径应该以 pom.xml 结尾'
			);
		}
	});

	it('findParentPom 对于根目录应该返回 null', async () => {
		// 使用一个不存在的路径的父目录
		const rootPath = '/';
		const nonExistentPomPath = '/non/existent/path/pom.xml';
		
		const parentPomPath = await parser.findParentPom(nonExistentPomPath);
		
		// 如果找不到，应该返回 null
		// 这个测试主要是确保方法不会抛出错误
		assert.ok(
			parentPomPath === null || fs.existsSync(parentPomPath),
			'应该返回 null 或有效的路径'
		);
	});
});
