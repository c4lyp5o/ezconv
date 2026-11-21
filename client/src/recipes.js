export const BUILTIN_RECIPES = [
	{
		name: "Email attachment (under 2 MB)",
		targets: { image: "compress", document: "compress" },
		compressionOptions: { mode: "size", targetMB: 2, minQuality: 0.6 },
		imageOptions: {},
	},
	{
		name: "Website image",
		targets: { image: "webp" },
		quality: 0.82,
		imageOptions: { width: 1600, stripMetadata: true },
	},
	{
		name: "Voice recording",
		targets: { audio: "mp3", video: "mp3" },
		bitrate: 128,
		resolution: "original",
	},
];

export function loadRecipes() {
	try {
		const recipes = JSON.parse(localStorage.getItem("ezconv-recipes") || "[]");
		return Array.isArray(recipes)
			? recipes
					.filter(
						(r) => r && typeof r.name === "string" && r.targets && typeof r.targets === "object",
					)
					.slice(0, 20)
			: [];
	} catch {
		return [];
	}
}
