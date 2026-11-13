import { COMPRESSION_PRESETS } from "../compression";
import { labelCls, selectCls } from "../ez/ui";

export default function CompressionControls({ value, onChange, disabled, hasPdf }) {
	return (
		<div className="space-y-3">
			<div>
				<label htmlFor="compression-preset" className={labelCls}>
					Compression preset
				</label>
				<select
					id="compression-preset"
					className={selectCls}
					value={value.mode}
					onChange={(e) => onChange({ ...value, mode: e.target.value })}
					disabled={disabled}
				>
					{COMPRESSION_PRESETS.map((preset) => (
						<option key={preset.value} value={preset.value}>
							{preset.label}
						</option>
					))}
				</select>
			</div>
			{value.mode === "percentage" && (
				<div>
					<label htmlFor="compression-reduction" className={labelCls}>
						Target size reduction: {value.reduction}% (keep {100 - value.reduction}% of original
						size)
					</label>
					<input
						id="compression-reduction"
						type="range"
						min="1"
						max="90"
						step="1"
						value={value.reduction}
						onChange={(e) => onChange({ ...value, reduction: Number(e.target.value) })}
						disabled={disabled}
						className="w-full"
					/>
					<p className="text-[12px] text-mute">
						We try several quality and size settings. The result reports if the target could not be
						reached.
					</p>
				</div>
			)}
			<p className="text-[12px] text-mute">
				Best effort keeps image dimensions. Stronger presets may reduce dimensions and detail.
				Already compact files are returned unchanged when possible.
			</p>
			{hasPdf && (
				<p className="text-[12px] text-warn" role="note">
					PDF best effort preserves text and document features. Other presets may rebuild pages as
					images, removing selectable text, links, forms and accessibility tags. Re-saving
					invalidates digital signatures. Password-protected PDFs are not supported.
				</p>
			)}
		</div>
	);
}
