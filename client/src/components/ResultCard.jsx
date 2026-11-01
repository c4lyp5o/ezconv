import { AnimatePresence, motion, rise } from "../ez/motion";
import { btn, cx, panel, SectionLabel } from "../ez/ui";
import { humanBytes, sizeNote } from "../format";

export default function ResultCard({ result, copied, onCopy }) {
	return (
		<AnimatePresence mode="wait">
			{result && (
				<motion.section
					key={result.url}
					className={cx(panel, "p-5")}
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0 }}
					transition={rise}
				>
					<SectionLabel>Last result</SectionLabel>
					<div className="mt-3 flex items-center gap-3">
						{result.isImage && (
							<img
								src={result.url}
								alt={result.name}
								className="h-14 w-14 rounded border border-line object-cover"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-medium text-ink">{result.name}</p>
							<p className="mt-0.5 font-mono text-[12px] text-mute">
								{humanBytes(result.fromSize)} → {humanBytes(result.toSize)} (
								{sizeNote(result.fromSize, result.toSize)})
							</p>
							{result.warnings.length > 0 && (
								<p className="mt-0.5 text-[12px] text-warn">{result.warnings.join("; ")}</p>
							)}
						</div>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						<a href={result.url} download={result.name} className={cx(btn.sm, btn.ghost)}>
							Download
						</a>
						{result.isImage && (
							<a
								href={result.url}
								target="_blank"
								rel="noreferrer"
								className={cx(btn.sm, btn.ghost)}
							>
								Open
							</a>
						)}
						{result.isText && (
							<button type="button" onClick={onCopy} className={cx(btn.sm, btn.ghost)}>
								{copied ? "Copied" : "Copy"}
							</button>
						)}
					</div>
				</motion.section>
			)}
		</AnimatePresence>
	);
}
