import { describe, expect, it, vi } from "vitest";
import { runMediaConversion } from "../src/media-files";

describe("media filesystem isolation", () => {
	function fakeFFmpeg(code = 0) {
		const files = new Map([["output.mp3", new Uint8Array([9, 9])]]);
		return {
			files,
			deleteFile: vi.fn(async (name) => files.delete(name)),
			writeFile: vi.fn(async (name, bytes) => files.set(name, bytes)),
			exec: vi.fn(async () => {
				if (code === 0) files.set("output.mp3", new Uint8Array([0, 1, 2, 0]).subarray(1, 3));
				return code;
			}),
			readFile: vi.fn(async (name) => files.get(name)),
		};
	}
	it("rejects nonzero exit codes without reading a previous result", async () => {
		const ff = fakeFFmpeg(1);
		await expect(
			runMediaConversion(ff, "input.wav", "output.mp3", new ArrayBuffer(2), []),
		).rejects.toThrow("code 1");
		expect(ff.readFile).not.toHaveBeenCalled();
		expect(ff.files.size).toBe(0);
	});
	it("returns exact bytes and releases files after success", async () => {
		const ff = fakeFFmpeg();
		const bytes = await runMediaConversion(ff, "input.wav", "output.mp3", new ArrayBuffer(2), []);
		expect([...new Uint8Array(bytes)]).toEqual([1, 2]);
		expect(ff.files.size).toBe(0);
	});
	it("cleans up after thrown execution errors too", async () => {
		const ff = fakeFFmpeg();
		ff.exec.mockRejectedValue(new Error("out of memory"));
		await expect(
			runMediaConversion(ff, "input.wav", "output.mp3", new ArrayBuffer(2), []),
		).rejects.toThrow("out of memory");
		expect(ff.files.size).toBe(0);
	});
});

