import DOMPurify from "dompurify";
import { marked } from "marked";
import { PDFDocument } from "pdf-lib";

export function markdownHtml(text) {
	const body = DOMPurify.sanitize(marked.parse(text), {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ["img", "video", "audio", "iframe", "style", "link", "form", "input"],
		FORBID_ATTR: ["style"],
	});
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Converted document</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px}</style></head><body>${body}</body></html>`;
}

// Render document pages locally so Unicode uses browser fonts, without uploading
// content or loading remote images. Markdown PDF supports headings/lists/code/tables.
export async function textPdf(text, markdown = false) {
	let blocks;
	if (markdown) {
		const dom = new DOMParser().parseFromString(markdownHtml(text), "text/html");
		blocks = [...dom.body.children].map((node) => ({
			text:
				node.tagName === "TABLE"
					? [...node.querySelectorAll("tr")]
							.map((row) =>
								[...row.querySelectorAll("td,th")].map((cell) => cell.textContent).join(" | "),
							)
							.join("\n")
					: ["UL", "OL"].includes(node.tagName)
						? [...node.querySelectorAll("li")]
								.map(
									(item, i) => `${node.tagName === "OL" ? `${i + 1}.` : "•"} ${item.textContent}`,
								)
								.join("\n")
						: node.textContent,
			size: /^H[1-6]$/.test(node.tagName) ? 30 - Number(node.tagName[1]) * 2 : 16,
			bold: /^H/.test(node.tagName),
			mono: node.tagName === "PRE",
		}));
	} else blocks = [{ text, size: 16 }];
	const pdf = await PDFDocument.create();
	const canvas = document.createElement("canvas");
	canvas.width = 1240;
	canvas.height = 1754;
	const ctx = canvas.getContext("2d");
	let y = 90;
	const reset = () => {
		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "#111111";
		y = 90;
	};
	const save = async () => {
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!blob) throw new Error("Could not render document page");
		const image = await pdf.embedPng(await blob.arrayBuffer());
		pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
	};
	reset();
	try {
		for (const block of blocks) {
			const size = block.size * 2;
			ctx.font = `${block.bold ? "bold " : ""}${size}px ${block.mono ? "monospace" : "sans-serif"}`;
			for (const paragraph of block.text.split("\n")) {
				let line = "";
				// Split long tokens too, including text without spaces.
				for (const char of paragraph) {
					if (ctx.measureText(line + char).width > 1060 && line) {
						if (y + size > 1664) {
							await save();
							reset();
						}
						ctx.fillText(line, 90, y);
						y += size * 1.4;
						line = "";
					}
					line += char;
				}
				if (y + size > 1664) {
					await save();
					reset();
				}
				ctx.fillText(line, 90, y);
				y += size * 1.4;
			}
			y += 20;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		await save();
		return {
			outBuffer: (await pdf.save()).buffer,
			mime: "application/pdf",
			warnings: ["PDF uses rendered pages; text is not selectable. External images are omitted."],
		};
	} finally {
		canvas.width = canvas.height = 1;
	}
}
