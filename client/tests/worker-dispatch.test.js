import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

// Capture worker -> UI messages, then load the REAL worker module
const sent = [];
globalThis.postMessage = (msg) => {
	sent.push(msg);
};

let buildMediaArgs;

beforeAll(async () => {
	({ buildMediaArgs } = await import("../src/worker.js"));
});

// Drive the real self.onmessage dispatch and return non-log messages.
// onmessage queues work (no return value), so poll for the worker's answer.
const drive = async (data, timeoutMs = 5000) => {
	sent.length = 0;
	self.onmessage({ data: { action: "convert", ...data } });
	const t0 = Date.now();
	while (Date.now() - t0 < timeoutMs) {
		const answered = sent.filter((m) => m.status !== "log");
		if (answered.length) return answered;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error("worker did not answer in time");
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
		const xlsArr = new Uint8Array(XLSX.write(wb, { bookType: "xls", type: "array" }));
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

	it("serializes queued conversions in arrival order", async () => {
		sent.length = 0;
		self.onmessage({
			data: {
				action: "convert",
				filename: "first.json",
				target: "csv",
				ext: "json",
				text: '[{"a": 1}]',
			},
		});
		self.onmessage({
			data: {
				action: "convert",
				filename: "second.json",
				target: "csv",
				ext: "json",
				text: '[{"a": 2}]',
			},
		});

		const t0 = Date.now();
		while (sent.filter((m) => m.status === "done").length < 2 && Date.now() - t0 < 5000) {
			await new Promise((r) => setTimeout(r, 5));
		}
		const dones = sent.filter((m) => m.status === "done");
		expect(dones.map((m) => m.filename)).toEqual(["first.csv", "second.csv"]);
	});
});

describe("worker dispatch: job correlation", () => {
	it("echoes the job id on success", async () => {
		const out = await drive({
			jobId: "job-7",
			filename: "a.json",
			target: "csv",
			ext: "json",
			text: '[{"a": 1}]',
		});

		expect(out[0].status).toBe("done");
		expect(out[0].jobId).toBe("job-7");
	});

	it("echoes the job id on errors too", async () => {
		const out = await drive({
			jobId: "job-8",
			filename: "t.csv",
			target: "csv",
			ext: "csv",
			text: "a,b",
		});

		expect(out[0].status).toBe("error");
		expect(out[0].jobId).toBe("job-8");
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

	it("keeps leading-zero ids and big numbers intact", async () => {
		const out = await drive({
			filename: "ids.csv",
			target: "json",
			ext: "csv",
			text: "id,amount\n007,1234567890123456789",
		});

		expect(out[0].status).toBe("done");
		expect(out[0].mime).toBe("application/json;charset=utf-8");
		const json = new TextDecoder().decode(out[0].buffer);
		expect(json).toContain('"id": "007"');
		expect(json).toContain("1234567890123456789");
	});
});

describe("worker dispatch: data-loss warnings", () => {
	const twoSheets = () => {
		const wb = makeWorkbook([
			["Sheet1", [{ a: 1 }]],
			["Sheet2", [{ b: 2 }]],
		]);
		return new Uint8Array(XLSX.write(wb, { bookType: "xls", type: "array" })).buffer;
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

describe("buildMediaArgs", () => {
	it("stream-copies same-extension remuxes untouched", () => {
		const args = buildMediaArgs({
			inputName: "input.mp4",
			outputName: "output.mp4",
			fromExt: "mp4",
			toExt: "mp4",
		});
		expect(args).toEqual(["-y", "-threads", "1", "-i", "input.mp4", "-c", "copy", "output.mp4"]);
	});

	it("applies the resolution cap and audio bitrate on video re-encodes", () => {
		const args = buildMediaArgs({
			inputName: "input.mp4",
			outputName: "output.webm",
			fromExt: "mp4",
			toExt: "webm",
			resolution: "720",
			bitrate: 192,
		});
		expect(args).toContain("scale='min(1280,iw)':'-2'");
		expect(args).toContain("libvpx");
		expect(args).toContain("-b:a");
		expect(args).toContain("192k");
		expect(args[args.length - 1]).toBe("output.webm");
	});

	it("skips scaling entirely for original resolution", () => {
		const args = buildMediaArgs({
			inputName: "input.mp4",
			outputName: "output.webm",
			fromExt: "mp4",
			toExt: "webm",
			resolution: "original",
			bitrate: 128,
		});
		expect(args).not.toContain("-vf");
	});

	it("maps 1080p to 1920 and 480p to 854", () => {
		const hi = buildMediaArgs({
			inputName: "input.mp4",
			outputName: "output.mp4",
			fromExt: "avi",
			toExt: "mp4",
			resolution: "1080",
		});
		expect(hi).toContain("scale='min(1920,iw)':'-2'");
		const lo = buildMediaArgs({
			inputName: "input.mp4",
			outputName: "output.mp4",
			fromExt: "avi",
			toExt: "mp4",
			resolution: "480",
		});
		expect(lo).toContain("scale='min(854,iw)':'-2'");
	});

	it("bitrates lossy audio targets but leaves lossless ones bare", () => {
		const lossy = buildMediaArgs({
			inputName: "input.wav",
			outputName: "output.mp3",
			fromExt: "wav",
			toExt: "mp3",
			bitrate: 256,
		});
		expect(lossy).toContain("-b:a");
		expect(lossy).toContain("256k");
		const lossless = buildMediaArgs({
			inputName: "input.mp3",
			outputName: "output.flac",
			fromExt: "mp3",
			toExt: "flac",
			bitrate: 256,
		});
		expect(lossless).not.toContain("-b:a");
	});
});
