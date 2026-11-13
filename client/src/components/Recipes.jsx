import { useState } from "react";
import { btn, cx, labelCls, selectCls } from "../ez/ui";
import { BUILTIN_RECIPES, loadRecipes } from "../recipes";

export default function Recipes({ current, onApply, disabled }) {
	const [saved, setSaved] = useState(loadRecipes),
		[name, setName] = useState(""),
		[error, setError] = useState("");
	function persist(next) {
		try {
			localStorage.setItem("ezconv-recipes", JSON.stringify(next));
			setSaved(next);
			setError("");
		} catch {
			setError("Could not save recipes in this browser.");
		}
	}
	return (
		<div className="space-y-3">
			<div>
				<label htmlFor="recipe-select" className={labelCls}>
					Conversion recipes
				</label>
				<select
					id="recipe-select"
					className={selectCls}
					defaultValue=""
					disabled={disabled}
					onChange={(e) => {
						const index = Number(e.target.value);
						if (e.target.value !== "") onApply([...BUILTIN_RECIPES, ...saved][index]);
						e.target.value = "";
					}}
				>
					<option value="">Apply a recipe to queued and newly added files…</option>
					{[...BUILTIN_RECIPES, ...saved].map((recipe, index) => (
						<option
							key={`${index >= BUILTIN_RECIPES.length ? "saved" : "builtin"}-${recipe.name}`}
							value={index}
						>
							{index >= BUILTIN_RECIPES.length ? "Saved: " : ""}
							{recipe.name}
						</option>
					))}
				</select>
			</div>
			<div className="flex flex-wrap gap-2">
				<label className="min-w-0 flex-1">
					<span className="sr-only">Recipe name</span>
					<input
						className={selectCls}
						placeholder="Name your current settings"
						aria-label="Recipe name"
						value={name}
						maxLength={60}
						onChange={(e) => setName(e.target.value)}
						disabled={disabled}
					/>
				</label>
				<button
					type="button"
					className={cx(btn.sm, btn.ghost)}
					disabled={disabled || !name.trim() || saved.length >= 20}
					onClick={() => {
						persist([
							...saved.filter((r) => r.name !== name.trim()),
							{ ...current, name: name.trim() },
						]);
						setName("");
					}}
				>
					Save recipe
				</button>
			</div>
			{saved.length > 0 && (
				<details>
					<summary className="cursor-pointer text-[12px] text-mute">
						Manage saved recipes ({saved.length})
					</summary>
					{saved.map((recipe) => (
						<div key={recipe.name} className="mt-2 flex items-center justify-between text-[12px]">
							<span>{recipe.name}</span>
							<button
								type="button"
								className={cx(btn.sm, btn.ghost)}
								disabled={disabled}
								onClick={() => persist(saved.filter((r) => r !== recipe))}
							>
								Delete
							</button>
						</div>
					))}
				</details>
			)}
			<p className="text-[12px] text-mute">
				Recipes save settings on this device, never file contents. Save uses the first queued file’s
				settings for each category.
			</p>
			{error && (
				<p className="text-[12px] text-bad" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
