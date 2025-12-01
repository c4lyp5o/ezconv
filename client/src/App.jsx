import { useEffect, useRef, useState } from "react";

function getFileExtension(filename) {
	return filename
		.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2)
		.toLowerCase();
}

function Toast({ message, type, onClose }) {
	useEffect(() => {
		const timer = setTimeout(onClose, 4000);
		return () => clearTimeout(timer);
	}, [onClose]);

	const bgColor = type === "success" ? "bg-green-500" : "bg-red-500";

	return (
		<div
			className={`${bgColor} text-white px-4 py-3 rounded shadow-lg animate-fade-in`}
			role="alert"
		>
			{message}
		</div>
	);
}

export default function App() {
	const [file, setFile] = useState(null);
	const [ext, setExt] = useState("");
	const [target, setTarget] = useState("");
	const [status, setStatus] = useState("Idle");
	const [toast, setToast] = useState(null);
	const [isDragging, setIsDragging] = useState(false);
	const workerRef = useRef(null);

	const isConverting = status.toLowerCase().includes("convert");

	useEffect(() => {
		const w = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		});
		workerRef.current = w;
		w.onmessage = (e) => {
			const d = e.data;
			if (d.status === "done") {
				setStatus("Done");
				setToast({ message: "✓ Conversion successful!", type: "success" });
				const ab = d.buffer;
				const blob = new Blob([ab], {
					type: d.mime || "application/octet-stream",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = d.filename || "output";
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			} else if (d.status === "error") {
				setStatus("Error");
				setToast({ message: `✗ Error: ${d.message}`, type: "error" });
			}
		};
		return () => {
			w.terminate();
		};
	}, []);

	function handleReset() {
		setFile(null);
		setExt("");
		setTarget("");
		setStatus("Idle");
		setToast(null);
	}

	function handleFile(e) {
		const f = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
		if (!f) return setFile(null);
		setFile(f);
		const newExt = getFileExtension(f.name);
		setExt(newExt);
		setIsDragging(false);

		// set reasonable default targets
		if (newExt === "json") setTarget("csv");
		else if (newExt === "csv") setTarget("json");
		else setTarget(newExt === "xlsx" || newExt === "xls" ? "csv" : "csv");
	}

	async function handleConvert() {
		if (!file || !workerRef.current) return;

		try {
			setStatus("Reading file...");
			const isBinary = ext === "xlsx" || ext === "xls";
			const messagePayload = {
				action: "convert",
				filename: file.name,
				target,
				ext,
			};
			const transferList = [];

			if (isBinary) {
				const buffer = await file.arrayBuffer();
				messagePayload.arrayBuffer = buffer;
				transferList.push(buffer);
			} else {
				messagePayload.text = await file.text();
			}

			setStatus("Converting...");
			workerRef.current.postMessage(messagePayload, transferList);
		} catch (err) {
			setStatus(`Error reading file: ${err.message}`);
		}
	}

	const options = (() => {
		if (!ext) return [];
		if (ext === "json") return ["csv", "xlsx"];
		if (ext === "csv") return ["json", "xlsx"];
		if (ext === "xlsx" || ext === "xls") return ["csv", "json"];
		return ["csv", "json", "xlsx"];
	})();

	return (
		<div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
			{toast && (
				<div className="fixed top-6 right-6 z-50">
					<Toast
						message={toast.message}
						type={toast.type}
						onClose={() => setToast(null)}
					/>
				</div>
			)}
			<div className="w-full max-w-2xl bg-white p-8 rounded-lg shadow-lg">
				<h1 className="text-3xl font-bold mb-2 text-gray-800">ezconv</h1>
				<p className="text-sm text-gray-500 mb-6">
					Convert CSV, JSON, and XLSX files instantly. No uploads, no backend.
				</p>

				<div className="space-y-4">
					{/** biome-ignore lint/a11y/noStaticElementInteractions: false */}
					<div
						onDragOver={(e) => {
							if (isConverting) return;
							e.preventDefault();
							setIsDragging(true);
						}}
						onDragLeave={() => {
							if (!isConverting) setIsDragging(false);
						}}
						onDrop={(e) => {
							if (isConverting) return;
							e.preventDefault();
							handleFile(e);
						}}
						className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
							isDragging
								? "border-blue-500 bg-blue-50"
								: "border-gray-300 bg-gray-50"
						}
						${isConverting ? " opacity-60 pointer-events-none" : ""}`}
					>
						<div className="mb-3 text-3xl">📄</div>
						<label className="block cursor-pointer">
							<span className="text-sm font-medium text-gray-700">
								Drag & drop a file here or
							</span>
							<input
								onChange={handleFile}
								className="hidden"
								type="file"
								accept=".json,.csv,.xlsx,.xls,.txt"
								disabled={isConverting}
							/>
							<span className="text-blue-600 hover:underline ml-1">browse</span>
						</label>
						<p className="text-xs text-gray-500 mt-2">JSON, CSV, XLSX or XLS</p>
					</div>

					{file && (
						<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-medium text-gray-800">
										{file.name}
									</p>
									<p className="text-xs text-gray-500">
										{(file.size / 1024).toFixed(2)} KB · Detected:{" "}
										<span className="font-semibold">{ext.toUpperCase()}</span>
									</p>
								</div>
								<button
									type="button"
									onClick={handleReset}
									className="text-gray-400 hover:text-gray-600"
								>
									✕
								</button>
							</div>
						</div>
					)}

					{file && (
						<div className="flex gap-3 items-end">
							<div className="flex-1">
								<label
									htmlFor="target-select"
									className="text-sm text-gray-600 font-medium block mb-2"
								>
									Convert to
								</label>
								<select
									id="target-select"
									className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
									value={target}
									onChange={(e) => setTarget(e.target.value)}
									disabled={isConverting}
								>
									<option value="">Select format</option>
									{options.map((o) => (
										<option key={o} value={o}>
											{o.toUpperCase()}
										</option>
									))}
								</select>
							</div>
						</div>
					)}

					<div className="flex gap-3">
						<button
							type="button"
							onClick={handleConvert}
							className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={!file || !target || isConverting}
						>
							Convert
						</button>
						<button
							type="button"
							onClick={handleReset}
							className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
							disabled={isConverting}
						>
							Reset
						</button>
					</div>

					{status !== "Idle" && (
						<div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
							<span className="font-medium">Status:</span> {status}
						</div>
					)}

					<div className="text-xs text-gray-400 border-t pt-4">
						🔒 Files never leave your browser. Conversion runs in a Web Worker
						for instant results.
					</div>
				</div>
			</div>
		</div>
	);
}
