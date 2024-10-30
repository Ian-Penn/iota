import path from "path";

import * as utilities from "./utilities.js";
import logger from "./logger.js";
import { Module } from "./Module.js";
import { setUpBuiltins } from "./builtin.js";
import { startREPL } from "./REPL.js";

function nextArg(): string {
	return process.argv[i++];
}

const helpText = `
flags:
  -log ~ enable compiler logging

modes:
  init <modulePath>
  runFile <modulePath> <filePath>
  start <modulePath>
`;

setUpBuiltins();

let i = 2;

if (process.argv[i] == undefined) {
	console.log(helpText);
} else {
	main();
}

function main() {
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
			const modulePath = nextArg();
			const basePath = path.dirname(modulePath);
			const name = path.basename(modulePath);
			
			const module = new Module(basePath, name);
			module.saveToFileSystem();
			break;
		}
		
		case "runFile": {
			const modulePath = nextArg();
			const basePath = path.dirname(modulePath);
			const name = path.basename(modulePath);
			
			const filePath = nextArg();
			
			const module = new Module(basePath, name);
			module.addText(filePath, utilities.readFile(filePath));
			module.runEvalQueue();
			module.outputErrorsAndEvaluations(true);
			module.saveToFileSystem();
			break;
		}
		
		case "start": {
			const modulePath = nextArg();
			const basePath = path.dirname(modulePath);
			const name = path.basename(modulePath);
			
			const module = new Module(basePath, name);
			module.loadFromFileSystem();
			startREPL(module);
			break;
		}
	
		default: {
			utilities.TODO_addError();
		}
	}
}

// logger.printFileAccessLogs();
// logger.printTimes();