export default function DropZone({
	onFiles,
	disabled,
	isDragging,
	setIsDragging,
	inputRef,
	acceptString,
}) {
	return (
		<>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: drop target */}
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
				className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
					isDragging ? "border-blue-500 bg-blue-900/20" : "border-gray-600 bg-gray-700/50"
				}
			${disabled ? " opacity-60 pointer-events-none" : ""}`}
			>
				<div className="mb-3 text-3xl">📄</div>
				<label className="block cursor-pointer">
					<span className="text-sm font-medium text-gray-300">Drag & drop files here or</span>
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
					<span className="text-blue-600 hover:underline ml-1">browse</span>
				</label>
				<p className="text-xs text-gray-400 mt-2">Data, Images, Audio, or Video</p>
			</div>
		</>
	);
}
