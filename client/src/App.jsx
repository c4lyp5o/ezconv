import { useCallback, useEffect, useRef, useState } from "react";
import { createArchive } from "./archive";
import { isBrowserJob, runBrowserJob } from "./browser-conversion";
import CompressionControls from "./components/CompressionControls";
import DropZone from "./components/DropZone";
import JobRow from "./components/JobRow";
import LogsPanel from "./components/LogsPanel";
import Recipes from "./components/Recipes";
import ResultCard from "./components/ResultCard";
import Toast from "./components/Toast";
import { ConversionWorker } from "./conversion-worker";
import {
	AnimatePresence,
	Bar,
	Collapse,
	motion,
	SlideRow,
	Stagger,
	StaggerItem,
	spring,
} from "./ez/motion";
import { Brand, Shell } from "./ez/Shell";
import {
	btn,
	Chip,
	cx,
	Dot,
	Kbd,
	Loading,
	labelCls,
	Notice,
	panel,
	SectionLabel,
	Spinner,
	Stat,
	selectCls,
} from "./ez/ui";
import { ALL_EXTENSIONS, AUDIO_EXTENSIONS, getFileCategory, VIDEO_EXTENSIONS } from "./file-config";
import {
	defaultTargetFor,
	getFileExtension,
	humanBytes,
	sizeNote,
	targetOptionsFor,
} from "./format";
import { createJobId } from "./job-id";

// File size limits per category (bytes)
const SIZE_LIMITS = {
	text: 5 * 1024 * 1024,
	archive: 80 * 1024 * 1024,
	document: 30 * 1024 * 1024,
	data: 10 * 1024 * 1024, // 10 MB
	image: 15 * 1024 * 1024, // 15 MB
	audio: 80 * 1024 * 1024, // 80 MB
	video: 30 * 1024 * 1024, // 30 MB (Reduced to prevent memory errors)
};

const LOSSY_TARGETS = ["jpg", "jpeg", "webp"];

