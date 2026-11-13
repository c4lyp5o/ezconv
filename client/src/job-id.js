let sequence = 0;

// Queue IDs correlate local jobs; they are not authentication tokens.
// randomUUID is unavailable on HTTP LAN origins in some browsers.
export function createJobId() {
	const crypto = globalThis.crypto;
	if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
	sequence += 1;
	if (typeof crypto?.getRandomValues === "function") {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		return `job-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}-${sequence}`;
	}
	return `job-${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2)}`;
}
