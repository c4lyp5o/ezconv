import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobId } from "../src/job-id";

afterEach(() => vi.unstubAllGlobals());

describe("local job IDs", () => {
	it("uses native UUIDs when supported", () => {
		vi.stubGlobal("crypto", { randomUUID: () => "native-id" });
		expect(createJobId()).toBe("native-id");
	});
	it("supports HTTP LAN origins without randomUUID", () => {
		const getRandomValues = vi.fn((bytes) => bytes.fill(7));
		vi.stubGlobal("crypto", { getRandomValues });
		const ids = Array.from({ length: 100 }, () => createJobId());
		expect(getRandomValues).toHaveBeenCalledTimes(100);
		expect(new Set(ids).size).toBe(100);
	});
	it("still creates distinct IDs when Web Crypto is absent", () => {
		vi.stubGlobal("crypto", undefined);
		const ids = Array.from({ length: 100 }, () => createJobId());
		expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
		expect(new Set(ids).size).toBe(100);
	});
});
