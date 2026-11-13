import { useState } from "react";
import { btn, cx } from "../ez/ui";
import { getFileCategory } from "../file-config";
import { getFileExtension, humanBytes } from "../format";
import { extractEntry, inspectZip } from "../zip-tools";

export default function ArchivePanel({ file, onFiles, disabled }) {
	const [entries, setEntries] = useState(null),
		[selected, setSelected] = useState([]),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false);
	async function inspect() {
		setBusy(true);
		setError("");
		try {
			const items = await inspectZip(file);
			setEntries(items);
			setSelected(
				items
					.filter(
						(e) => getFileCategory(getFileExtension(e.name)) && getFileExtension(e.name) !== "zip",
					)
					.map((e) => e.name),
			);
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}
	async function extract(item, download) {
		const extracted = await extractEntry(item);
		if (!download) return extracted;
		const url = URL.createObjectURL(extracted),
			a = document.createElement("a");
		a.href = url;
		a.download = extracted.name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	async function addSelected() {
		setBusy(true);
		setError("");
		try {
			const files = [];
			for (const item of entries.filter((e) => selected.includes(e.name)))
				files.push(await extract(item, false));
			onFiles(files);
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="mt-3 space-y-2 text-[12px]">
			<button
				type="button"
				disabled={disabled || busy}
				onClick={inspect}
				className={cx(btn.sm, btn.ghost)}
			>
				{busy ? "Reading ZIP…" : "Preview ZIP contents"}
			</button>
			{entries && (
				<>
					<div className="max-h-64 overflow-auto space-y-2">
						{entries.map((item) => (
							<div key={item.name} className="flex items-center gap-2">
								<label className="flex min-w-0 flex-1 items-center gap-2">
									<input
										type="checkbox"
										checked={selected.includes(item.name)}
										disabled={
											disabled ||
											busy ||
											!getFileCategory(getFileExtension(item.name)) ||
											getFileExtension(item.name) === "zip"
										}
										onChange={(e) =>
											setSelected(
												e.target.checked
													? [...selected, item.name]
													: selected.filter((n) => n !== item.name),
											)
										}
									/>
									<span className="truncate" title={item.name}>
										{item.name}
									</span>
									<span className="shrink-0 text-mute">{humanBytes(item.size)}</span>
								</label>
								<button
									type="button"
									disabled={disabled || busy}
									className={cx(btn.sm, btn.ghost)}
									onClick={async () => {
										try {
											await extract(item, true);
										} catch (err) {
											setError(err.message);
										}
									}}
								>
									Extract
								</button>
							</div>
						))}
					</div>
					<button
						type="button"
						className={cx(btn.sm, btn.ghost)}
						disabled={disabled || busy || !selected.length}
						onClick={addSelected}
					>
						Add {selected.length} selected to conversion queue
					</button>
					<p className="text-mute">
						Preview up to 200 files / 200 MB expanded. Unsupported formats can still be extracted.
					</p>
				</>
			)}
			{error && (
				<p className="text-bad" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
