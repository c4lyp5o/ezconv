import { describe, expect, it, vi } from "vitest";
import { ConversionWorker } from "../src/conversion-worker";

function setup() {
	const instances = [];
	const create = vi.fn(() => {
		const worker = { postMessage: vi.fn(), terminate: vi.fn() };
		instances.push(worker);
		return worker;
	});
	const crash = vi.fn();
	const channel = new ConversionWorker(create, crash);
	channel.onmessage = vi.fn();
	return { channel, instances, create, crash };
}

describe("worker crash recovery", () => {
	it("fails only outstanding jobs and starts a fresh worker on retry", () => {
		const { channel, instances, crash } = setup();
		channel.postMessage({ jobId: "done" });
		channel.postMessage({ jobId: "running" });
		channel.postMessage({ jobId: "queued" });
		instances[0].onmessage({ data: { status: "done", jobId: "done" } });
		instances[0].onerror({ message: "out of memory", preventDefault: vi.fn() });
		expect(crash).toHaveBeenCalledWith({ jobIds: ["running", "queued"], message: "out of memory" });
		expect(instances[0].terminate).toHaveBeenCalledOnce();
		channel.postMessage({ jobId: "retry" });
		expect(instances).toHaveLength(2);
		expect(instances[1].postMessage).toHaveBeenCalledWith({ jobId: "retry" }, []);
	});
	it("ignores late messages and duplicate errors from a terminated worker", () => {
		const { channel, instances, crash } = setup();
		channel.postMessage({ jobId: "a" });
		instances[0].onerror({});
		channel.postMessage({ jobId: "b" });
		instances[0].onmessage({ data: { status: "done", jobId: "a" } });
		instances[0].onerror({});
		expect(channel.onmessage).not.toHaveBeenCalled();
		expect(crash).toHaveBeenCalledOnce();
	});
	it("recovers from unreadable messages", () => {
		const { channel, instances, crash } = setup();
		channel.postMessage({ jobId: "a" });
		instances[0].onmessageerror({});
		expect(crash.mock.calls[0][0].jobIds).toEqual(["a"]);
		expect(crash.mock.calls[0][0].message).toContain("Could not read");
	});
	it("does not count postMessage exceptions as later crashed jobs", () => {
		const { channel, instances, crash } = setup();
		channel.postMessage({ jobId: "a" });
		instances[0].postMessage.mockImplementationOnce(() => {
			throw new Error("clone failed");
		});
		expect(() => channel.postMessage({ jobId: "b" })).toThrow("clone failed");
		instances[0].onerror({});
		expect(crash.mock.calls[0][0].jobIds).toEqual(["a"]);
	});
	it("terminates without restarting after unmount", () => {
		const { channel, instances } = setup();
		channel.postMessage({ jobId: "a" });
		channel.terminate();
		expect(instances[0].terminate).toHaveBeenCalledOnce();
		expect(() => channel.postMessage({ jobId: "b" })).toThrow("closed");
	});
});
