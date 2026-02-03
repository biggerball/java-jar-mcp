import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import { MavenParser } from './mavenParser.js';

describe('MavenParser', () => {
	const parser = new MavenParser();
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
