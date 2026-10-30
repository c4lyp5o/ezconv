import { useEffect } from "react";

export default function Toast({ message, type, onClose }) {
	useEffect(() => {
		const timer = setTimeout(onClose, 4000);
		return () => clearTimeout(timer);
	}, [onClose]);

	const bgColor = type === "success" ? "bg-green-500" : "bg-red-500";

	return (
		<div
			className={`${bgColor} text-white px-4 py-3 rounded shadow-lg animate-fade-in`}
			role="alert"
		>
			{message}
		</div>
	);
}
