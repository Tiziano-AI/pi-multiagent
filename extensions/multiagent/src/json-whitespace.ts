/** JSON whitespace helpers. JSON permits only space, tab, carriage return, and line feed. */

export function trimJsonWhitespace(value: string): string {
	let start = 0;
	let end = value.length;
	while (isJsonWhitespace(value[start])) start++;
	while (end > start && isJsonWhitespace(value[end - 1])) end--;
	return value.slice(start, end);
}

export function trimStartJsonWhitespace(value: string): string {
	let start = 0;
	while (isJsonWhitespace(value[start])) start++;
	return value.slice(start);
}

function isJsonWhitespace(char: string | undefined): boolean {
	return char === " " || char === "\t" || char === "\r" || char === "\n";
}
