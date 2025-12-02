import { useEffect, useMemo, useRef, useState } from "react";
import {
	getFileCategory,
	ALL_EXTENSIONS,
	AUDIO_EXTENSIONS,
	DATA_EXTENSIONS,
	IMAGE_EXTENSIONS,
	VIDEO_EXTENSIONS,
} from "./file-config";

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

	// UI flags
	const [ffmpegLoading, setFfmpegLoading] = useState(false);
	const [ffmpegProgress, setFfmpegProgress] = useState(0);
	const [ffmpegLogs, setFfmpegLogs] = useState([]);
	const [showLogs, setShowLogs] = useState(false);

	// File size limits per category (bytes)
	const SIZE_LIMITS = {
		data: 10 * 1024 * 1024, // 10 MB
		image: 15 * 1024 * 1024, // 15 MB
		audio: 80 * 1024 * 1024, // 80 MB
		video: 30 * 1024 * 1024, // 30 MB (Reduced to prevent memory errors)
	};

	useEffect(() => {
		const w = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		});
		workerRef.current = w;
		w.onmessage = (e) => {
			const { status, message, ratio, buffer, mime, filename } = e.data;

			switch (status) {
				case "ffmpeg-loading":
					setFfmpegLoading(true);
					setStatus("Loading FFmpeg...");
					break;
				case "ffmpeg-ready":
					setFfmpegLoading(false);
					setStatus("Converting...");
					console.log("[worker] FFmpeg ready");
					break;
				case "ffmpeg-log":
					setFfmpegLogs((s) => {
						const nxt = [...s.slice(-199), message];
						return nxt;
					});
					console.log("[ffmpeg]", message);
					break;
				case "ffmpeg-progress":
					setFfmpegProgress(Number(ratio || 0));
					break;
				case "log":
					console.log("[worker]", message);
					setFfmpegLogs((s) => {
						const nxt = [...s.slice(-199), message];
						return nxt;
					});
					break;
				case "done": {
					setStatus("Done");
					setToast({ message: "✓ Conversion successful!", type: "success" });
					const blob = new Blob([buffer], {
						type: mime || "application/octet-stream",
					});
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = filename || "output";
					document.body.appendChild(a);
					a.click();
					a.remove();
					URL.revokeObjectURL(url);
					break;
				}
				case "error":
					setStatus("Error");
					setToast({ message: `✗ Error: ${message}`, type: "error" });
					break;
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

		// Set reasonable default targets based on file type
		const category = getFileCategory(newExt);
		if (category === "data") {
			if (newExt === "json") setTarget("csv");
			else if (newExt === "csv") setTarget("json");
			else setTarget("csv");
		} else if (category === "image") {
			setTarget("png");
		} else if (category === "audio") {
			setTarget("mp3");
		} else if (category === "video") {
			setTarget("mp4");
		}
	}

	async function handleConvert() {
		console.log(target);
		if (!file || !workerRef.current) return;

		if (!target) return;

		try {
			setStatus("Reading file...");
			const category = getFileCategory(ext);
			const isBinary =
				ext === "xlsx" ||
				ext === "xls" ||
				category === "image" ||
				category === "audio" ||
				category === "video";

			// File size check
			const limit = SIZE_LIMITS[category] || SIZE_LIMITS.data;
			if (file.size > limit) {
				const human = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
				const confirmMsg = `File is ${human(file.size)}, which exceeds the recommended limit of ${human(limit)} for ${category} files. Continue?`;
				if (!window.confirm(confirmMsg)) {
					setStatus("Idle");
					return;
				}
			}

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

	const options = useMemo(() => {
		if (!ext) return [];
		const category = getFileCategory(ext);

		if (category === "data") {
			return DATA_EXTENSIONS.filter((e) => e !== ext && e !== "xls");
		} else if (category === "image") {
			return IMAGE_EXTENSIONS.filter((e) => e !== ext && e !== "svg");
		} else if (category === "audio") {
			return AUDIO_EXTENSIONS.filter((e) => e !== ext);
		} else if (category === "video") {
			return VIDEO_EXTENSIONS.filter((e) => e !== ext);
		}
		return [];
	}, [ext]);

	const acceptString = ALL_EXTENSIONS.map((e) => `.${e}`).join(",");

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
					Convert images, audio, video, and data files instantly. No uploads, no
					backend.
				</p>

				{ffmpegLoading && (
					<div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-yellow-700">
						<div className="flex items-center justify-between">
							<div>
								<div className="font-medium">
									Loading FFmpeg (approx. 28 MB)
								</div>
								<div className="text-xs text-yellow-700">
									First media conversion may take a while.
								</div>
							</div>
							<div className="ml-4 w-40">
								<div className="h-2 bg-yellow-200 rounded overflow-hidden">
									<div
										className="h-2 bg-yellow-400"
										style={{ width: `${Math.round(ffmpegProgress * 100)}%` }}
									/>
								</div>
							</div>
						</div>
					</div>
				)}

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
								accept={acceptString}
								disabled={isConverting}
							/>
							<span className="text-blue-600 hover:underline ml-1">browse</span>
						</label>
						<p className="text-xs text-gray-500 mt-2">
							Data, Images, Audio, or Video
						</p>
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

					{/* Logs and FFmpeg console */}
					{[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(ext) && (
						<>
							<div className="flex items-center justify-between mt-2">
								<div className="text-xs text-gray-500">FFmpeg logs</div>
								<button
									type="button"
									className="text-xs text-blue-600 underline"
									onClick={() => setShowLogs((s) => !s)}
								>
									{showLogs ? "Hide logs" : "Show logs"}
								</button>
							</div>

							{showLogs && (
								<div className="mt-2 bg-black text-white text-xs rounded p-2 max-h-40 overflow-auto">
									{ffmpegLogs.length === 0 ? (
										<div className="opacity-60">No logs yet.</div>
									) : (
										ffmpegLogs.map((l, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: no other way
											<div key={i} className="whitespace-pre-wrap">
												{l}
											</div>
										))
									)}
								</div>
							)}
						</>
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
