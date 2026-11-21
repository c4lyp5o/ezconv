import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { compressionPlan, compressionWarnings } from "../src/compression";
import { getFileCategory } from "../src/file-config";
import { defaultTargetFor, targetOptionsFor } from "../src/format";
import { compressPdf } from "../src/pdf-compression";

describe("compression settings", () => {
	it("offers same-format compression for pictures and PDF", () => {
		expect(targetOptionsFor("jpg")).toContain("compress");
		expect(targetOptionsFor("pdf")).toContain("compress");
		expect(defaultTargetFor("pdf", getFileCategory("pdf"))).toBe("compress");
	});
	it("rejects invalid percentages instead of silently choosing a quality", () => {
		for (const reduction of [0, 91, "bad"]) {
			expect(() => compressionPlan({ mode: "percentage", reduction })).toThrow("between");
		}
	});
	it("reports unreachable size targets and unchanged originals", () => {
		const plan = compressionPlan({ mode: "percentage", reduction: 50 });
		expect(compressionWarnings(1000, 800, plan).join()).toContain("Could not reach 50%");
		expect(compressionWarnings(1000, 400, plan)).toEqual([]);
		expect(compressionWarnings(1000, 1000, plan).join()).toContain("original returned");
	});
});

describe("PDF best effort", () => {
	it("reduces uncompressed PDFs while keeping pages and text resources", async () => {
		const source = await PDFDocument.create();
		const font = await source.embedFont(StandardFonts.Helvetica);
		for (let n = 0; n < 4; n++) source.addPage([300, 400]).drawText(`Page ${n + 1}`, { font });
		const input = await source.save({ useObjectStreams: false });
		const result = await compressPdf(input.buffer, { mode: "best-effort" });
		expect(result.outBuffer.byteLength).toBeLessThan(input.byteLength);
		const back = await PDFDocument.load(result.outBuffer);
		expect(back.getPageCount()).toBe(4);
		expect(back.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
		expect(back.getPage(0).node.Resources().toString()).toContain("Font");
		expect(result.warnings).toEqual([]);
	});
	it("rejects corrupt PDF input", async () => {
		await expect(
			compressPdf(new Uint8Array([1, 2]).buffer, { mode: "best-effort" }),
		).rejects.toThrow();
	});
});
