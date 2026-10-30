import { useEffect, useRef, useState } from "react";
import DropZone from "./components/DropZone";
import LogsPanel from "./components/LogsPanel";
import ResultCard from "./components/ResultCard";
import Toast from "./components/Toast";
import { ALL_EXTENSIONS, AUDIO_EXTENSIONS, getFileCategory, VIDEO_EXTENSIONS } from "./file-config";
import {
	defaultTargetFor,
	getFileExtension,
	humanBytes,
	sizeNote,
	targetOptionsFor,
} from "./format";

// File size limits per category (bytes)
const SIZE_LIMITS = {
	data: 10 * 1024 * 1024, // 10 MB
	image: 15 * 1024 * 1024, // 15 MB
	audio: 80 * 1024 * 1024, // 80 MB
	video: 30 * 1024 * 1024, // 30 MB (Reduced to prevent memory errors)
};

export default function App() {
	const [file, setFile] = useState(null);
	const [ext, setExt] = useState("");
	const [target, setTarget] = useState("");
	const [status, setStatus] = useState("Idle");
	const [toast, setToast] = useState(null);
	const [isDragging, setIsDragging] = useState(false);
	const workerRef = useRef(null);
	// the worker's onmessage closes over the first render — carry sizes via ref
	const inputSizeRef = useRef(0);
	const inputRef = useRef(null);
	// latest handlers/state for the stable window listeners
	const liveRef = useRef({});

	// explicit busy flag: status text is display-only, the UI locks off this
	const [isConverting, setIsConverting] = useState(false);
	// encoder quality for lossy image targets (jpeg/webp), 0.50 - 1.00
	const [quality, setQuality] = useState(0.92);

	// last successful conversion: kept alive for preview / re-download / copy
	const [result, setResult] = useState(null);
	const [copied, setCopied] = useState(false);
	const resultUrlRef = useRef(null);
	resultUrlRef.current = result?.url || null;
	// revoke the kept result URL when the app unmounts
	useEffect(() => {
		return () => {
			if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
		};
	}, []);

	liveRef.current = { handleFile, handleConvert, isConverting };

	// UI flags
	const [ffmpegLoading, setFfmpegLoading] = useState(false);
	const [ffmpegProgress, setFfmpegProgress] = useState(0);
	const [ffmpegLogs, setFfmpegLogs] = useState([]);
	const [showLogs, setShowLogs] = useState(false);

	useEffect(() => {
		const w = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		});
		workerRef.current = w;
		w.onmessage = (e) => {
			const { status, message, ratio, buffer, mime, filename, warnings } = e.data;

			switch (status) {
				case "ffmpeg-loading":
					setFfmpegLoading(true);
					setStatus("Loading FFmpeg...");
					break;
				case "ffmpeg-ready":
					setFfmpegLoading(false);
					setStatus("Converting...");
					break;
				case "ffmpeg-log":
					setFfmpegLogs((s) => [...s.slice(-199), message]);
					break;
				case "ffmpeg-progress":
					setFfmpegProgress(Number(ratio || 0));
					break;
				case "log":
					setFfmpegLogs((s) => [...s.slice(-199), message]);
					break;
				case "done": {
					setStatus("Done");
					setIsConverting(false);
					setFfmpegProgress(0);
					const note = warnings?.length ? ` (${warnings.join("; ")})` : "";
					setToast({
						message: `✓ ${humanBytes(inputSizeRef.current)} → ${humanBytes(
							buffer?.byteLength,
						)} (${sizeNote(inputSizeRef.current, buffer?.byteLength)})${note}`,
						type: "success",
					});
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
					const isImage = (mime || "").startsWith("image/");
					const isText =
						mime === "text/csv;charset=utf-8" || mime === "application/json;charset=utf-8";
					// the URL stays alive for the result card; revoked on replace/reset
					setResult((prev) => {
						if (prev?.url) URL.revokeObjectURL(prev.url);
						return {
							name: filename || "output",
							mime,
							fromSize: inputSizeRef.current,
							toSize: buffer?.byteLength,
							warnings: warnings || [],
							url,
							isImage,
							isText,
							text: isText ? new TextDecoder().decode(buffer) : null,
						};
					});
					setCopied(false);
					break;
				}
				case "error":
					setStatus("Error");
					setIsConverting(false);
					setFfmpegProgress(0);
					setToast({ message: `✗ Error: ${message}`, type: "error" });
					break;
			}
		};
		return () => {
			w.terminate();
		};
	}, []);

	// clipboard paste + keyboard shortcuts: Ctrl+O browse, Enter convert
	useEffect(() => {
		const onPaste = (e) => {
			if (liveRef.current.isConverting) return;
			const f = e.clipboardData?.files?.[0];
			if (f) liveRef.current.handleFile(f);
		};
		const onKey = (e) => {
			if (e.key === "o" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				inputRef.current?.click();
				return;
			}
			if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey) return;
			// let buttons and form controls handle their own Enter
			const tag = e.target?.tagName;
			if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return;
			if (tag === "INPUT" && e.target?.type !== "range") return;
			e.preventDefault();
			liveRef.current.handleConvert();
		};
		window.addEventListener("paste", onPaste);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("paste", onPaste);
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	function handleReset() {
		setFile(null);
		setExt("");
		setTarget("");
		setStatus("Idle");
		setToast(null);
		setResult((prev) => {
			if (prev?.url) URL.revokeObjectURL(prev.url);
			return null;
		});
		setCopied(false);
	}

	async function handleCopy() {
		if (!result?.text) return;
		try {
			await navigator.clipboard.writeText(result.text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			setToast({ message: `✗ Copy failed: ${err.message}`, type: "error" });
		}
	}

	function handleFile(f) {
		const newExt = getFileExtension(f.name);
		const category = getFileCategory(newExt);
		// drag & drop bypasses the picker's accept list — reject unknowns here
		if (!category) {
			setToast({
				message: `✗ Unsupported file type: .${newExt || "unknown"}`,
				type: "error",
			});
			setFile(null);
			setExt("");
			setTarget("");
			setIsDragging(false);
			return;
		}
		setFile(f);
		setExt(newExt);
		inputSizeRef.current = f.size;
		setIsDragging(false);

		// Set reasonable default targets based on file type
		setTarget(defaultTargetFor(newExt, category));
	}

	async function handleConvert() {
		if (!file || !workerRef.current) return;
		if (isConverting) return;

		if (!target) return;

		setIsConverting(true);
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
					setIsConverting(false);
					return;
				}
			}

			const messagePayload = {
				action: "convert",
				filename: file.name,
				target,
				ext,
			};
			if (["jpg", "jpeg", "webp"].includes(target)) {
				messagePayload.quality = quality;
			}
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
			setIsConverting(false);
		}
	}

	const options = targetOptionsFor(ext);
	const acceptString = ALL_EXTENSIONS.map((e) => `.${e}`).join(",");

	return (
		<div className="min-h-screen bg-linear-to-br from-gray-900 to-slate-800 flex items-center justify-center p-6 text-gray-300">
			{toast && (
				<div className="fixed top-6 right-6 z-50">
					<Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
				</div>
			)}
			<div className="w-full max-w-2xl bg-gray-800 p-8 rounded-lg shadow-lg">
				<h1 className="text-3xl font-bold mb-2 text-gray-100">ezconv - convert anything!</h1>
				<p className="text-sm text-gray-400 mb-6">
					Convert images, audio, video, and data files instantly. No uploads, no backend.
				</p>

				{ffmpegLoading && (
					<div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-yellow-700">
						<div className="flex items-center justify-between">
							<div>
								<div className="font-medium">
									Loading FFmpeg core (~28 MB, served from this server)
								</div>
								<div className="text-xs text-yellow-700">
									First media conversion may take a while.
								</div>
							</div>
						</div>
					</div>
				)}

				<div className="space-y-4">
					<DropZone
						onFile={handleFile}
						disabled={isConverting}
						isDragging={isDragging}
						setIsDragging={setIsDragging}
						inputRef={inputRef}
						acceptString={acceptString}
					/>

					{file && (
						<div className="bg-gray-700 border border-gray-600 rounded-lg p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-medium text-gray-200">{file.name}</p>
									<p className="text-xs text-gray-400">
										{(file.size / 1024).toFixed(2)} KB · Detected:{" "}
										<span className="font-semibold">{ext.toUpperCase()}</span>
									</p>
								</div>
								<button
									type="button"
									onClick={handleReset}
									className="text-gray-500 hover:text-gray-300"
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
									className="text-sm text-gray-300 font-medium block mb-2"
								>
									Convert to
								</label>
								<select
									id="target-select"
									className="w-full border border-gray-600 bg-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								{["jpg", "jpeg", "webp"].includes(target) && (
									<div className="mt-3">
										<label
											htmlFor="quality-range"
											className="text-sm text-gray-300 font-medium block mb-2"
										>
											Quality: {Math.round(quality * 100)}%
										</label>
										<input
											id="quality-range"
											type="range"
											min="50"
											max="100"
											step="5"
											value={Math.round(quality * 100)}
											onChange={(e) => setQuality(Number(e.target.value) / 100)}
											disabled={isConverting}
											className="w-full accent-blue-500"
										/>
									</div>
								)}
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
							className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
							disabled={isConverting}
						>
							Reset
						</button>
					</div>

					{status !== "Idle" && (
						<div className="text-sm text-gray-300 bg-gray-700/50 p-3 rounded">
							<span className="font-medium">Status:</span> {status}
							{isConverting && ffmpegProgress > 0 && (
								<>
									<span> {Math.round(ffmpegProgress * 100)}%</span>
									<div
										className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-600"
										role="progressbar"
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={Math.round(ffmpegProgress * 100)}
									>
										<div
											className="h-2 rounded bg-blue-500 transition-all"
											style={{ width: `${Math.round(ffmpegProgress * 100)}%` }}
										/>
									</div>
								</>
							)}
						</div>
					)}

					<ResultCard result={result} copied={copied} onCopy={handleCopy} />

					{/* Logs and FFmpeg console */}
					{[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(ext) && (
						<LogsPanel
							logs={ffmpegLogs}
							showLogs={showLogs}
							onToggle={() => setShowLogs((s) => !s)}
						/>
					)}

					<div className="text-xs text-gray-500 border-t border-gray-700 pt-4">
						🔒 Files never leave your browser. Conversion runs in a Web Worker for instant results.
					</div>
				</div>
			</div>
		</div>
	);
}
