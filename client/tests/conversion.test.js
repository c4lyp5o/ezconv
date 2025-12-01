import { describe, it, expect, beforeAll } from "vitest";
import Papa from "papaparse";
import * as XLSX from "xlsx";

describe("Conversion Logic", () => {
	const sampleJSON = [
		{
			id: 1,
			name: "John Doe",
			email: "john@example.com",
			age: 28,
			country: "USA",
		},
		{
			id: 2,
			name: "Jane Smith",
			email: "jane@example.com",
			age: 34,
			country: "UK",
		},
	];

	const sampleCSV = `id,name,email,age,country
1,John Doe,john@example.com,28,USA
2,Jane Smith,jane@example.com,34,UK`;

	it("should convert JSON to CSV", () => {
		const csv = Papa.unparse(sampleJSON);
		expect(csv).toContain("id,name,email,age,country");
		expect(csv).toContain("John Doe");
		expect(csv).toContain("jane@example.com");
	});

	it("should convert CSV to JSON", () => {
		const result = Papa.parse(sampleCSV, {
			header: true,
			dynamicTyping: true,
			skipEmptyLines: true,
		});
		expect(result.data).toHaveLength(2);
		expect(result.data[0].name).toBe("John Doe");
		expect(result.data[1].email).toBe("jane@example.com");
	});

	it("should convert JSON to XLSX", () => {
		const ws = XLSX.utils.json_to_sheet(sampleJSON);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
		const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
		expect(data).toBeDefined();
		expect(data).not.toBeNull();
		expect(wb.SheetNames).toContain("Sheet1");
	});

	it("should convert XLSX to JSON", () => {
		const ws = XLSX.utils.json_to_sheet(sampleJSON);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
		const json = XLSX.utils.sheet_to_json(ws);
		expect(json).toHaveLength(2);
		expect(json[0].name).toBe("John Doe");
	});

	it("should convert CSV to XLSX", () => {
		const parsed = Papa.parse(sampleCSV, {
			header: true,
			dynamicTyping: true,
			skipEmptyLines: true,
		});
		const ws = XLSX.utils.json_to_sheet(parsed.data);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
		const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
		expect(data).toBeDefined();
	});

	it("should convert XLSX to CSV", () => {
		// Create a simple XLSX
		const ws = XLSX.utils.json_to_sheet([
			{ id: 1, name: "John" },
			{ id: 2, name: "Jane" },
		]);
		const csv = XLSX.utils.sheet_to_csv(ws);
		expect(csv).toContain("id,name");
		expect(csv).toContain("John");
		expect(csv).toContain("Jane");
	});

	it("should handle empty arrays gracefully", () => {
		const csv = Papa.unparse([]);
		expect(csv).toBe("");
	});

	it("should handle CSV with special characters", () => {
		const csvWithSpecial = `id,name,description
1,Product A,"Description with, comma"
2,Product B,"Description with ""quotes"""`;
		const result = Papa.parse(csvWithSpecial, {
			header: true,
			skipEmptyLines: true,
		});
		expect(result.data).toHaveLength(2);
		expect(result.data[0].name).toBe("Product A");
	});
});
