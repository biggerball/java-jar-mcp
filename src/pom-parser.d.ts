declare module 'pom-parser' {
	interface ParseOptions {
		filePath: string;
	}

	interface PomResponse {
		pomObject: any;
	}

	function parse(options: ParseOptions, callback: (err: Error | null, pomResponse: PomResponse) => void): void;

	const pomParser: {
		parse: typeof parse;
	};

	export default pomParser;
}
