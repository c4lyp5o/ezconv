import wasmURL from "@ffmpeg/core/wasm?url";
import coreURL from "@ffmpeg/core?url";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, imageMimeFor, VIDEO_EXTENSIONS } from "./file-config";

const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

// Singleton instance for FFmpeg
let ffmpegInstance = null;

// Serialize a workbook to xlsx bytes (exact slice — no slack from pooled buffers)
const writeWorkbookFile = (wb) => {
	const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
	const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	const outBuffer = ArrayBuffer.isView(data)
		? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
		: data;

	return { mime, outBuffer };
};

// Create XLSX file from worksheet
const createXlsxFile = (worksheet) => {
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, worksheet, "Sheet1");
	return writeWorkbookFile(wb);
};

// Image conversion using Canvas API
const convertImage = async (arrayBuffer, fromExt, toExt, quality) => {
	try {
		const blob = new Blob([arrayBuffer], { type: imageMimeFor(fromExt) });
		const imageBitmap = await createImageBitmap(blob);

		const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(imageBitmap, 0, 0);

		imageBitmap.close();

		// quality is honored for jpeg/webp and ignored by png
		const outBlob = await canvas.convertToBlob({
			type: imageMimeFor(toExt),
			quality,
		});
		return await outBlob.arrayBuffer();
	} catch (err) {
		console.error("[worker] Image conversion failed", err);
		throw new Error("Image conversion failed. The format may not be supported.");
	}
};

// Initialize FFmpeg on first use — the core files are bundled assets served
// by our own server (no third-party CDN fetch, works offline)
const initFFmpeg = async () => {
	if (ffmpegInstance) return ffmpegInstance;

	try {
		postMessage({ status: "ffmpeg-loading" });
		postMessage({ status: "log", message: "Loading FFmpeg core..." });

		const ff = new FFmpeg();
		await ff.load({ coreURL, wasmURL });

		// real event API: setLogger/setProgress only exist on the inner ffmpeg,
		// the public class emits "log" and "progress" events
		ff.on("log", ({ type, message }) => {
			postMessage({ status: "ffmpeg-log", message: `[${type}] ${message}` });
		});
		ff.on("progress", ({ progress }) => {
			postMessage({ status: "ffmpeg-progress", ratio: progress });
		});

		postMessage({ status: "ffmpeg-ready" });
		console.log("[worker] FFmpeg ready");
		ffmpegInstance = ff;
		return ffmpegInstance;
	} catch (err) {
		console.error("[worker] FFmpeg init failed", err);
		throw err;
	}
};

// Media conversion using FFmpeg
const convertMedia = async (arrayBuffer, fromExt, toExt) => {
	try {
		const ff = await initFFmpeg();

		const inputName = `input.${fromExt}`;
		const outputName = `output.${toExt}`;

		postMessage({ status: "log", message: `Writing ${inputName}` });

		await ff.writeFile(inputName, new Uint8Array(arrayBuffer));

		// Build safer ffmpeg args for video to reduce wasm memory pressure
		const args = ["-y", "-threads", "1", "-i", inputName];

		// If same extension/container and no re-encode needed, try a stream copy first
		const tryCopy =
			fromExt === toExt &&
			(MEDIA_EXTENSIONS.includes(fromExt) || IMAGE_EXTENSIONS.includes(fromExt));
		if (tryCopy) {
			// attempt container/codec copy (fast, low memory)
			args.push("-c", "copy", outputName);
		} else if (VIDEO_EXTENSIONS.includes(fromExt) || VIDEO_EXTENSIONS.includes(toExt)) {
			// For video conversions, use conservative defaults to reduce memory:
			// - single thread (-threads 1)
			// - downscale to max width 1280 to reduce working memory
			// - choose relatively light codec params depending on target
			// Note: codec support depends on the ffmpeg wasm build; these are common options.
			const scaleFilter = "scale='min(1280,iw)':'-2'"; // keep aspect ratio, max width 1280
			if (toExt === "webm") {
				args.push(
					"-vf",
					scaleFilter,
					"-c:v",
					"libvpx",
					"-b:v",
					"1M",
					"-c:a",
					"libvorbis",
					outputName,
				);
			} else if (toExt === "mp4" || toExt === "m4a") {
				// mp4 container with H.264/AAC (if available)
				args.push(
					"-vf",
					scaleFilter,
					"-c:v",
					"libx264",
					"-preset",
					"veryfast",
					"-crf",
					"28",
					"-c:a",
					"aac",
					outputName,
				);
			} else {
				// fallback: attempt simple re-encode with scaling to limit footprint
				args.push(
					"-vf",
					scaleFilter,
					"-c:v",
					"libx264",
					"-preset",
					"veryfast",
					"-crf",
					"30",
					"-c:a",
					"aac",
					outputName,
				);
			}
		} else {
			// audio / other media: default simple conversion
			args.push(outputName);
		}

		postMessage({
			status: "log",
			message: `Running ffmpeg ${args.join(" ")}`,
		});
		try {
			await ff.exec(args);
		} catch (err) {
			console.error("[worker] ffmpeg exec error", err);
			throw err;
		}

		postMessage({ status: "log", message: `Reading ${outputName}` });
		let data;
		try {
			data = await ff.readFile(outputName);
		} catch (err) {
			console.error("[worker] ffmpeg readFile error", err);
			throw err;
		}

		const outBuffer = data.buffer;
		postMessage({
			status: "log",
			message: `Conversion finished: ${outputName} (${outBuffer.byteLength} bytes)`,
		});
		return outBuffer;
	} catch (err) {
		console.error("[worker] Media conversion failed", err);
		throw new Error(`Media conversion failed: ${err.message}. Please try another format.`);
	}
};

