import * as utilities from "./utilities.js";
import { SourceLocation } from "./ASTnodes.js";

const lineNumberPadding = 4;
const indicatorTextWindowSize = 2;

const beforeErrorChar = "-";
const underErrorChar = "^";

export type Indicator = {
	location: SourceLocation,
	msg: string,
}

// TODO: This can read the same file twice, if there are two indicators in a file.
export function getIndicatorText(indicator: Indicator, printPath: boolean, fancyIndicators: boolean, startAtNextLine: boolean): string {
	let outputText = "";
	
	if (!fancyIndicators) {
		if (indicator.location != "builtin") {
			if (printPath) {
				outputText += `${indicator.location.path}:${indicator.location.line} -> ${indicator.msg}`;
			} else {
				outputText += `line:${indicator.location.line} -> ${indicator.msg}`;
			}
			return outputText;
		} else {
			outputText += `builtin -> ${indicator.msg}`;
			return outputText;
		}
	}
	
	if (indicator.location != "builtin") {
		let text = utilities.readFile(indicator.location.path) as string;
		if (text == null) utilities.TODO_addError();
		
		if (printPath) {
			outputText += `at ${indicator.location.path}:${indicator.location.line}\n`;
		} else {
			outputText += `${indicator.location.line}\n`;
		}
		
		let i = 0;
		let line = 1;
		
		function next(): string {
			if (text[i] == "\n") {
				line++;
			}
			return text[i++];
		}
		
		function writeLine(): number {
			let size = 0
			let lineText = "";
			if (indicator.location != "builtin") {
				lineText += line.toString().padStart(lineNumberPadding, "0");
				lineText += " |";
				size = lineText.length;
				
				let lineI = 0;
				while (i < text.length) {
					const char = next();
					
					lineI++;
					
					if (char == "\n") {
						break;
					}
					
					if (char == "\t") {
						lineText += "    ";
					} else {
						lineText += char;
					}
					
					if (lineI == indicator.location.startColumn) {
						size = lineText.length - 1;
					}
				}
				lineText += "\n";
			} else {
				utilities.unreachable();
			}
			outputText += lineText;
			
			return size;
		}
		
		while (i < text.length) {
			if (line == indicator.location.line) {
				const size = writeLine();
				for (let index = 0; index < size; index++) {
					outputText += beforeErrorChar;
				}
				for (let index = 0; index < indicator.location.endColumn - indicator.location.startColumn + 1; index++) {
					outputText += underErrorChar;
				}
				let endText = "";
				if (startAtNextLine) {
					endText += "\n";
				} else {
					endText += " ";
				}
				endText += `${indicator.msg}`;
				if (startAtNextLine) {
					endText = endText.replaceAll("\n", "\n ");
				}
				outputText += endText + "\n";
			} else if (
				line > indicator.location.line - indicatorTextWindowSize - 1 &&
				line < indicator.location.line + indicatorTextWindowSize + 1
			) {
				writeLine();
			} else {
				next();
			}
		}
		
		outputText += `\n`;	
	} else {
		outputText += `at builtin\n\n`;
	}
	
	return outputText;
}

export class CompileError {
	msg: string
	private indicators: Indicator[]
	
	constructor(msg: string) {
		this.msg = msg;
		this.indicators = [];
	}
	
	public indicator(location: SourceLocation, msg: string): CompileError {
		this.indicators.push({
			location: location,
			msg: msg,
		});
		return this;
	}
	
	public getText(printPath: boolean, fancyIndicators: boolean): string {
		const addColor = fancyIndicators;
		const c_red = "\x1B[31m"
		const c_reset = "\x1B[0m";
		
		let text = "";
		if (addColor) text += c_red;
		text += `error: ${this.msg}\n`;
		if (addColor) text += c_reset;
		
		for (let i = 0; i < this.indicators.length; i++) {
			const indicator = this.indicators[i];
			
			if (indicator.location == "builtin") continue;
			
			text += getIndicatorText(indicator, printPath, fancyIndicators, false);
			if (!fancyIndicators && this.indicators[i + 1]) {
				text += "\n";
			}
		}
		return text;
	}
}

export function removeDuplicateErrors(list: CompileError[]): CompileError[] {
	const newList: CompileError[] = [];
	for (let i = 0; i < list.length; i++) {
		const error = list[i];
		let isDuplicate = false;
		for (let j = i+1; j < list.length; j++) {
			const otherError = list[j];
			if (error.getText(false, false) == otherError.getText(false, false)) {
				isDuplicate = true;
				break;
			}
		}
		if (!isDuplicate) {
			newList.push(error);
		}
	}
	return newList;
}