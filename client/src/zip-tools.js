import JSZip from "jszip";

export async function inspectZip(file) {
	if (file.size > 80 * 1024 * 1024) throw new Error("ZIP input exceeds 80 MB");
	const zip = await JSZip.loadAsync(await file.arrayBuffer());
	const entries = Object.values(zip.files).filter((entry) => !entry.dir);
	if (entries.length > 200) throw new Error("ZIP preview supports up to 200 files");
	let total = 0;
	for (const entry of entries) {
		const size = entry._data.uncompressedSize;
		if (!Number.isFinite(size) || size < 0 || size > 80 * 1024 * 1024)
			throw new Error("An extracted file exceeds the 80 MB limit");
		total += size;
		if (total > 200 * 1024 * 1024) throw new Error("ZIP expanded size exceeds 200 MB");
	}
	return entries.map((entry) => ({ name: entry.name, size: entry._data.uncompressedSize, entry }));
}

export async function extractEntry(item) {
	const bytes = await item.entry.async("uint8array");
	if (bytes.byteLength > 80 * 1024 * 1024) throw new Error("Extracted file exceeds 80 MB");
	const name = item.name.split(/[\\/]/).pop() || "extracted";
	return new File([bytes], name);
}
