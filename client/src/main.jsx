import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { MotionRoot } from "./ez/motion";

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<MotionRoot>
			<App />
		</MotionRoot>
	</StrictMode>,
);

// offline support: cache the shell and assets (including the ffmpeg core)
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/sw.js").catch(() => {});
	});
}
