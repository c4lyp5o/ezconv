import { useEffect } from "react";
import { Notice } from "../ez/ui";

export default function Toast({ message, type, onClose }) {
	useEffect(() => {
		const timer = setTimeout(onClose, 4000);
		return () => clearTimeout(timer);
	}, [onClose]);

	return (
		<Notice tone={type === "success" ? "ok" : "bad"} onClose={onClose}>
			{message.replace(/^[✓✗]\s*/, "")}
		</Notice>
	);
}
