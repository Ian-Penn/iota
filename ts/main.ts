import { HashCache, readFile, TODO_addError } from "./utilities.js";
import logger from "./logger.js";
import { Module } from "./Module.js";
import { setUpBuiltins } from "./builtin.js";
import { startREPL } from "./REPL.js";
import { ASTnode, ASTnode_number, ASTnode_object } from "./ASTnodes.js";

function nextArg(): string {
	return process.argv[i++];
}

const helpText = `
flags:
  -log ~ enable compiler logging

modes:
  init <modulePath>
  runFile <filePath>
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
			TODO_addError();
		}
	}
	
	const mode = nextArg();
	
	switch (mode) {
		// case "init": {
		// 	const modulePath = nextArg();
		// 	const basePath = path.dirname(modulePath);
		// 	const name = path.basename(modulePath);
			
		// 	const module = new Module(basePath, name);
		// 	module.saveToFileSystem();
		// 	break;
		// }
		
		case "runFile": {
			// const modulePath = nextArg();
			// const basePath = path.dirname(modulePath);
			// const name = path.basename(modulePath);
			
			const filePath = nextArg();
			
			const module = new Module("", "runFileMain", new ASTnode_object("builtin", null, []));
			// module.loadFromFileSystem();
			const text = readFile(filePath);
			if (text == null) TODO_addError();
			module.addText(filePath, text);
			// module.runEvalQueue();
			module.outputErrorsAndEvaluations(true);
			module.dumpDebug();
			// module.saveToFileSystem();
			break;
		}
		
		// case "start": {
		// 	const modulePath = nextArg();
		// 	const basePath = path.dirname(modulePath);
		// 	const name = path.basename(modulePath);
			
		// 	const module = new Module(basePath, name);
		// 	module.loadFromFileSystem();
		// 	startREPL(module);
		// 	break;
		// }
	
		default: {
			TODO_addError();
		}
	}
}

// logger.printFileAccessLogs();
// logger.printTimes();