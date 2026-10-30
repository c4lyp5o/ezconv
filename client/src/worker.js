import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
	IMAGE_EXTENSIONS,
	AUDIO_EXTENSIONS,
	VIDEO_EXTENSIONS,
	imageMimeFor,
} from "./file-config";

const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

// Singleton instance for FFmpeg
let ffmpegInstance = null;

// Serialize a workbook to xlsx bytes (exact slice — no slack from pooled buffers)
const writeWorkbookFile = (wb) => {
	const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
	const mime =
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
const convertImage = async (arrayBuffer, fromExt, toExt) => {
	try {
		const blob = new Blob([arrayBuffer], { type: imageMimeFor(fromExt) });
		const imageBitmap = await createImageBitmap(blob);

		const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(imageBitmap, 0, 0);

		imageBitmap.close();

		const outBlob = await canvas.convertToBlob({ type: imageMimeFor(toExt) });
		return await outBlob.arrayBuffer();
	} catch (err) {
		console.error("[worker] Image conversion failed", err);
		throw new Error(
			"Image conversion failed. The format may not be supported.",
		);
	}
};

// Initialize FFmpeg on first use
const initFFmpeg = async () => {
	if (ffmpegInstance) return ffmpegInstance;

	try {
		postMessage({ status: "ffmpeg-loading" });
		postMessage({ status: "log", message: "Initializing FFmpeg..." });
		console.log("[worker] Initializing FFmpeg...");

		let mod = null;
		try {
			mod = await import("@ffmpeg/ffmpeg");
			postMessage({
				status: "log",
				message: "@ffmpeg/ffmpeg imported successfully",
			});
			console.log("[worker] @ffmpeg/ffmpeg imported successfully");
		} catch (err) {
			postMessage({
				status: "log",
				message: "@ffmpeg/ffmpeg import failed",
			});
			console.error("[worker] @ffmpeg/ffmpeg import failed", err);
			throw err;
		}

		// Try to import util helpers (fetchFile, toBlobURL) if available
		let util = null;
		try {
			util = await import("@ffmpeg/util");
			postMessage({
				status: "log",
				message: "@ffmpeg/util available",
			});
			console.log("[worker] @ffmpeg/util imported successfully");
		} catch (err) {
			postMessage({
				status: "log",
				message: "@ffmpeg/util not available",
			});
			console.warn("[worker] @ffmpeg/util import failed", err);
		}

		// Diagnostic: post module keys to help debugging import shape
		try {
			postMessage({
				status: "log",
				message: `@ffmpeg/ffmpeg import keys: ${Object.keys(mod).join(",")}`,
			});
			console.log("[worker] @ffmpeg/ffmpeg import keys", Object.keys(mod));
		} catch (err) {
			postMessage({
				status: "log",
				message: `@ffmpeg/ffmpeg import keys unavailable`,
			});
			console.warn("[worker] failed to get @ffmpeg/ffmpeg keys", err);
		}

		const FFmpegClass =
			mod.FFmpeg || mod.default?.FFmpeg || mod.default || null;

		let ff = null;

		const baseURL =
			"https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

		postMessage({
			status: "log",
			message: "Pulling FFmpeg",
		});
		ff = new FFmpegClass();
		const coreURL = util?.toBlobURL
			? await util
					.toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript")
					.catch(() => `${baseURL}/ffmpeg-core.js`)
			: `${baseURL}/ffmpeg-core.js`;

		const wasmURL = util?.toBlobURL
			? await util
					.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
					.catch(() => `${baseURL}/ffmpeg-core.wasm`)
			: `${baseURL}/ffmpeg-core.wasm`;

		await ff.load({ coreURL, wasmURL });

		// try {
		// 	ff.setLogger(({ type, message }) => {
		// 		postMessage({ status: "ffmpeg-log", message: `[${type}] ${message}` });
		// 	});
		// } catch (err) {
		// 	postMessage({
		// 		status: "log",
		// 		message: "ff.setLogger not supported",
		// 	});
		// 	console.warn("[worker] ff.setLogger not supported", err);
		// }

		// try {
		// 	ff.setProgress(({ ratio }) => {
		// 		postMessage({ status: "ffmpeg-progress", ratio });
		// 	});
		// } catch (err) {
		// 	postMessage({
		// 		status: "log",
		// 		message: "ff.setProgress not supported",
		// 	});
		// 	console.warn("[worker] ff.setProgress not supported", err);
		// }

		postMessage({ status: "ffmpeg-ready" });
		console.log("[worker] FFmpeg ready");
		ffmpegInstance = ff;
		return ffmpegInstance;
	} catch (err) {
		postMessage({ status: "error", message: err.message || String(err) });
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
			(MEDIA_EXTENSIONS.includes(fromExt) ||
				IMAGE_EXTENSIONS.includes(fromExt));
		if (tryCopy) {
			// attempt container/codec copy (fast, low memory)
			args.push("-c", "copy", outputName);
		} else if (
			VIDEO_EXTENSIONS.includes(fromExt) ||
			VIDEO_EXTENSIONS.includes(toExt)
		) {
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
			postMessage({ status: "error", message: err.message || String(err) });
			throw err;
		}

		postMessage({ status: "log", message: `Reading ${outputName}` });
		let data;
		try {
			data = await ff.readFile(outputName);
		} catch (err) {
			console.error("[worker] ffmpeg readFile error", err);
			postMessage({ status: "error", message: err.message || String(err) });
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
		throw new Error(
			`Media conversion failed: ${err.message}. Please try another format.`,
		);
	}
};

self.onmessage = async (e) => {
	const { action } = e.data;
	if (action !== "convert") return;

	try {
		const { filename, target, ext, text, arrayBuffer } = e.data;

		const outName = `${filename.replace(/\.[^.]+$/, "")}.${target}`;
		let mime = "application/octet-stream";
		let outBuffer;

		if (ext === "json") {
			let json;
			try {
				const src =
					typeof text === "string"
						? text
						: new TextDecoder().decode(arrayBuffer);
				json = JSON.parse(src);
			} catch (err) {
				throw new Error(`Invalid JSON input: ${err.message || String(err)}`);
			}
			if (target === "csv") {
				const csv = Papa.unparse(json);
				mime = "text/csv;charset=utf-8;";
				outBuffer = new TextEncoder().encode(csv).buffer;
			} else if (target === "xlsx") {
				({ mime, outBuffer } = createXlsxFile(XLSX.utils.json_to_sheet(json)));
			}
		} else if (ext === "csv") {
			const csvText =
				typeof text === "string" ? text : new TextDecoder().decode(arrayBuffer);
			if (target === "json") {
				let res;
				try {
					res = Papa.parse(csvText, {
						header: true,
						dynamicTyping: true,
						skipEmptyLines: true,
					});
				} catch (err) {
					throw new Error(`CSV parse error: ${err.message || String(err)}`);
				}
				const json = res.data;
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8;";
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
			if (target === "json") {
				const json = XLSX.utils.sheet_to_json(ws, { defval: null });
				const jsonStr = JSON.stringify(json, null, 2);
				mime = "application/json;charset=utf-8;";
				outBuffer = new TextEncoder().encode(jsonStr).buffer;
			} else if (target === "csv") {
				const csv = XLSX.utils.sheet_to_csv(ws);
				mime = "text/csv;charset=utf-8;";
				outBuffer = new TextEncoder().encode(csv).buffer;
			} else if (target === "xlsx") {
				// re-emit the whole workbook so every sheet survives (e.g. xls -> xlsx)
				({ mime, outBuffer } = writeWorkbookFile(wb));
			}
		} else if (IMAGE_EXTENSIONS.includes(ext)) {
			// Convert image format using Canvas API
			outBuffer = await convertImage(arrayBuffer, ext, target);
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
		postMessage(
			{ status: "done", filename: outName, buffer: outBuffer, mime },
			[outBuffer],
		);
	} catch (err) {
		postMessage({ status: "error", message: err.message || String(err) });
		console.error("[worker] Conversion error", err);
	}
};
