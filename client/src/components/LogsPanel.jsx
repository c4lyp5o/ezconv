import { Collapse } from "../ez/motion";
import { btn, panel, SectionLabel } from "../ez/ui";

export default function LogsPanel({ logs, showLogs, onToggle }) {
	return (
		<section className={panel}>
			<header className="flex items-center gap-3 px-5 py-3">
				<SectionLabel>FFmpeg log</SectionLabel>
				<span className="font-mono text-[12px] text-mute">
					{logs.length.toLocaleString("en-US")} lines
				</span>
				<button
					type="button"
					className={`${btn.text} ml-auto text-[12px]`}
					onClick={onToggle}
					aria-expanded={showLogs}
				>
					{showLogs ? "Hide" : "Show"}
				</button>
			</header>
			<Collapse open={showLogs}>
				<div className="max-h-48 overflow-auto border-t border-line bg-inset px-5 py-3 font-code text-[12px] leading-relaxed text-dim">
					{logs.length === 0 ? (
						<div className="text-mute">No log lines yet.</div>
					) : (
						logs.map((l, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: log lines have no ids
							<div key={i} className="whitespace-pre-wrap">
								{l}
							</div>
						))
					)}
				</div>
			</Collapse>
		</section>
	);
}
