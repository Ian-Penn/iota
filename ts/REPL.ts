import readline from 'readline';
import { stdout } from "process";

import { Module } from "./Module.js";

export function startREPL(module: Module) {
	// https://en.wikipedia.org/wiki/ANSI_escape_code
	const eraseLine = "\x1B[2K";
	const cursorBack = "\x1B[D";
	const prompt = "(*)";
	
	let currentLine = "";
	let currentLineAfterCursor = "";
	let historyI = 0;
	let history: string[] = [];
	let evalCount = 0;
	
	function writeCurrentLine() {
		stdout.write("\r" + eraseLine + prompt + currentLine + currentLineAfterCursor + cursorBack.repeat(currentLineAfterCursor.length));
	}
	
	// function printErrorsAndEvaluations() {
	// 	module.runEvalQueue();
	// 	for (let i = 0; i < module.errors.length; i++) {
	// 		const error = module.errors[i];
	// 		stdout.write(error.msg + "\n");
	// 	}
	// 	for (let i = 0; i < module.topLevelEvaluations.length; i++) {
	// 		const output = module.topLevelEvaluations[i];
	// 		stdout.write(output.msg + "\n");
	// 	}
	// 	module.errors = [];
	// 	module.topLevelEvaluations = [];
	// }
	
	// printErrorsAndEvaluations();
	// readline.emitKeypressEvents(process.stdin);
	// process.stdin.setRawMode(true);
	// writeCurrentLine();
	
	// process.stdin.on("keypress", (chunk, key) => {
	// 	// console.log(key);
		
	// 	if (key.name == "escape" || key.sequence == "\x04") {
	// 		stdout.write("\n");
	// 		module.saveToFileSystem();
	// 		process.exit();
	// 	} else if (key.sequence == "\x03") { // ^C
	// 		currentLine = "";
	// 		stdout.write("\n");
	// 		writeCurrentLine();
	// 		return;
	// 	} else if (key.name == "up") {
	// 		historyI = Math.max(0, historyI-1);
	// 		let past = history[historyI];
	// 		if (past != undefined) {
	// 			currentLine = past;
	// 		}
	// 		writeCurrentLine();
	// 		return;
	// 	} else if (key.name == "down") {
	// 		historyI = Math.min(historyI+1, history.length);
	// 		let past = history[historyI];
	// 		if (past != undefined) {
	// 			currentLine = past;
	// 		}
	// 		writeCurrentLine();
	// 		return;
	// 	} else if (key.name == "left") {
	// 		if (currentLine == "") {
	// 			return;
	// 		}
	// 		currentLineAfterCursor = currentLine[currentLine.length-1] + currentLineAfterCursor;
	// 		currentLine = currentLine.slice(0, currentLine.length-1);
	// 		writeCurrentLine();
	// 		return;
	// 	} else if (key.name == "right") {
	// 		if (currentLineAfterCursor == "") {
	// 			return;
	// 		}
	// 		currentLine = currentLine + currentLineAfterCursor[0];
	// 		currentLineAfterCursor = currentLineAfterCursor.slice(1);
	// 		writeCurrentLine();
	// 		return;
	// 	}
		
	// 	let char: string = key.sequence;
	// 	if (char == "\r") char = "\n";
		
	// 	if (char == "\n") {
	// 		currentLine += currentLineAfterCursor;
	// 		currentLineAfterCursor = "";
	// 		if (currentLine.length != 0) {
	// 			history.push(currentLine);
	// 			historyI = history.length;
	// 		}
			
	// 		stdout.write("\n");
	// 		module.addText(`__REPL__:${evalCount++}`, currentLine);
	// 		printErrorsAndEvaluations();
	// 		currentLine = "";
	// 		writeCurrentLine();
	// 	} else if (key.name == "backspace") {
	// 		if (currentLine.length > 0) {
	// 			currentLine = currentLine.slice(0, currentLine.length-1);
	// 			// stdout.write("\x08 \x08");
	// 			writeCurrentLine();
	// 		}
	// 	} else {
	// 		currentLine += char;
	// 		writeCurrentLine();
	// 	}
	// });
}