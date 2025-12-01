import Papa from "papaparse";
import * as XLSX from "xlsx";

const createXlsxFile = (worksheet) => {
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, worksheet, "Sheet1");
	const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
	const mime =
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	// XLSX.write returns a Uint8Array when type is "array", which has a .buffer property.
	// If it returned a raw ArrayBuffer, we'd use that directly.
	const outBuffer = data.buffer ? data.buffer : data;

	return { mime, outBuffer };
};

self.onmessage = async (e) => {
	const { action } = e.data;
	if (action !== "convert") return;

	try {
		const { filename, target, ext, text, arrayBuffer } = e.data;

		const outName = `${filename.replace(/\.[^.]+$/, "")}.${target}`;
		let mime = "application/octet-stream";
		let outBuffer;

		if (ext === "json") {
			const json =
				typeof text === "string"
					? JSON.parse(text)
					: JSON.parse(new TextDecoder().decode(arrayBuffer));
			if (target === "csv") {
				const csv = Papa.unparse(json);
				mime = "text/csv;charset=utf-8;";
				outBuffer = new TextEncoder().encode(csv).buffer;
			} else if (target === "xlsx") {
				({ mime, outBuffer } = createXlsxFile(XLSX.utils.json_to_sheet(json)));
			}
		} else if (ext === "csv") {
			const csvText =
				typeof text === "string" ? text : new TextDecoder().decode(arrayBuffer);
			if (target === "json") {
				const res = Papa.parse(csvText, {
					header: true,
					dynamicTyping: true,
					skipEmptyLines: true,
				});
				const json = res.data;
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8;";
				outBuffer = new TextEncoder().encode(jsonStr).buffer;
			} else if (target === "xlsx") {
				// Directly convert CSV text to a worksheet
				const ws = XLSX.utils.csv_to_sheet(csvText);
				({ mime, outBuffer } = createXlsxFile(ws));
			}
		} else if (ext === "xlsx" || ext === "xls") {
			const ab = arrayBuffer;
			const wb = XLSX.read(ab, { type: "array" });
			// Note: Only converting the first sheet.
			const first = wb.SheetNames[0];
			const ws = wb.Sheets[first];
			if (target === "json") {
				const json = XLSX.utils.sheet_to_json(ws, { defval: null });
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8;";
				outBuffer = new TextEncoder().encode(jsonStr).buffer;
			} else if (target === "csv") {
				const csv = XLSX.utils.sheet_to_csv(ws);
				mime = "text/csv;charset=utf-8;";
				outBuffer = new TextEncoder().encode(csv).buffer;
			}
		} else {
			throw new Error("Unsupported input format");
		}

		// Transfer the array buffer back to the main thread
		postMessage(
			{ status: "done", filename: outName, buffer: outBuffer, mime },
			[outBuffer],
		);
	} catch (err) {
		postMessage({ status: "error", message: err.message || String(err) });
	}
};
