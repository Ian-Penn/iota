import path from "path";

import * as utilities from "./utilities.js";
import logger from "./logger.js";
import { Module } from "./Module.js";
import { setUpBuiltins } from "./builtin.js";
import { startREPL } from "./REPL.js";

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

// logger.printFileAccessLogs();
// logger.printTimes();