// @vitest-environment jsdom
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { compressionPlan, compressionTarget, compressionWarnings } from "../src/compression";
import { convertData } from "../src/data-conversion";
import { targetOptionsFor } from "../src/format";
import { combinePdfs, pageIndices, processPdf } from "../src/pdf-tools";
import { markdownHtml } from "../src/text-tools";
import { inspectZip } from "../src/zip-tools";

const decode = (result) => new TextDecoder().decode(result.outBuffer);

describe("extended data conversions", () => {
	it("round-trips JSON through JSON Lines", () => {
		const jsonl = decode(
			convertData({ ext: "json", target: "jsonl", text: '[{"id":"007"},{"id":"008"}]' }),
		);
		expect(jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(decode(convertData({ ext: "jsonl", target: "json", text: jsonl })))).toEqual([
			{ id: "007" },
			{ id: "008" },
		]);
	});
	it("names invalid JSON Lines precisely", () => {
		expect(() => convertData({ ext: "ndjson", target: "json", text: '{"x":1}\ninvalid' })).toThrow(
			"line 2",
		);
	});
	it("preserves quoted YAML ids and nested values", () => {
		const result = convertData({
			ext: "yaml",
			target: "json",
			text: 'id: "007"\nitems:\n  - true\n  - 4',
		});
		expect(JSON.parse(decode(result))).toEqual({ id: "007", items: [true, 4] });
	});
	it("round-trips CSV and TSV without coercion or breaking quoted tabs", () => {
		const tsv = decode(convertData({ ext: "csv", target: "tsv", text: 'id,name\n007,"a\tb"' }));
		const back = JSON.parse(decode(convertData({ ext: "tsv", target: "json", text: tsv })));
		expect(back).toEqual([{ id: "007", name: "a\tb" }]);
	});
	it("rejects scalars for tabular targets", () => {
		expect(() => convertData({ ext: "yaml", target: "csv", text: "42" })).toThrow(
			"array of objects",
		);
	});
});

describe("PDF page tools", () => {
	async function fixture() {
		const pdf = await PDFDocument.create();
		pdf.addPage([100, 200]);
		pdf.addPage([300, 400]);
		return (await pdf.save()).buffer;
	}
	it("supports ordered ranges, removes duplicates and rejects invalid pages", () => {
		expect(pageIndices("3,1-2,1", 3)).toEqual([2, 0, 1]);
		for (const range of ["0", "4", "2-1", "1-", "a"]) expect(() => pageIndices(range, 3)).toThrow();
	});
	it("extracts and reorders pages", async () => {
		const result = await processPdf(await fixture(), "pdf-pages", { pages: "2,1" });
		const pdf = await PDFDocument.load(result.outBuffer);
		expect(pdf.getPages().map((p) => p.getWidth())).toEqual([300, 100]);
	});
	it("splits PDFs into separate files", async () => {
		const result = await processPdf(await fixture(), "pdf-split", {});
		const zip = await JSZip.loadAsync(result.outBuffer);
		expect(Object.keys(zip.files)).toEqual(["page-1.pdf", "page-2.pdf"]);
		const page = await PDFDocument.load(await zip.file("page-2.pdf").async("uint8array"));
		expect(page.getPageCount()).toBe(1);
		expect(page.getPage(0).getWidth()).toBe(300);
	});
	it("merges all pages in file order", async () => {
		const source = await fixture();
		const merged = await PDFDocument.load(await combinePdfs([source, source]));
		expect(merged.getPages().map((p) => p.getWidth())).toEqual([100, 300, 100, 300]);
	});
});

describe("document HTML", () => {
	it("renders Markdown and removes executable/remote content", () => {
		const html = markdownHtml(
			'# Title\n\n**Bold**\n\n<script>alert(1)</script><img src="https://example.com/tracker" onerror="alert(1)">\n\n[link](javascript:alert(1))',
		);
		expect(html).toContain("<h1>Title</h1>");
		expect(html).toContain("<strong>Bold</strong>");
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("javascript:");
		expect(html).toContain("Content-Security-Policy");
	});
});

describe("target file size", () => {
	it("uses bytes rather than a quality percentage and honors the floor", () => {
		const plan = compressionPlan({ mode: "size", targetMB: 2, minQuality: 0.7 });
		expect(compressionTarget(10_000_000, plan)).toBe(2 * 1024 * 1024);
		expect(plan.steps.every((s) => s.quality >= 0.7)).toBe(true);
		expect(compressionWarnings(10_000_000, 3_000_000, plan).join()).toContain("Could not fit");
	});
	it("rejects invalid targets", () => {
		for (const targetMB of [0, -1, "bad", 2000])
			expect(() => compressionPlan({ mode: "size", targetMB })).toThrow();
	});
});

describe("ZIP preview limits", () => {
	it("previews entries without extracting them", async () => {
		const zip = new JSZip();
		zip.file("folder/data.json", '{"a":1}');
		zip.file("note.txt", "hello");
		const bytes = await zip.generateAsync({ type: "arraybuffer" });
		const entries = await inspectZip({ size: bytes.byteLength, arrayBuffer: async () => bytes });
		expect(entries.map((e) => e.name)).toEqual(["folder/data.json", "note.txt"]);
		expect(entries.map((e) => e.size)).toEqual([7, 5]);
	});
	it("rejects excessive file counts before extraction", async () => {
		const zip = new JSZip();
		for (let i = 0; i < 201; i++) zip.file(`${i}.txt`, "x");
		await expect(
			inspectZip({ arrayBuffer: () => zip.generateAsync({ type: "arraybuffer" }) }),
		).rejects.toThrow("200 files");
	});
});

describe("discoverable targets", () => {
	it("offers all new conversion paths", () => {
		expect(targetOptionsFor("mp4")).toEqual(
			expect.arrayContaining(["mp3", "wav", "aac", "gif", "animated-webp"]),
		);
		expect(targetOptionsFor("gif")).toEqual(
			expect.arrayContaining(["mp4", "pdf", "animated-webp"]),
		);
		expect(targetOptionsFor("md")).toEqual(["html", "pdf"]);
		expect(targetOptionsFor("json")).toEqual(expect.arrayContaining(["yaml", "jsonl", "tsv"]));
	});
});
