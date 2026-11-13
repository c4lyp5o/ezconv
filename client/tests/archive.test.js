import { describe, expect, it } from "vitest";
import { createArchive } from "../src/archive";

describe("ZIP collisions", () => {
	it("preserves every result including naturally suffixed filenames", async () => {
		const zip = createArchive([
			{ name: "photo.jpg", blob: "first" },
			{ name: "photo (2).jpg", blob: "second" },
			{ name: "photo.jpg", blob: "third" },
			{ name: "photo.jpg", blob: "fourth" },
		]);
		expect(Object.keys(zip.files)).toEqual([
			"photo.jpg",
			"photo (2).jpg",
			"photo (3).jpg",
			"photo (4).jpg",
		]);
		expect(await zip.file("photo.jpg").async("string")).toBe("first");
		expect(await zip.file("photo (3).jpg").async("string")).toBe("third");
	});
});
