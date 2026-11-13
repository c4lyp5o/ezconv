import Backdrop from "../ez/Backdrop";
import { cx } from "../ez/lib";

export default function DropZone({
	onFiles,
	disabled,
	isDragging,
	setIsDragging,
	inputRef,
	acceptString,
	empty,
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drop target
		<div
			onDragOver={(e) => {
				if (disabled) return;
				e.preventDefault();
				setIsDragging(true);
			}}
			onDragLeave={() => {
				if (!disabled) setIsDragging(false);
			}}
			onDrop={(e) => {
				if (disabled) return;
				e.preventDefault();
				setIsDragging(false);
				if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
			}}
			className={cx(
				"relative isolate overflow-hidden rounded-lg border border-dashed text-center transition-colors",
				empty ? "min-h-[300px] px-6 pt-10 pb-40" : "px-6 py-8",
				isDragging
					? "border-accent bg-accent-dim"
					: "border-line-strong bg-surface hover:border-mute",
				disabled && "pointer-events-none opacity-60",
			)}
		>
			{empty && <Backdrop className="-z-10" opacity={0.55} nodes={12} shift={1.6} />}
			<div className="relative flex flex-col items-center gap-2">
				<svg
					viewBox="0 0 24 24"
					className="h-6 w-6 text-mute"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden
				>
					<path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
				</svg>
				<label className="block cursor-pointer text-[14px] text-ink">
					<span>Drop files here, paste, or </span>
					<input
						ref={inputRef}
						onChange={(e) => {
							if (e.target?.files?.length) onFiles(e.target.files);
						}}
						className="hidden"
						type="file"
						multiple
						accept={acceptString}
						disabled={disabled}
					/>
					<span className="border-b border-accent text-ink">browse</span>
				</label>
				<p className="text-[12px] text-mute">Data, images, PDFs, audio and video</p>
				<p className="text-[12px] text-mute">
					Choose Compress in an image’s format menu to reduce its size.
				</p>
			</div>
		</div>
	);
}
