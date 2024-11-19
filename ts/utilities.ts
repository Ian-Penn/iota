import * as fs from "fs";
import path from "path";
import crypto from "crypto";

import logger from "./logger.js";
import { CompileError } from "./report.js";

export function unreachable(): never {
	debugger;
	console.trace();
	throw "unreachable code reached";
}

export function assert(condition: boolean, msg?: string): asserts condition {
	if (!condition) {
		debugger;
		throw msg;
	}
}

export function TODO(): never {
	debugger;
	throw "TODO reached";
}

export function TODO_addError(): never {
	debugger;
	throw "TODO_addError";
}

export function byteSize(str: string): number {
	return new Blob([str]).size;
}

export function readFile(filePath: string): string | null {
	try {
		const text = fs.readFileSync(filePath, { encoding: 'utf8' });
		logger.readFile({
			path: filePath,
			byteSize: byteSize(text),
		});
		return text;
	} catch (error) {
		console.error(`could not read file at path '${filePath}'`);
		return null;
	}
}

export function writeFile(filePath: string, text: string) {
	try {
		fs.writeFileSync(path.normalize(filePath), text, { encoding: 'utf8' });
		logger.writeFile({
			path: filePath,
			byteSize: byteSize(text),
		});
	} catch (error) {
		throw new CompileError(`could not write file at path '${filePath}'`);
	}
}

export function makeDir(dirPath: string) {
	try {
		fs.mkdirSync(dirPath, {
			recursive: true,
		});
	} catch (error) {
		console.error(error);
		TODO_addError();
	}
}

export function getClassName(x: any): string {
	return Object.getPrototypeOf(x).constructor.name;
}

export class Hash {
	hashText: string;
	
	constructor(text: string) {
		this.hashText = crypto.createHash("sha256").update(text).digest("hex");
	}
	
	toString() {
		return `Hash<${this.hashText}>`
	}
}

function makeUUID(): string {
	const byteSize = 10;
	const bytes = crypto.getRandomValues(new Uint8Array(byteSize));
	let string = "";
	for (let i = 0; i < bytes.length; i++) {
		const byteString = bytes[i].toString(16).toUpperCase();
		if (byteString.length == 1) {
			string += "0";
		}
		string += byteString;
	}
	return string;
}