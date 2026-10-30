import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";

// Capture worker -> UI messages, then load the REAL worker module
const sent = [];
globalThis.postMessage = (msg) => {
	sent.push(msg);
};

beforeAll(async () => {
	await import("../src/worker.js");
});

// Drive the real self.onmessage dispatch and return non-log messages
const drive = async (data) => {
	sent.length = 0;
	await self.onmessage({ data: { action: "convert", ...data } });
	return sent.filter((m) => m.status !== "log");
};

const makeWorkbook = (sheets) => {
	const wb = XLSX.utils.book_new();
	for (const [name, rows] of sheets) {
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
	}
	return wb;
};

describe("worker dispatch: spreadsheet conversions", () => {
	it("converts xls to xlsx and keeps every sheet", async () => {
		const wb = makeWorkbook([
			["Sheet1", [{ a: 1 }]],
			["Sheet2", [{ b: 2 }]],
		]);
		const xlsArr = new Uint8Array(
			XLSX.write(wb, { bookType: "xls", type: "array" }),
		);
		const out = await drive({
			filename: "book.xls",
			target: "xlsx",
			ext: "xls",
			arrayBuffer: xlsArr.buffer,
		});

		expect(out).toHaveLength(1);
		expect(out[0].status).toBe("done");
		expect(out[0].filename).toBe("book.xlsx");
		expect(out[0].mime).toContain("spreadsheetml");
		const back = XLSX.read(out[0].buffer, { type: "array" });
		expect(back.SheetNames).toEqual(["Sheet1", "Sheet2"]);
	});

	it("refuses unhandled pairings instead of downloading junk", async () => {
		const out = await drive({
			filename: "t.csv",
			target: "csv",
			ext: "csv",
			text: "a,b\n1,2",
		});

		expect(out).toHaveLength(1);
		expect(out[0].status).toBe("error");
		expect(out[0].message).toContain("Unsupported conversion: csv to csv");
	});
});

describe("worker dispatch: json input normalization", () => {
	it("converts a plain-object json to a one-row csv", async () => {
		const out = await drive({
			filename: "obj.json",
			target: "csv",
			ext: "json",
			text: '{"a": 1, "b": 2}',
		});

		expect(out[0].status).toBe("done");
		const csv = new TextDecoder().decode(out[0].buffer);
		expect(csv).toContain("a,b");
		expect(csv).toContain("1,2");
	});

	it("converts a plain-object json to a one-row xlsx", async () => {
		const out = await drive({
			filename: "obj.json",
			target: "xlsx",
			ext: "json",
			text: '{"a": 1}',
		});

		expect(out[0].status).toBe("done");
		const back = XLSX.read(out[0].buffer, { type: "array" });
		const rows = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]]);
		expect(rows).toEqual([{ a: 1 }]);
	});

	it("still converts arrays of rows", async () => {
		const out = await drive({
			filename: "a.json",
			target: "csv",
			ext: "json",
			text: '[{"a": 1}, {"a": 2}]',
		});

		expect(out[0].status).toBe("done");
		const csv = new TextDecoder().decode(out[0].buffer);
		expect(csv).toContain("1");
		expect(csv).toContain("2");
	});

	it("rejects scalar json instead of faking an output", async () => {
		const out = await drive({
			filename: "n.json",
			target: "csv",
			ext: "json",
			text: "5",
		});

		expect(out[0].status).toBe("error");
		expect(out[0].message).toContain("JSON must be");
	});
});

describe("worker dispatch: data-loss warnings", () => {
	const twoSheets = () => {
		const wb = makeWorkbook([
			["Sheet1", [{ a: 1 }]],
			["Sheet2", [{ b: 2 }]],
		]);
		return new Uint8Array(XLSX.write(wb, { bookType: "xls", type: "array" }))
			.buffer;
	};

	it("warns when a multi-sheet workbook exports only its first sheet", async () => {
		const out = await drive({
			filename: "book.xls",
			target: "json",
			ext: "xls",
			arrayBuffer: twoSheets(),
		});

		expect(out[0].status).toBe("done");
		expect(out[0].warnings.join(" ")).toContain("2 sheets");
		expect(out[0].warnings.join(" ")).toContain("Sheet1");
	});

	it("does not warn when every sheet is preserved on xlsx target", async () => {
		const out = await drive({
			filename: "book.xls",
			target: "xlsx",
			ext: "xls",
			arrayBuffer: twoSheets(),
		});

		expect(out[0].status).toBe("done");
		expect(out[0].warnings).toEqual([]);
	});

	it("stays quiet for single-sheet workbooks", async () => {
		const wb = makeWorkbook([["Only", [{ a: 1 }]]]);
		const arr = new Uint8Array(XLSX.write(wb, { bookType: "xls", type: "array" }));
		const out = await drive({
			filename: "one.xls",
			target: "csv",
			ext: "xls",
			arrayBuffer: arr.buffer,
		});

		expect(out[0].status).toBe("done");
		expect(out[0].warnings).toEqual([]);
	});
});