export default function App() {
	const [jobs, setJobs] = useState([]);
	const [activeRecipe, setActiveRecipe] = useState(null);
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
	// media output controls ("720" preserves the old min(1280, iw) cap)
	const [resolution, setResolution] = useState("720");
	const [bitrate, setBitrate] = useState(192);
	const [compressionOptions, setCompressionOptions] = useState({
		mode: "best-effort",
		reduction: 50,
	});

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
		const isText =
			mime?.startsWith("text/") ||
			[
				"application/json;charset=utf-8",
				"application/yaml;charset=utf-8",
				"application/x-ndjson;charset=utf-8",
			].includes(mime);
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
		const w = new ConversionWorker(
			() => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
			({ jobIds, message }) => {
				const error = `${message}. Retry the failed files to start a fresh worker.`;
				setFfmpegLoading(false);
				setFfmpegProgress(0);
				setToast({ message: error, type: "error" });
				if (jobIds.length) {
					runRef.current.failed += jobIds.length;
					setJobs((prev) =>
						prev.map((job) => (jobIds.includes(job.id) ? { ...job, status: "error", error } : job)),
					);
					finishIfRunDone();
				}
			},
		);
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
				case "compression-progress":
					setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, progress: ratio } : j)));
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
						prev.map((j) => {
							if (j.id !== jobId) return j;
							if (j.result?.url && j.result.url !== resultUrlRef.current) {
								URL.revokeObjectURL(j.result.url);
							}
							return { ...j, status: "done", progress: 1, result: res };
						}),
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
		setActiveRecipe(null);
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
				id: createJobId(),
				file: f,
				ext: newExt,
				category,
				target: targetOptionsFor(newExt).includes(activeRecipe?.targets?.[category])
					? activeRecipe.targets[category]
					: defaultTargetFor(newExt, category),
				options: {
					...(activeRecipe?.options?.[category] || {}),
					...(category === "image" ? activeRecipe?.imageOptions : {}),
				},
				status: category === "archive" ? "archive" : "ready",
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
		setJobs((prev) =>
			prev.map((j) => (j.id === id ? { ...j, target, status: "ready", error: null } : j)),
		);
	}

	function setJobOptions(id, options) {
		setJobs((prev) =>
			prev.map((j) => (j.id === id ? { ...j, options, status: "ready", error: null } : j)),
		);
	}

	function applyRecipe(recipe) {
		setActiveRecipe(recipe);
		if (recipe.compressionOptions) setCompressionOptions(recipe.compressionOptions);
		if (recipe.quality != null) setQuality(recipe.quality);
		if (recipe.bitrate != null) setBitrate(recipe.bitrate);
		if (recipe.resolution) setResolution(recipe.resolution);
		setJobs((prev) =>
			prev.map((job) => {
				if (job.category === "archive" || job.sourceFiles) return job;
				return {
					...job,
					target: targetOptionsFor(job.ext).includes(recipe.targets?.[job.category])
						? recipe.targets[job.category]
						: job.target,
					options: {
						...job.options,
						...recipe.options?.[job.category],
						...(job.category === "image" ? recipe.imageOptions : {}),
					},
					status: "ready",
					error: null,
				};
			}),
		);
	}

	function captureRecipe() {
		const targets = {},
			options = {};
		for (const job of jobs)
			if (!targets[job.category] && !job.sourceFiles && job.category !== "archive") {
				targets[job.category] = job.target;
				options[job.category] = job.options || {};
			}
		return { targets, options, quality, resolution, bitrate, compressionOptions };
	}

	async function handleBundle(category) {
		if (isConverting) return;
		const files = jobs
			.filter((job) => !job.sourceFiles && job.category === category && job.file.arrayBuffer)
			.map((job) => job.file);
		if (files.length < 2) return;
		const job = {
			id: createJobId(),
			file: {
				name: category === "image" ? "combined-images.pdf" : "merged.pdf",
				size: files.reduce((n, f) => n + f.size, 0),
			},
			ext: category === "image" ? "image-bundle" : "pdf-bundle",
			category: "document",
			target: "pdf",
			sourceFiles: files,
			sourceOptions: jobs
				.filter((j) => !j.sourceFiles && j.category === category && j.file.arrayBuffer)
				.map((j) => j.options || {}),
			status: "ready",
			progress: 0,
		};
		setJobs((prev) => [...prev, job]);
		await runJobs([job]);
	}

	function removeJob(id) {
		setJobs((prev) => {
			const job = prev.find((j) => j.id === id);
			if (job?.result?.url) URL.revokeObjectURL(job.result.url);
			return prev.filter((j) => j.id !== id);
		});
	}

	async function handleConvertAll() {
		await runJobs(
			jobs.filter(
				(j) => j.category !== "archive" && (j.status === "ready" || j.status === "error"),
			),
		);
	}

	async function runJobs(pending) {
		if (isConverting || !workerRef.current || pending.length === 0) return;

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
				if (job.category === "audio" || job.category === "video" || job.ext === "gif") {
					messagePayload.mediaOptions = { resolution, bitrate, ...job.options };
				}
				if (job.target === "compress") messagePayload.compressionOptions = compressionOptions;
				if (job.category === "image") messagePayload.imageOptions = job.options;
				if (isBrowserJob(job)) {
					const output = await runBrowserJob(
						job,
						compressionOptions,
						(ratio) =>
							workerRef.current.onmessage({
								data: { status: "compression-progress", jobId: job.id, ratio },
							}),
						quality,
					);
					workerRef.current.onmessage({
						data: {
							status: "done",
							jobId: job.id,
							filename: `${job.file.name.replace(/\.[^.]+$/, "")}.${output.suffix}`,
							buffer: output.outBuffer,
							mime: output.mime,
							warnings: output.warnings,
						},
					});
					continue;
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
		const zip = createArchive(done.map((j) => j.result));
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
	const isMedia = jobs.some(
		(j) =>
			[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(j.ext) ||
			(j.ext === "gif" && ["mp4", "webm", "animated-webp"].includes(j.target)),
	);

	const failedCount = jobs.filter((j) => j.status === "error").length;
	const totalBytes = jobs.reduce((n, j) => n + j.file.size, 0);

	return (
		<Shell
			brand={<Brand name="ezconv" glyph="cv" scope="Self-hosted file converter" />}
			title="Convert"
			sub="Convert, compress, edit and extract images, PDFs, audio, video, documents, data and ZIPs. Everything stays on your device."
			width="max-w-[1120px]"
		>
			<div className="pointer-events-none fixed top-16 right-4 z-50 w-[min(380px,calc(100vw-2rem))]">
				<AnimatePresence>
					{toast && (
						<motion.div
							key={toast.message}
							className="pointer-events-auto"
							initial={{ opacity: 0, y: -8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, x: 16 }}
							transition={spring}
						>
							<Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<Stagger className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<StaggerItem className="lg:col-span-2">
					<DropZone
						onFiles={addFiles}
						disabled={isConverting}
						isDragging={isDragging}
						setIsDragging={setIsDragging}
						inputRef={inputRef}
						acceptString={acceptString}
						empty={jobs.length === 0}
					/>
				</StaggerItem>
				<StaggerItem className="space-y-4">
					<Collapse open={ffmpegLoading}>
						<Notice tone="warn">
							<div className="font-medium">
								Loading the FFmpeg core (about 28 MB, served from this server)
							</div>
							<div className="mt-0.5 text-[12px] text-mute">
								The first media conversion takes a moment.
							</div>
							<Loading label="Fetching ffmpeg-core.wasm" className="items-start py-3" />
						</Notice>
					</Collapse>

					<section className={`${panel} p-5`}>
						<Recipes current={captureRecipe()} onApply={applyRecipe} disabled={isConverting} />
						{activeRecipe && (
							<p className="mt-2 text-[12px] text-mute">Applied: {activeRecipe.name}</p>
						)}
					</section>

					{jobs.length > 0 && (
						<section className={panel}>
							<header className="flex items-center gap-3 border-b border-line px-5 py-3">
								<SectionLabel>Files</SectionLabel>
								<span className="font-mono text-[12px] text-mute">
									{jobs.length.toLocaleString("en-US")}
								</span>
							</header>
							<div className="divide-y divide-line">
								<AnimatePresence initial={false}>
									{jobs.map((job) => (
										<SlideRow key={job.id}>
											<JobRow
												job={job}
												disabled={isConverting}
												onTarget={setJobTarget}
												onRemove={removeJob}
												onOptions={setJobOptions}
												onFiles={addFiles}
											/>
										</SlideRow>
									))}
								</AnimatePresence>
							</div>
						</section>
					)}

					<Collapse open={showQuality || isMedia || jobs.some((j) => j.target === "compress")}>
						<section className={`${panel} space-y-4 p-5`}>
							<SectionLabel>Output</SectionLabel>
							{jobs.some((j) => j.target === "compress") && (
								<CompressionControls
									value={compressionOptions}
									onChange={setCompressionOptions}
									disabled={isConverting}
									hasPdf={jobs.some((j) => j.ext === "pdf" && j.target === "compress")}
								/>
							)}
							{showQuality && (
								<div>
									<label htmlFor="quality-range" className={labelCls}>
										Quality <span className="font-mono text-ink">{Math.round(quality * 100)}%</span>{" "}
										(JPG and WebP)
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
										className="w-full"
									/>
								</div>
							)}
							{isMedia && (
								<div className="grid gap-3 sm:grid-cols-2">
									<div>
										<label htmlFor="resolution-select" className={labelCls}>
											Maximum resolution
										</label>
										<select
											id="resolution-select"
											className={selectCls}
											value={resolution}
											onChange={(e) => setResolution(e.target.value)}
											disabled={isConverting}
										>
											<option value="original">Original</option>
											<option value="1080">1080p</option>
											<option value="720">720p</option>
											<option value="480">480p</option>
										</select>
									</div>
									<div>
										<label htmlFor="bitrate-select" className={labelCls}>
											Audio bitrate
										</label>
										<select
											id="bitrate-select"
											className={selectCls}
											value={bitrate}
											onChange={(e) => setBitrate(Number(e.target.value))}
											disabled={isConverting}
										>
											<option value={128}>128 kbps</option>
											<option value={192}>192 kbps</option>
											<option value={256}>256 kbps</option>
										</select>
									</div>
								</div>
							)}
						</section>
					</Collapse>

					<div className="flex flex-wrap gap-2">
						{jobs.filter((j) => j.ext === "pdf").length >= 2 && (
							<button
								type="button"
								className={cx(btn.base, btn.ghost)}
								disabled={isConverting}
								onClick={() => handleBundle("document")}
							>
								Merge all PDFs
							</button>
						)}
						{jobs.filter((j) => j.category === "image").length >= 2 && (
							<button
								type="button"
								className={cx(btn.base, btn.ghost)}
								disabled={isConverting}
								onClick={() => handleBundle("image")}
							>
								Combine images into PDF
							</button>
						)}
						<button
							type="button"
							onClick={handleConvertAll}
							className={cx(btn.base, btn.primary)}
							disabled={
								isConverting ||
								!jobs.some((j) => j.category !== "archive" && ["ready", "error"].includes(j.status))
							}
						>
							{isConverting && <Spinner />}
							{jobs.length > 1 ? "Convert all" : "Convert"}
						</button>
						{doneCount >= 2 && (
							<button
								type="button"
								onClick={handleZip}
								disabled={isConverting}
								className={cx(btn.base, btn.ghost)}
							>
								Download ZIP
							</button>
						)}
						<button
							type="button"
							onClick={handleReset}
							className={cx(btn.base, btn.ghost)}
							disabled={isConverting}
						>
							Reset
						</button>
						<span className="ml-auto hidden items-center gap-1.5 self-center text-[12px] text-mute sm:flex">
							<Kbd>Ctrl O</Kbd> browse <Kbd>Enter</Kbd> convert
						</span>
					</div>
				</StaggerItem>

				<StaggerItem className="space-y-4">
					<section className={`${panel} p-5`}>
						<div className="flex items-center gap-2">
							<SectionLabel>Status</SectionLabel>
							<Chip
								tone={
									isConverting
										? "accent"
										: failedCount > 0
											? "bad"
											: doneCount > 0
												? "ok"
												: "neutral"
								}
								className="ml-auto"
							>
								<Dot
									tone={
										isConverting
											? "accent"
											: failedCount > 0
												? "bad"
												: doneCount > 0
													? "ok"
													: "neutral"
									}
									live={isConverting}
								/>
								{status}
							</Chip>
						</div>
						<div className="mt-4 grid grid-cols-3 gap-4">
							<Stat label="Files" value={jobs.length.toLocaleString("en-US")} />
							<Stat
								label="Done"
								value={doneCount.toLocaleString("en-US")}
								tone={doneCount > 0 ? "ok" : undefined}
							/>
							<Stat
								label="Failed"
								value={failedCount.toLocaleString("en-US")}
								tone={failedCount > 0 ? "bad" : undefined}
							/>
						</div>
						<div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px]">
							<span className="text-mute">Input size</span>
							<span className="font-mono text-dim">
								{jobs.length ? humanBytes(totalBytes) : "–"}
							</span>
						</div>
						{isConverting && ffmpegProgress > 0 && (
							<div className="mt-3">
								<div className="mb-1.5 flex justify-between text-[12px]">
									<span className="text-mute">Current file</span>
									<span className="font-mono text-ink">{Math.round(ffmpegProgress * 100)}%</span>
								</div>
								<Bar value={ffmpegProgress} />
							</div>
						)}
					</section>

					<ResultCard result={result} copied={copied} onCopy={handleCopy} />

					{isMedia && (
						<LogsPanel
							logs={ffmpegLogs}
							showLogs={showLogs}
							onToggle={() => setShowLogs((s) => !s)}
						/>
					)}
				</StaggerItem>
			</Stagger>
		</Shell>
	);
}