const handleConvert = async ({ filename, target, ext, text, arrayBuffer, quality }) => {
	try {
		const outName = `${filename.replace(/\.[^.]+$/, "")}.${target}`;
		const warnings = [];
		let mime = "application/octet-stream";
		let outBuffer;

		if (ext === "json") {
			let json;
			try {
				const src = typeof text === "string" ? text : new TextDecoder().decode(arrayBuffer);
				json = JSON.parse(src);
			} catch (err) {
				throw new Error(`Invalid JSON input: ${err.message || String(err)}`);
			}
			// normalize to a row array: a plain object becomes one row instead
			// of silently producing an empty "successful" output
			let rows;
			if (Array.isArray(json)) {
				rows = json;
			} else if (json && typeof json === "object") {
				rows = [json];
			} else {
				throw new Error("JSON must be an object or an array of objects");
			}
			if (target === "csv") {
				const csv = Papa.unparse(rows);
				if (rows.length > 0 && !csv) {
					throw new Error("JSON produced an empty CSV");
				}
				mime = "text/csv;charset=utf-8";
				outBuffer = new TextEncoder().encode(csv).buffer;
			} else if (target === "xlsx") {
				({ mime, outBuffer } = createXlsxFile(XLSX.utils.json_to_sheet(rows)));
			}
		} else if (ext === "csv") {
			const csvText = typeof text === "string" ? text : new TextDecoder().decode(arrayBuffer);
			if (target === "json") {
				let res;
				try {
					res = Papa.parse(csvText, {
						header: true,
						// no dynamicTyping: a converter must not rewrite "007" to 7
						skipEmptyLines: true,
					});
				} catch (err) {
					throw new Error(`CSV parse error: ${err.message || String(err)}`);
				}
				const json = res.data;
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8";
				outBuffer = new TextEncoder().encode(jsonStr).buffer;
			} else if (target === "xlsx") {
				const ws = XLSX.utils.csv_to_sheet(csvText);
				({ mime, outBuffer } = createXlsxFile(ws));
			}
		} else if (ext === "xlsx" || ext === "xls") {
			const ab = arrayBuffer;
			const wb = XLSX.read(ab, { type: "array" });
			const first = wb.SheetNames[0];
			const ws = wb.Sheets[first];
			// xlsx target re-emits every sheet; json/csv can only carry one
			if (target !== "xlsx" && wb.SheetNames.length > 1) {
				warnings.push(`${wb.SheetNames.length} sheets found — only "${first}" was exported`);
			}
			if (target === "json") {
				const json = XLSX.utils.sheet_to_json(ws, { defval: null });
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8";
				outBuffer = new TextEncoder().encode(jsonStr).buffer;
			} else if (target === "csv") {
				const csv = XLSX.utils.sheet_to_csv(ws);
				mime = "text/csv;charset=utf-8";
				outBuffer = new TextEncoder().encode(csv).buffer;
			} else if (target === "xlsx") {
				// re-emit the whole workbook so every sheet survives (e.g. xls -> xlsx)
				({ mime, outBuffer } = writeWorkbookFile(wb));
			}
		} else if (IMAGE_EXTENSIONS.includes(ext)) {
			// Convert image format using Canvas API
			if (ext === "gif") {
				warnings.push("gif animation flattened to a single frame");
			}
			outBuffer = await convertImage(arrayBuffer, ext, target, quality);
			mime = imageMimeFor(target);
		} else if (MEDIA_EXTENSIONS.includes(ext)) {
			// Convert using FFmpeg
			outBuffer = await convertMedia(arrayBuffer, ext, target);
			const mimeMap = {
				mp3: "audio/mpeg",
				wav: "audio/wav",
				aac: "audio/aac",
				flac: "audio/flac",
				ogg: "audio/ogg",
				m4a: "audio/mp4",
				mp4: "video/mp4",
				avi: "video/avi",
				mkv: "video/x-matroska",
				mov: "video/quicktime",
				webm: "video/webm",
				flv: "video/x-flv",
			};
			mime = mimeMap[target] || "application/octet-stream";
		} else {
			throw new Error("Unsupported input format");
		}

		// No branch handled this pairing — refuse instead of "succeeding" with junk
		if (!outBuffer) {
			throw new Error(`Unsupported conversion: ${ext} to ${target}`);
		}

		// Transfer the array buffer back to the main thread
		postMessage({ status: "done", filename: outName, buffer: outBuffer, mime, warnings }, [
			outBuffer,
		]);
	} catch (err) {
		postMessage({ status: "error", message: err.message || String(err) });
		console.error("[worker] Conversion error", err);
	}
};

// One conversion at a time: later messages queue behind the running one,
// so two converts can never interleave on the shared ffmpeg/filesystem state
let queue = Promise.resolve();

self.onmessage = (e) => {
	const { action } = e.data;
	if (action !== "convert") return;
	queue = queue.then(() => handleConvert(e.data));
};
