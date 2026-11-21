import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parse, stringify } from "yaml";

export function rowArray(value) {
	const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : null;
	if (!rows || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
		throw new Error("JSON must be an object or an array of objects for tabular output");
	}
	return rows;
}

export function convertData({ ext, target, text, arrayBuffer }) {
	const warnings = [];
	let value;
	let workbook;
	const src = text ?? (arrayBuffer ? new TextDecoder().decode(arrayBuffer) : "");
	if (ext === "json") value = JSON.parse(src);
	else if (["jsonl", "ndjson"].includes(ext)) {
		value = src.split(/\r?\n/).flatMap((line, index) => {
			if (!line.trim()) return [];
			try {
				return [JSON.parse(line)];
			} catch {
				throw new Error(`Invalid JSON on line ${index + 1}`);
			}
		});
	} else if (["yaml", "yml"].includes(ext)) value = parse(src, { maxAliasCount: 50 });
	else if (["csv", "tsv"].includes(ext)) {
		const result = Papa.parse(src, {
			header: true,
			skipEmptyLines: true,
			delimiter: ext === "tsv" ? "\t" : ",",
		});
		if (result.errors.length) throw new Error(`CSV parse error: ${result.errors[0].message}`);
		value = result.data;
	} else if (["xls", "xlsx"].includes(ext)) {
		workbook = XLSX.read(arrayBuffer, { type: "array" });
		const first = workbook.SheetNames[0];
		if (!first) throw new Error("Workbook has no sheets");
		value = XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: null });
		if (target !== "xlsx" && workbook.SheetNames.length > 1)
			warnings.push(`${workbook.SheetNames.length} sheets found — only "${first}" was exported`);
	} else throw new Error("Unsupported data input");

	let output;
	let mime;
	if (target === "xlsx") {
		if (!workbook) {
			workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rowArray(value)), "Sheet1");
		}
		const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
		const outBuffer = ArrayBuffer.isView(bytes)
			? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
			: bytes;
		return {
			outBuffer,
			mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			warnings,
		};
	}
	if (target === "json") {
		output = JSON.stringify(value, null, 2);
		mime = "application/json;charset=utf-8";
	} else if (target === "yaml" || target === "yml") {
		output = stringify(value);
		mime = "application/yaml;charset=utf-8";
	} else if (target === "jsonl" || target === "ndjson") {
		output = (Array.isArray(value) ? value : [value]).map((row) => JSON.stringify(row)).join("\n");
		mime = "application/x-ndjson;charset=utf-8";
	} else if (["csv", "tsv"].includes(target)) {
		const rows = rowArray(value);
		output = Papa.unparse(rows, { delimiter: target === "tsv" ? "\t" : "," });
		if (rows.length && !output) throw new Error("JSON produced an empty CSV");
		mime = target === "csv" ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8";
	} else throw new Error(`Unsupported conversion: ${ext} to ${target}`);
	return { outBuffer: new TextEncoder().encode(output).buffer, mime, warnings };
}
