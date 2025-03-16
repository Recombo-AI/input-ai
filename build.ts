import { rm } from "node:fs/promises";

try {
	await rm("./dist", { recursive: true, force: true });

	const result = await Bun.build({
		entrypoints: ["./lib/index.ts"],
		outdir: "./dist",
		sourcemap: "linked",
		minify: true,
		naming: {
			entry: "[dir]/input-ai.[ext]",
			asset: "[dir]/input-ai.[ext]",
		},
		external: ["jsonata"],
	});

	console.log("Build Success 🎉");
	console.table(
		result.outputs.map((file) => ({
			File: file.path.replace(`${process.cwd()}/`, ""),
			Size: `${(file.size / 1024).toFixed(2)} KB`,
		})),
	);
} catch (e) {
	const error = e as AggregateError;
	console.error("Build Failed");
	console.error(error);
}
