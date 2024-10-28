import * as utilities from "./utilities.js";
import { CompilerOptions, Module } from "./Module.js";
import { getIndicatorText, removeDuplicateErrors } from "./report.js";
import { setUpBuiltins } from "./builtin.js";
import path from "path";
import logger from "./logger.js";

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
		module.addFile(filePath);
		module.runEvalQueue();
		module.outputErrorsAndEvaluations(true);
		module.saveToFileSystem();
		break;
	}
	
	// case "start": {
	// 	const arg = nextArg();
	// 	const basePath = path.dirname(arg);
	// 	const name = path.basename(arg);
		
	// 	break;
	// }

	default: {
		utilities.TODO_addError();
	}
}

// logger.printFileAccessLogs();
// logger.printTimes();