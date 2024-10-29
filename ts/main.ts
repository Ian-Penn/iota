import * as utilities from "./utilities.js";
import logger from "./logger.js";
import { CompilerOptions, Module } from "./Module.js";
import { getIndicatorText, removeDuplicateErrors } from "./report.js";
import { setUpBuiltins } from "./builtin.js";
import path from "path";
import readline from 'readline';
import { stdout } from "process";

// function readDB(): DB {
// 	const DBtextPath = path.join(path.dirname(options.filePath), "db.json");
// 	const DBtext = utilities.readFile(DBtextPath);
// 	console.log("DBtext:", DBtext);
// 	const db = JSON.parse(DBtext) as DB;
// 	console.log("db:", db);
// 	return db;
// }

setUpBuiltins();

let i = 2;

function nextArg(): string {
	return process.argv[i++];
}

while (process.argv[i].startsWith("-")) {
	const flag = nextArg();
	if (flag == "-log") {
		logger.enableLogs();
	} else {
		utilities.TODO_addError();
	}
}

const mode = nextArg();

switch (mode) {
	case "init": {
		const arg = nextArg();
		const basePath = path.dirname(arg);
		const name = path.basename(arg);
		
		const module = new Module(basePath, name);
		module.saveToFileSystem();
		break;
	}
	
	case "runFile": {
		const arg = nextArg();
		const basePath = path.dirname(arg);
		const name = path.basename(arg);
		
		const filePath = nextArg();
		
		const module = new Module(basePath, name);
		module.addText(filePath, utilities.readFile(filePath));
		module.runEvalQueue();
		module.outputErrorsAndEvaluations(true);
		module.saveToFileSystem();
		break;
	}
	
	case "start": {
		const arg = nextArg();
		const basePath = path.dirname(arg);
		const name = path.basename(arg);
		
		const module = new Module(basePath, name);
		module.loadFromFileSystem();
		startREPL(module);
		break;
	}

	default: {
		utilities.TODO_addError();
	}
}

function startREPL(module: Module) {
	const eraseLine = "\x1B[2K";
	const cursorBack = "\x1B[D";
	const prompt = "(*)";
	
	let currentLine = "";
	let currentLineAfterCursor = "";
	let historyI = 0;
	let history: string[] = [];
	
	// function writeEraseCurrentLine() {
	// 	stdout.write("\r" + eraseInLine);
	// }
	
	function writeCurrentLine() {
		stdout.write("\r" + eraseLine + prompt + currentLine + currentLineAfterCursor + cursorBack.repeat(currentLineAfterCursor.length));
	}
	
	function printErrorsAndEvaluations() {
		module.runEvalQueue();
		for (let i = 0; i < module.errors.length; i++) {
			const error = module.errors[i];
			stdout.write(error.msg + "\n");
		}
		for (let i = 0; i < module.topLevelEvaluations.length; i++) {
			const output = module.topLevelEvaluations[i];
			stdout.write(output.msg + "\n");
		}
		module.errors = [];
		module.topLevelEvaluations = [];
	}
	
	printErrorsAndEvaluations();
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	writeCurrentLine();
	
	process.stdin.on("keypress", (chunk, key) => {
		// console.log(key);
		
		if (key.name == "escape" || key.sequence == "\x04") {
			stdout.write("\n");
			process.exit();
		} else if (key.sequence == "\x03") { // ^C
			currentLine = "";
			stdout.write("\n");
			writeCurrentLine();
			return;
		} else if (key.name == "up") {
			historyI = Math.max(0, historyI-1);
			let past = history[historyI];
			if (past != undefined) {
				currentLine = past;
			}
			writeCurrentLine();
			return;
		} else if (key.name == "down") {
			historyI = Math.min(historyI+1, history.length);
			let past = history[historyI];
			if (past != undefined) {
				currentLine = past;
			}
			writeCurrentLine();
			return;
		} else if (key.name == "left") {
			if (currentLine == "") {
				return;
			}
			currentLineAfterCursor = currentLine[currentLine.length-1] + currentLineAfterCursor;
			currentLine = currentLine.slice(0, currentLine.length-1);
			writeCurrentLine();
			return;
		} else if (key.name == "right") {
			if (currentLineAfterCursor == "") {
				return;
			}
			currentLine = currentLine + currentLineAfterCursor[0];
			currentLineAfterCursor = currentLineAfterCursor.slice(1);
			writeCurrentLine();
			return;
		}
		
		let char: string = key.sequence;
		if (char == "\r") char = "\n";
		
		if (char == "\n") {
			currentLine += currentLineAfterCursor;
			currentLineAfterCursor = "";
			if (currentLine.length != 0) {
				history.push(currentLine);
				historyI = history.length;
			}
			
			stdout.write("\n");
			module.addText("REPL", currentLine);
			printErrorsAndEvaluations();
			currentLine = "";
			writeCurrentLine();
		} else if (key.name == "backspace") {
			if (currentLine.length > 0) {
				currentLine = currentLine.slice(0, currentLine.length-1);
				// stdout.write("\x08 \x08");
				writeCurrentLine();
			}
		} else {
			currentLine += char;
			writeCurrentLine();
		}
	});
}

// logger.printFileAccessLogs();
// logger.printTimes();