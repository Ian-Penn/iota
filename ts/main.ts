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

const mode = nextArg();

// const options: CompilerOptions = {
// 	filePath: nextArg(),
// 	fancyErrors: true,
// 	includeLogs: [], // TODO
// };

// while (i < process.argv.length) {
// 	const arg = nextArg();
// 	if (arg == "-o") {
// 		options.outputPath = nextArg();
// 	} else if (arg == "-ide") {
// 		const mode = nextArg();
// 		if (mode == "compileFile") {
// 			options.ideOptions = {
// 				mode: mode,
// 			};
// 		} else {
// 			utilities.TODO();
// 		}
// 	} else if (arg == "-noFancyErrors") {
// 		options.fancyErrors = false;
// 	} else {
// 		utilities.TODO();
// 	}
// }
// console.log("options:", options);

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
		startREPL(module);
		break;
	}

	default: {
		utilities.TODO_addError();
	}
}

function startREPL(module: Module) {
	const cursorForward = "\x9B";
	const prompt = "(*)";
	
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	
	let currentLine = prompt;
	stdout.write(currentLine);
	
	process.stdin.on("keypress", (chunk, key) => {
		// console.log(key);
		
		if (key.name == "escape" || key.sequence == "\x04") {
			stdout.write("\n");
			process.exit();
		}
		if (key.name == "up" || key.name == "down") {
			return;
		}
		if (key.name == "left" || key.name == "right") {
			// stdout.write(key.sequence);
			return;
		}
		let char: string = key.sequence;
		if (char == "\r") char = "\n";
		
		if (char == "\n") {
			const input = currentLine.slice(prompt.length);
			currentLine = prompt;
			stdout.write("\n");
			
			module.addText("REPL", input);
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
			
			stdout.write(currentLine);
		} else if (key.name == "backspace") {
			currentLine = currentLine.slice(0, currentLine.length-1);
			stdout.write("\x08 \x08");
		} else {
			currentLine += char;
			stdout.write("\r" + currentLine);
		}
	});
}

// logger.printFileAccessLogs();
// logger.printTimes();