import JSZip from "jszip";

export function createArchive(results) {
	const zip = new JSZip();
	const used = new Set();
	for (const result of results) {
		// Use leaf names and check generated suffixes against existing entries too.
		const name = result.name.split(/[\\/]/).pop() || "output";
		const dot = name.lastIndexOf(".");
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : "";
		let unique = name;
		let index = 2;
		while (used.has(unique)) unique = `${stem} (${index++})${ext}`;
		used.add(unique);
		zip.file(unique, result.blob);
	}
	return zip;
}
