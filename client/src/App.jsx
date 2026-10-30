import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "./components/DropZone";
import JobRow from "./components/JobRow";
import LogsPanel from "./components/LogsPanel";
import ResultCard from "./components/ResultCard";
import Toast from "./components/Toast";
import { ALL_EXTENSIONS, AUDIO_EXTENSIONS, getFileCategory, VIDEO_EXTENSIONS } from "./file-config";
import { defaultTargetFor, getFileExtension, humanBytes, sizeNote } from "./format";

// File size limits per category (bytes)
const SIZE_LIMITS = {
	data: 10 * 1024 * 1024, // 10 MB
	image: 15 * 1024 * 1024, // 15 MB
	audio: 80 * 1024 * 1024, // 80 MB
	video: 30 * 1024 * 1024, // 30 MB (Reduced to prevent memory errors)
};

const LOSSY_TARGETS = ["jpg", "jpeg", "webp"];

export default function App() {
	const [jobs, setJobs] = useState([]);
	const [status, setStatus] = useState("Idle");
	const [toast, setToast] = useState(null);
	const [isDragging, setIsDragging] = useState(false);
	const workerRef = useRef(null);
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
	// bookkeeping for the current run (batch summary + auto-download decision)
	const runRef = useRef({ total: 0, done: 0, failed: 0, autoDownload: false });
	// input sizes per job id, for the result summaries
	const sizeMapRef = useRef({});

	// UI flags
	const [ffmpegLoading, setFfmpegLoading] = useState(false);
	const [ffmpegProgress, setFfmpegProgress] = useState(0);
	const [ffmpegLogs, setFfmpegLogs] = useState([]);
	const [showLogs, setShowLogs] = useState(false);

	// revoke kept URLs when the app unmounts
	useEffect(() => {
		return () => {
			if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
		};
	}, []);

	liveRef.current = { addFiles, handleConvertAll, isConverting };

	const finishIfRunDone = useCallback(() => {
		const r = runRef.current;
		if (r.done + r.failed < r.total) return;
		setIsConverting(false);
		setFfmpegProgress(0);
		setStatus(r.failed > 0 ? "Finished with errors" : "Done");
		if (r.total > 1) {
			setToast({
				message:
					r.failed > 0
						? `✓ ${r.done}/${r.total} converted (${r.failed} failed)`
						: `✓ ${r.done}/${r.total} converted`,
				type: r.failed > 0 ? "error" : "success",
			});
		}
	}, []);

	const buildResult = useCallback((outName, fromSize, buffer, mime, warnings) => {
		const blob = new Blob([buffer], { type: mime || "application/octet-stream" });
		const url = URL.createObjectURL(blob);
		const isImage = (mime || "").startsWith("image/");
		const isText = mime === "text/csv;charset=utf-8" || mime === "application/json;charset=utf-8";
		return {
			name: outName || "output",
			mime,
			fromSize,
			toSize: buffer?.byteLength,
			warnings: warnings || [],
			blob,
			url,
			isImage,
			isText,
			text: isText ? new TextDecoder().decode(buffer) : null,
		};
	}, []);

	const downloadResult = useCallback((res) => {
		const a = document.createElement("a");
		a.href = res.url;
		a.download = res.name;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}, []);

	useEffect(() => {
		const w = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		});
		workerRef.current = w;
		w.onmessage = (e) => {
			const { status, message, ratio, buffer, mime, warnings, jobId, filename } = e.data;

			switch (status) {
				case "ffmpeg-loading":
					setFfmpegLoading(true);
					break;
				case "ffmpeg-ready":
					setFfmpegLoading(false);
					break;
				case "ffmpeg-log":
				case "log":
					setFfmpegLogs((s) => [...s.slice(-199), message]);
					break;
				case "ffmpeg-progress":
					setFfmpegProgress(Number(ratio || 0));
					setJobs((prev) =>
						prev.map((j) => (j.id === jobId ? { ...j, progress: Number(ratio || 0) } : j)),
					);
					break;
				case "done": {
					runRef.current.done += 1;
					const res = buildResult(filename, sizeMapRef.current[jobId] ?? 0, buffer, mime, warnings);
					setJobs((prev) =>
						prev.map((j) =>
							j.id === jobId ? { ...j, status: "done", progress: 1, result: res } : j,
						),
					);
					// single-file runs keep the classic auto-download + size toast
					if (runRef.current.autoDownload) {
						downloadResult(res);
						setResult((prev) => {
							if (prev?.url) URL.revokeObjectURL(prev.url);
							return res;
						});
						setCopied(false);
						setToast({
							message: `✓ ${humanBytes(res.fromSize)} → ${humanBytes(res.toSize)} (${sizeNote(
								res.fromSize,
								res.toSize,
							)})${warnings?.length ? ` (${warnings.join("; ")})` : ""}`,
							type: "success",
						});
					}
					finishIfRunDone();
					break;
				}
				case "error": {
					runRef.current.failed += 1;
					setJobs((prev) =>
						prev.map((j) => (j.id === jobId ? { ...j, status: "error", error: message } : j)),
					);
					finishIfRunDone();
					break;
				}
			}
		};
		return () => {
			w.terminate();
		};
	}, [buildResult, downloadResult, finishIfRunDone]);

	// clipboard paste + keyboard shortcuts: Ctrl+O browse, Enter convert
	useEffect(() => {
		const onPaste = (e) => {
			if (liveRef.current.isConverting) return;
			if (e.clipboardData?.files?.length) liveRef.current.addFiles(e.clipboardData.files);
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
			liveRef.current.handleConvertAll();
		};
		window.addEventListener("paste", onPaste);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("paste", onPaste);
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	function handleReset() {
		setJobs((prev) => {
			for (const j of prev) if (j.result?.url) URL.revokeObjectURL(j.result.url);
			return [];
		});
		setStatus("Idle");
		setToast(null);
		setResult((prev) => {
			if (prev?.url) URL.revokeObjectURL(prev.url);
			return null;
		});
		setCopied(false);
		setFfmpegProgress(0);
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

	function addFiles(fileList) {
		const accepted = [];
		const rejected = [];
		for (const f of fileList) {
			const newExt = getFileExtension(f.name);
			const category = getFileCategory(newExt);
			// drag & drop bypasses the picker's accept list — reject unknowns here
			if (!category) {
				rejected.push(f.name);
				continue;
			}
			accepted.push({
				id: crypto.randomUUID(),
				file: f,
				ext: newExt,
				category,
				target: defaultTargetFor(newExt, category),
				status: "ready",
				progress: 0,
				result: null,
				error: null,
			});
		}
		if (rejected.length > 0) {
			setToast({
				message: `✗ Unsupported file type: ${rejected.join(", ")}`,
				type: "error",
			});
		}
		if (accepted.length > 0) {
			setJobs((prev) => [...prev, ...accepted]);
			setStatus("Ready");
		}
		setIsDragging(false);
	}

	function setJobTarget(id, target) {
		setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, target } : j)));
	}

	function removeJob(id) {
		setJobs((prev) => {
			const job = prev.find((j) => j.id === id);
			if (job?.result?.url) URL.revokeObjectURL(job.result.url);
			return prev.filter((j) => j.id !== id);
		});
	}

	async function handleConvertAll() {
		if (isConverting || !workerRef.current) return;
		const pending = jobs.filter((j) => j.status === "ready" || j.status === "error");
		if (pending.length === 0) return;

		setIsConverting(true);
		runRef.current = {
			total: pending.length,
			done: 0,
			failed: 0,
			autoDownload: pending.length === 1,
		};
		setJobs((prev) =>
			prev.map((j) =>
				pending.some((p) => p.id === j.id)
					? { ...j, status: "converting", progress: 0, error: null }
					: j,
			),
		);
		setStatus(`Converting… (0/${pending.length})`);

		for (const job of pending) {
			try {
				// File size check
				const limit = SIZE_LIMITS[job.category] || SIZE_LIMITS.data;
				if (job.file.size > limit) {
					const human = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
					const confirmMsg = `File is ${human(job.file.size)}, which exceeds the recommended limit of ${human(limit)} for ${job.category} files. Continue?`;
					if (!window.confirm(confirmMsg)) {
						runRef.current.failed += 1;
						setJobs((prev) =>
							prev.map((j) =>
								j.id === job.id ? { ...j, status: "error", error: "skipped (over size limit)" } : j,
							),
						);
						finishIfRunDone();
						continue;
					}
				}

				const messagePayload = {
					action: "convert",
					jobId: job.id,
					filename: job.file.name,
					target: job.target,
					ext: job.ext,
				};
				sizeMapRef.current[job.id] = job.file.size;
				if (LOSSY_TARGETS.includes(job.target)) {
					messagePayload.quality = quality;
				}
				const isBinary =
					job.ext === "xlsx" ||
					job.ext === "xls" ||
					job.category === "image" ||
					job.category === "audio" ||
					job.category === "video";
				const transferList = [];

				if (isBinary) {
					const buffer = await job.file.arrayBuffer();
					messagePayload.arrayBuffer = buffer;
					transferList.push(buffer);
				} else {
					messagePayload.text = await job.file.text();
				}

				workerRef.current.postMessage(messagePayload, transferList);
			} catch (err) {
				runRef.current.failed += 1;
				setJobs((prev) =>
					prev.map((j) => (j.id === job.id ? { ...j, status: "error", error: err.message } : j)),
				);
				finishIfRunDone();
			}
		}
	}

	async function handleZip() {
		const done = jobs.filter((j) => j.status === "done" && j.result?.blob);
		if (done.length === 0) return;
		const zip = new JSZip();
		for (const j of done) {
			zip.file(j.result.name, j.result.blob);
		}
		const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
		const url = URL.createObjectURL(zipBlob);
		const a = document.createElement("a");
		const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
		a.href = url;
		a.download = `ezconv-${stamp}.zip`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	const acceptString = ALL_EXTENSIONS.map((e) => `.${e}`).join(",");
	const doneCount = jobs.filter((j) => j.status === "done").length;
	const showQuality = jobs.some((j) => LOSSY_TARGETS.includes(j.target));
	const isMedia = jobs.some((j) => [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(j.ext));

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
						onFiles={addFiles}
						disabled={isConverting}
						isDragging={isDragging}
						setIsDragging={setIsDragging}
						inputRef={inputRef}
						acceptString={acceptString}
					/>

					{jobs.map((job) => (
						<JobRow
							key={job.id}
							job={job}
							disabled={isConverting}
							onTarget={setJobTarget}
							onRemove={removeJob}
						/>
					))}

					{showQuality && (
						<div>
							<label
								htmlFor="quality-range"
								className="text-sm text-gray-300 font-medium block mb-2"
							>
								Quality: {Math.round(quality * 100)}% (jpg / webp)
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

					<div className="flex gap-3">
						<button
							type="button"
							onClick={handleConvertAll}
							className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={isConverting || jobs.length === 0}
						>
							{jobs.length > 1 ? "Convert all" : "Convert"}
						</button>
						{doneCount >= 2 && (
							<button
								type="button"
								onClick={handleZip}
								disabled={isConverting}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
							>
								Download ZIP
							</button>
						)}
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
								<span> {Math.round(ffmpegProgress * 100)}%</span>
							)}
						</div>
					)}

					<ResultCard result={result} copied={copied} onCopy={handleCopy} />

					{/* Logs and FFmpeg console */}
					{isMedia && (
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
