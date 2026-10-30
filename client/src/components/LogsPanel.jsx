export default function LogsPanel({ logs, showLogs, onToggle }) {
	return (
		<>
			<div className="flex items-center justify-between mt-2">
				<div className="text-xs text-gray-400">FFmpeg logs</div>
				<button type="button" className="text-xs text-blue-600 underline" onClick={onToggle}>
					{showLogs ? "Hide logs" : "Show logs"}
				</button>
			</div>

			{showLogs && (
				<div className="mt-2 bg-black text-white text-xs rounded p-2 max-h-40 overflow-auto">
					{logs.length === 0 ? (
						<div className="opacity-60">No logs yet.</div>
					) : (
						logs.map((l, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: log lines have no ids
							<div key={i} className="whitespace-pre-wrap">
								{l}
							</div>
						))
					)}
				</div>
			)}
		</>
	);
}
