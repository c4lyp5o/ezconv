import { humanBytes, sizeNote } from "../format";

export default function ResultCard({ result, copied, onCopy }) {
	if (!result) return null;
	return (
		<div className="bg-gray-700 border border-gray-600 rounded-lg p-4">
			<div className="flex items-center gap-3">
				{result.isImage && (
					<img
						src={result.url}
						alt={result.name}
						className="w-14 h-14 rounded border border-gray-600 object-cover"
					/>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-gray-200 truncate">{result.name}</p>
					<p className="text-xs text-gray-400">
						{humanBytes(result.fromSize)} → {humanBytes(result.toSize)} (
						{sizeNote(result.fromSize, result.toSize)})
						{result.warnings.length > 0 && ` · ${result.warnings.join("; ")}`}
					</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<a
					href={result.url}
					download={result.name}
					className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Download
				</a>
				{result.isImage && (
					<a
						href={result.url}
						target="_blank"
						rel="noreferrer"
						className="px-3 py-1.5 text-xs border border-gray-600 rounded hover:bg-gray-600"
					>
						Open
					</a>
				)}
				{result.isText && (
					<button
						type="button"
						onClick={onCopy}
						className="px-3 py-1.5 text-xs border border-gray-600 rounded hover:bg-gray-600"
					>
						{copied ? "Copied!" : "Copy"}
					</button>
				)}
			</div>
		</div>
	);
}
