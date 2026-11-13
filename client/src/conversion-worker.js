// Keep a failed worker isolated from future jobs. Browser-only conversions can
// keep using the same message callback while the next worker job starts fresh.
export class ConversionWorker {
	constructor(createWorker, onCrash) {
		this.createWorker = createWorker;
		this.onCrash = onCrash;
		this.worker = null;
		this.pending = new Set();
		this.onmessage = null;
		this.closed = false;
	}

	postMessage(data, transfer = []) {
		if (this.closed) throw new Error("Conversion worker is closed");
		if (!this.worker) {
			const worker = this.createWorker();
			this.worker = worker;
			worker.onmessage = (event) => {
				if (this.worker !== worker) return;
				if (["done", "error"].includes(event.data.status)) this.pending.delete(event.data.jobId);
				this.onmessage?.(event);
			};
			const fail = (event, fallback) => {
				event.preventDefault?.();
				if (this.worker !== worker) return;
				this.worker = null;
				const jobIds = [...this.pending];
				this.pending.clear();
				worker.terminate();
				this.onCrash({ jobIds, message: event.message || fallback });
			};
			worker.onerror = (event) => fail(event, "Conversion worker stopped unexpectedly");
			worker.onmessageerror = (event) => fail(event, "Could not read a conversion worker message");
		}
		this.pending.add(data.jobId);
		try {
			this.worker.postMessage(data, transfer);
		} catch (error) {
			this.pending.delete(data.jobId);
			throw error;
		}
	}

	terminate() {
		this.closed = true;
		this.worker?.terminate();
		this.worker = null;
		this.pending.clear();
		this.onmessage = null;
	}
}
