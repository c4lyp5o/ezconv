// FFmpeg resolves exec() with an exit status, including on codec/input errors.
export async function runMediaConversion(ff, inputName, outputName, buffer, args) {
	const remove = async (name) => {
		try {
			await ff.deleteFile(name);
		} catch {
			// A missing file is normal before execution and after early failures.
		}
	};
	try {
		await remove(outputName);
		await ff.writeFile(inputName, new Uint8Array(buffer));
		const code = await ff.exec(args);
		if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
		const data = await ff.readFile(outputName);
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	} finally {
		await remove(inputName);
		await remove(outputName);
	}
}
