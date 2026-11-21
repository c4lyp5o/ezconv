import { labelCls, selectCls } from "../ez/ui";

function Field({ job, name, label, value, onChange, type = "number", ...props }) {
	const id = `${job.id}-${name}`;
	return (
		<div>
			<label className={labelCls} htmlFor={id}>
				{label}
			</label>
			<input
				className={selectCls}
				id={id}
				type={type}
				value={value ?? ""}
				onChange={(e) => onChange(name, e.target.value)}
				{...props}
			/>
		</div>
	);
}

export default function JobOptions({ job, disabled, onOptions }) {
	const media =
		["audio", "video"].includes(job.category) ||
		(job.ext === "gif" && ["mp4", "webm", "animated-webp"].includes(job.target));
	const image = job.category === "image" && !media;
	const pdf = job.ext === "pdf" && job.target !== "compress";
	if (job.category === "text" && job.target === "pdf")
		return (
			<p className="mt-3 text-[12px] text-mute">
				PDF renders text and basic Markdown formatting as pages. Text will not be selectable;
				external images are omitted.
			</p>
		);
	if (!media && !image && !pdf) return null;
	const options = job.options || {};
	const change = (key, value) => onOptions(job.id, { ...options, [key]: value });
	return (
		<details className="mt-3 text-[12px]">
			<summary className="cursor-pointer text-mute">
				{media
					? "Trim and media options"
					: image
						? "Resize, crop, rotate and metadata"
						: "PDF page options"}
			</summary>
			<fieldset disabled={disabled} className="mt-3 grid gap-3 sm:grid-cols-2">
				{media && (
					<>
						<Field
							job={job}
							name="trimStart"
							label="Start time (seconds)"
							min="0"
							step="0.1"
							value={options.trimStart}
							onChange={change}
							placeholder="0"
						/>
						<Field
							job={job}
							name="trimEnd"
							label="End time (seconds, optional)"
							min="0"
							step="0.1"
							value={options.trimEnd}
							onChange={change}
							placeholder="End of file"
						/>
						{["gif", "animated-webp"].includes(job.target) && (
							<p className="text-mute sm:col-span-2">
								Animation uses 12 frames/second. Trim long clips to keep output and memory use
								manageable.
							</p>
						)}
					</>
				)}
				{image && (
					<>
						<Field
							job={job}
							name="width"
							label="Maximum width (px)"
							min="1"
							max="12000"
							value={options.width}
							onChange={change}
							placeholder="Original"
						/>
						<Field
							job={job}
							name="height"
							label="Maximum height (px)"
							min="1"
							max="12000"
							value={options.height}
							onChange={change}
							placeholder="Original"
						/>
						<div>
							<label htmlFor={`${job.id}-rotate`} className={labelCls}>
								Rotate clockwise
							</label>
							<select
								className={selectCls}
								id={`${job.id}-rotate`}
								value={options.rotate || 0}
								onChange={(e) => change("rotate", Number(e.target.value))}
							>
								{[0, 90, 180, 270].map((angle) => (
									<option key={angle} value={angle}>
										{angle}°
									</option>
								))}
							</select>
						</div>
						<Field
							job={job}
							name="background"
							label="Background for transparency"
							type="color"
							value={options.background || "#ffffff"}
							onChange={change}
						/>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={!!options.flatten}
								onChange={(e) => change("flatten", e.target.checked)}
							/>
							Flatten transparency (JPEG always uses a background)
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={!!options.stripMetadata}
								onChange={(e) => change("stripMetadata", e.target.checked)}
							/>
							Force metadata removal (re-encode)
						</label>
						<Field
							job={job}
							name="cropX"
							label="Crop left (px)"
							min="0"
							value={options.cropX}
							onChange={change}
							placeholder="0"
						/>
						<Field
							job={job}
							name="cropY"
							label="Crop top (px)"
							min="0"
							value={options.cropY}
							onChange={change}
							placeholder="0"
						/>
						<Field
							job={job}
							name="cropWidth"
							label="Crop width (px)"
							min="1"
							value={options.cropWidth}
							onChange={change}
							placeholder="Full width"
						/>
						<Field
							job={job}
							name="cropHeight"
							label="Crop height (px)"
							min="1"
							value={options.cropHeight}
							onChange={change}
							placeholder="Full height"
						/>
						<p className="text-mute sm:col-span-2">
							Crop first, then fit within the maximum dimensions without upscaling, then rotate.
							Animated GIF pictures flatten to one frame; choose a video or Animated WebP target to
							keep animation.
						</p>
					</>
				)}
				{pdf && (
					<>
						<Field
							job={job}
							name="pages"
							label="Pages (e.g. 1-3,5; blank = all)"
							type="text"
							value={options.pages}
							onChange={change}
						/>
						{["png", "jpg"].includes(job.target) && (
							<Field
								job={job}
								name="dpi"
								label="Image resolution (DPI)"
								min="36"
								max="300"
								value={options.dpi || 144}
								onChange={change}
							/>
						)}
						<p className="text-mute sm:col-span-2">
							Page ranges keep the order entered. Split and image exports download as a ZIP.
							Re-saving PDFs invalidates digital signatures.
						</p>
					</>
				)}
			</fieldset>
		</details>
	);
}
