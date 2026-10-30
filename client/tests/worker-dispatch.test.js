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
