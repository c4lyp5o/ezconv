import { describe, it, expect } from "vitest";
import {
	CANVAS_OUTPUT_EXTENSIONS,
	getFileCategory,
	imageMimeFor,
} from "../src/file-config";

describe("image format honesty", () => {
	it("maps extensions to the real MIME types canvas honors", () => {
		expect(imageMimeFor("jpg")).toBe("image/jpeg");
		expect(imageMimeFor("jpeg")).toBe("image/jpeg");
		expect(imageMimeFor("png")).toBe("image/png");
		expect(imageMimeFor("webp")).toBe("image/webp");
	});

	it("only offers output formats canvas can actually encode", () => {
		expect(CANVAS_OUTPUT_EXTENSIONS).toEqual(["jpg", "jpeg", "png", "webp"]);
		expect(CANVAS_OUTPUT_EXTENSIONS).not.toContain("gif");
		expect(CANVAS_OUTPUT_EXTENSIONS).not.toContain("bmp");
		expect(CANVAS_OUTPUT_EXTENSIONS).not.toContain("svg");
	});

	it("keeps gif and bmp readable as input formats", () => {
		expect(getFileCategory("gif")).toBe("image");
		expect(getFileCategory("bmp")).toBe("image");
		expect(imageMimeFor("gif")).toBe("image/gif");
		expect(imageMimeFor("bmp")).toBe("image/bmp");
		expect(imageMimeFor("svg")).toBe("image/svg+xml");
	});
});
