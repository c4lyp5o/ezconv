import { humanBytes, sizeNote, targetOptionsFor } from "../format";

const STATUS_TEXT = {
	ready: "Ready",
	converting: "Converting…",
	done: "Done",
	error: "Failed",
};

export default function JobRow({ job, disabled, onTarget, onRemove }) {
	const options = targetOptionsFor(job.ext);
	const r = job.result;
	return (
		<div className="bg-gray-700 border border-gray-600 rounded-lg p-3">
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-gray-200 truncate">{job.file.name}</p>
					<p className="text-xs text-gray-400">
						{humanBytes(job.file.size)} ·{" "}
						<span className="font-semibold">{job.ext.toUpperCase()}</span> ·{" "}
						<span
							className={
								job.status === "done"
									? "text-green-400"
									: job.status === "error"
										? "text-red-400"
										: job.status === "converting"
											? "text-blue-400"
											: "text-gray-400"
							}
						>
							{STATUS_TEXT[job.status]}
						</span>
					</p>
				</div>
				<select
					aria-label={`Target format for ${job.file.name}`}
					className="border border-gray-600 bg-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
					value={job.target}
					onChange={(e) => onTarget(job.id, e.target.value)}
					disabled={disabled || job.status === "converting"}
				>
					{options.map((o) => (
						<option key={o} value={o}>
							{o.toUpperCase()}
						</option>
					))}
				</select>
				<button
					type="button"
					onClick={() => onRemove(job.id)}
					disabled={disabled || job.status === "converting"}
					className="text-gray-500 hover:text-gray-300 px-1"
					aria-label={`Remove ${job.file.name}`}
				>
					✕
				</button>
			</div>

			{job.status === "converting" && (
				<div
					className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-600"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round((job.progress || 0) * 100)}
				>
					<div
						className="h-2 rounded bg-blue-500 transition-all"
						style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}
					/>
				</div>
			)}

			{job.status === "done" && r && (
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
					<span className="text-green-400">
						✓ {humanBytes(r.fromSize)} → {humanBytes(r.toSize)} ({sizeNote(r.fromSize, r.toSize)})
					</span>
					{r.warnings?.length > 0 && (
						<span className="text-yellow-400">{r.warnings.join("; ")}</span>
					)}
					<a
						href={r.url}
						download={r.name}
						className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Download
					</a>
					{r.isImage && (
						<a
							href={r.url}
							target="_blank"
							rel="noreferrer"
							className="px-2 py-1 border border-gray-600 rounded hover:bg-gray-600"
						>
							Open
						</a>
					)}
				</div>
			)}

			{job.status === "error" && <p className="mt-2 text-xs text-red-400">✗ {job.error}</p>}
		</div>
	);
}
