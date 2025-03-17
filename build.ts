import { readdir, rm, stat } from "node:fs/promises";

try {
	await rm("./dist", { recursive: true, force: true });

	const result = await Bun.build({
		entrypoints: ["./lib/index.ts", "./lib/index.css"],
		outdir: "./dist",
		sourcemap: "linked",
		minify: true,
		naming: {
			entry: "[dir]/inputai.min.[ext]",
			asset: "[dir]/inputai.[ext]",
		},
	});

	const tsc = Bun.spawn(["bunx", "tsc", "--project", "tsconfig.build.json"]);
	await tsc.exited;

	console.log("Build Success 🎉");

	const fileNames = await readdir("./dist", { withFileTypes: true });
	const stats = fileNames.map(async (fileName) => {
		const file = await stat(`./dist/${fileName.name}`);

		return {
			File: fileName.name,
			Size: `${(file.size / 1024).toFixed(2)} KB`,
		};
	});

	console.table(await Promise.all(stats));
} catch (e) {
	const error = e as AggregateError;
	console.error("Build Failed");
	console.error(error);
}
