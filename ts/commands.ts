import * as utilities from "./utilities.js";
import { Module, ModulePath } from "./Module.js";

export function runCommand(module: Module, args: string[]) {
	let argIndex = 1;
	function nextArg(): string {
		const arg = args[argIndex++];
		if (arg == undefined) utilities.TODO_addError();
		return arg;
	}
	
	function getArgs(): string[] {
		return args.slice(argIndex);
	}
	
	function getString(): string {
		let string = nextArg();
		if (string[0] != "\"") utilities.TODO_addError();
		if (string[string.length-1] != "\"") utilities.TODO_addError();
		return string.slice(1, string.length-1);
	}
	
	switch (args[0]) {
		case "import": {
			const modulePath = nextArg();
			if (module.fsBasePath == null) {
				utilities.unreachable();
			}
			module.importModule(module.currentDirectory, modulePath);
			return;
		}
		
		case "cd": {
			const path = nextArg();
			if (path.startsWith("~")) {
				module.currentDirectory = new ModulePath([path.slice(1)]);
			} else {
				module.currentDirectory = new ModulePath([module.currentDirectory.segments, path].flat());
			}
			return;
		}
		
		case "l": { // list
			module.runEvalQueue();
			
			console.log(`module: ${module.name} at: ${module.currentDirectory}\n`);
			module.defs.forEach((def) => {
				let path = def.getPath();
				if (!path.startsWith(module.currentDirectory)) return;
				path = new ModulePath(
					path.segments.slice(module.currentDirectory.segments.length)
				);
				console.log(path.toString());
			});
			return;
		}
		
		case "ll": { // long list
			module.runEvalQueue();
			
			console.log(`module: ${module.name} at: ${module.currentDirectory}\n`);
			module.defs.forEach((def) => {
				let path = def.getPath();
				if (!path.startsWith(module.currentDirectory)) return;
				path = new ModulePath(
					path.segments.slice(module.currentDirectory.segments.length)
				);
				console.log(`${path.toString()} = ${def.value.print()}`);
			});
			return;
		}
		
		case "debug": {
			module.runEvalQueue();
			module.dumpDebug();
			return;
		}
		
		case "includeFile": {
			const filePath = nextArg();
			
			const oldDir = module.currentDirectory;
			const text = utilities.readFile(filePath);
			if (text == null) utilities.TODO_addError();
			module.addText(filePath, text);
			module.currentDirectory = oldDir;
			return;
		}
		
		// case "import": {
		// 	utilities.TODO();
		// }
		
		// case "codegen": {
		// 	codebase.runEvalQueue();
		// 	if (codebase.errors.length != 0) {
		// 		return;
		// 	}
			
		// 	const path = getArg();
		// 	const startOfFile = getArg();
		// 	const endOfFile = getArg();
		// 	const exports = getArgs();
			
		// 	if (exports.length == 0) {
		// 		utilities.TODO_addError();
		// 	}
			
		// 	function getStringFromDef(name: string): string {
		// 		const def = codebase.getDef(name);
		// 		if (def == null) {
		// 			utilities.TODO_addError();
		// 		}
				
		// 		const value = def.value.evaluate(new BuilderContext(codebase));
				
		// 		if (!(value instanceof ASTnode_string)) {
		// 			utilities.TODO_addError();
		// 		}
				
		// 		return value.value;
		// 	}
			
		// 	const startOfFileString = getStringFromDef(startOfFile);
		// 	const endOfFileString = getStringFromDef(endOfFile);
			
		// 	const settings: CodegenJsSettings = {
		// 		addDebugComments: true,
		// 	};
			
		// 	const output = startOfFileString + "\n" + codegen_js(codebase, exports, settings) + "\n" + endOfFileString;
		// 	console.log(`codegen:\n${output}\n`);
			
		// 	utilities.writeFile(path, output);
		// 	return;
		// }
	
		default: {
			utilities.TODO_addError();
		}
	}
}