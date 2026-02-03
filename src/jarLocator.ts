import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { MavenDependency } from './mavenParser.js';

const require = createRequire(import.meta.url);

export class JarLocator {
	private mavenRepoPath: string;

	constructor(mavenRepoPath: string) {
		this.mavenRepoPath = mavenRepoPath;
	}

	/**
	 * Locate JAR file for a Maven dependency
	 */
	locateJar(dependency: MavenDependency): string | null {
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
	locateSourcesJar(dependency: MavenDependency): string | null {
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
	async findJarForClass(className: string, dependencies: MavenDependency[]): Promise<{ jarPath: string; dependency: MavenDependency } | null> {
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
	async classExistsInJar(jarPath: string, classPath: string): Promise<boolean> {
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
		} catch (error) {
			// Try with yauzl as fallback
			try {
				const yauzl = require('yauzl');
				return new Promise((resolve) => {
					yauzl.open(jarPath, { lazyEntries: true }, (err: Error | null, zipfile: any) => {
						if (err) {
							resolve(false);
							return;
						}

						let found = false;
						zipfile.on('entry', (entry: any) => {
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
			} catch {
				return Promise.resolve(false);
			}
		}
	}
}
