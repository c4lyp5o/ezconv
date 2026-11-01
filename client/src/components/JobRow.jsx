import { Bar, Collapse } from "../ez/motion";
import { btn, Chip, cx, selectCls } from "../ez/ui";
import { humanBytes, sizeNote, targetOptionsFor } from "../format";

const STATUS = {
	ready: { text: "Ready", tone: "neutral" },
	converting: { text: "Converting", tone: "accent" },
	done: { text: "Done", tone: "ok" },
	error: { text: "Failed", tone: "bad" },
};

export default function JobRow({ job, disabled, onTarget, onRemove }) {
	const options = targetOptionsFor(job.ext);
	const r = job.result;
	const s = STATUS[job.status];
	const pct = Math.round((job.progress || 0) * 100);
	return (
		<div className="px-5 py-3.5">
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[13px] font-medium text-ink">{job.file.name}</p>
					<p className="mt-0.5 font-mono text-[12px] text-mute">
						{humanBytes(job.file.size)} · {job.ext.toUpperCase()}
					</p>
				</div>
				<Chip tone={s.tone}>
					{s.text}
					{job.status === "converting" && <span className="font-mono">{pct}%</span>}
				</Chip>
				<select
					aria-label={`Target format for ${job.file.name}`}
					className={cx(selectCls, "w-auto py-1.5 text-[12px]")}
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
					className="rounded-md p-1 text-mute hover:bg-hover hover:text-ink disabled:opacity-40"
					aria-label={`Remove ${job.file.name}`}
				>
					<svg
						viewBox="0 0 20 20"
						className="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
						aria-hidden
					>
						<path d="M5 5l10 10M15 5L5 15" />
					</svg>
				</button>
			</div>

			{job.status === "converting" && (
				<div
					className="mt-3"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={pct}
					aria-label={`Converting ${job.file.name}`}
				>
					<Bar value={job.progress || 0} />
				</div>
			)}

			<Collapse open={job.status === "done" && !!r}>
				{r && (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 text-[12px]">
						<span className="font-mono text-dim">
							{humanBytes(r.fromSize)} → {humanBytes(r.toSize)}{" "}
							<span className="text-mute">({sizeNote(r.fromSize, r.toSize)})</span>
						</span>
						{r.warnings?.length > 0 && <span className="text-warn">{r.warnings.join("; ")}</span>}
						<span className="ml-auto flex gap-2">
							<a href={r.url} download={r.name} className={cx(btn.sm, btn.ghost)}>
								Download
							</a>
							{r.isImage && (
								<a href={r.url} target="_blank" rel="noreferrer" className={cx(btn.sm, btn.ghost)}>
									Open
								</a>
							)}
						</span>
					</div>
				)}
			</Collapse>

			<Collapse open={job.status === "error"}>
				<p className="pt-2 text-[12px] text-bad">{job.error}</p>
			</Collapse>
		</div>
	);
}
