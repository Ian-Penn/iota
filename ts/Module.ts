import crypto from "crypto";
import { join as joinPath, dirname, basename, relative as relativePath } from "path";

import * as utilities from "./utilities.js";
import logger, { LogType } from "./logger.js";
import { CompileError, getIndicatorText, Indicator, removeDuplicateErrors } from "./report.js";
import {
	ASTnode,
	ASTnode_alias,
	ASTnode_command,
	ASTnode_error,
	BuilderContext,
} from "./ASTnodes.js";
import { CodeGenContext } from "./codegen.js";
import { lex } from "./lexer.js";
import { parse, ParserMode } from "./parser.js";
import { pathSeparator } from "./const.js";
import { runCommand } from "./commands.js";

type Hash = string;
function hashString(text: string): Hash {
	return crypto.createHash("sha256").update(text).digest("hex");
}
function getUUID(): string {
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

export type IdeOptions = {
	mode: "compileFile",
};

export type CompilerOptions = {
	filePath: string,
	fancyErrors: boolean,
	includeLogs: string[],
	
	outputPath?: string,
	ideOptions?: IdeOptions,
};

export type MetaObjectImport = {
	/**
	 * Inside the module.
	 */
	path: string,
	relativeFsPath: string | null,
};

export type MetaObject = {
	// version: number,
	imports: MetaObjectImport[],
};

export type Import = {
	/**
	 * Inside the module.
	 */
	path: string,
	relativeFsPath: string | null,
	moduleIndex: number,
};

const moduleList: Module[] = [];
function getFromModuleList(name: string): Module | null {
	for (let i = 0; i < moduleList.length; i++) {
		const module = moduleList[i];
		if (module.name == name) {
			return module;
		}
	}
	
	return null;
}

export class TopLevelDef {
	constructor(
		public name: string,
		public value: ASTnode,
		public valueRelativeTo: string,
		public dependencies: string[],
	) {}
	
	getModuleName(): string {
		return this.name.split(":")[0];
	}
	
	getNameRelativeToTopOfModule(): string {
		const list = this.name.split(":");
		return list[1];
	}
	
	getOriginModule(): Module {
		const module = getFromModuleList(this.getModuleName());
		if (module == null) {
			utilities.unreachable();
		}
		
		return module;
	}
}

export class Module {
	defs = new Map<string, TopLevelDef>();
	topLevelEvaluations: Indicator[] = [];
	errors: CompileError[] = [];
	currentDirectory: string = "";
	private imports: Import[] = [];
	readonly moduleIndex: number;
	
	private defEvalQueue: TopLevelDef[] = [];
	// private topLevelEvalQueue: TopLevelDef[] = [];
	
	/**
	 * adds this to moduleList
	 */
	constructor(
		public fsBasePath: string | null = null,
		public name: string,
	) {
		logger.log(LogType.module, `made new Module ${fsBasePath} ${name}`);
		this.moduleIndex = moduleList.push(this)-1;
	}
	
	getFullFsPath() {
		let fsBasePath = this.fsBasePath
		if (fsBasePath == null) {
			fsBasePath = "";
		}
		return joinPath(fsBasePath, this.name);
	}
	
	importModule(rootPath: string, relativeFsPath: string | null) {
		logger.log(LogType.module, `importModule ${relativeFsPath}`);
		
		if (relativeFsPath == null) {
			this.imports.push({
				path: rootPath,
				moduleIndex: getFromModuleList("builtin")!.moduleIndex,
				relativeFsPath: null,
			});
			return;
		}
		
		const fsBasePath = dirname(relativeFsPath);
		const name = basename(relativeFsPath);
		
		let module = getFromModuleList(name);
		
		for (let i = 0; i < this.imports.length; i++) {
			const element = this.imports[i];
			const importedModule = moduleList[element.moduleIndex];
			if (importedModule.name == name) {
				logger.log(LogType.module, `module with name '${name}' Is already imported in module '${this.name}'`);
				return;
			}
		}
		
		if (module == null) {
			let thisFsBasePath = this.fsBasePath;
			if (thisFsBasePath == null) thisFsBasePath = "";
			debugger;
			module = new Module(joinPath(thisFsBasePath, fsBasePath), name);
			module.loadFromFileSystem();
		}
		
		this.imports.push({
			path: rootPath,
			moduleIndex: module.moduleIndex,
			relativeFsPath: relativeFsPath,
		});
	}
	
	getDefsPath(): string {
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		return joinPath(this.fsBasePath, this.name, "defs.iota");
	}
	
	// getMetaPath(): string {
	// 	if (this.fsBasePath == null) {
	// 		utilities.unreachable();
	// 	}
		
	// 	return joinPath(this.fsBasePath, this.name, "meta.json");
	// }
	
	saveToFileSystem() {
		logger.log(LogType.module, "saveToFileSystem");
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		utilities.makeDir(joinPath(this.fsBasePath, this.name));
		utilities.writeFile(this.getDefsPath(), this.printDefs(true, false));
		// utilities.writeFile(this.getMetaPath(), JSON.stringify(this.getMetaObj(), null, "\t"));
	}
	
	loadFromFileSystem() {
		// const metaPath = this.getMetaPath();
		const defsPath = this.getDefsPath();
		
		logger.log(LogType.module, `loadFromFileSystem ${defsPath}`);
		
		// const metaText = utilities.readFile(metaPath);
		// if (metaText == null) utilities.TODO_addError();
		// const metaObject: MetaObject = JSON.parse(metaText);
		// for (let i = 0; i < metaObject.imports.length; i++) {
		// 	const module = metaObject.imports[i];
		// 	this.importModule(module.path, module.relativeFsPath);
		// }
		
		const defsText = utilities.readFile(this.getDefsPath());
		if (defsText == null) utilities.TODO_addError();
		this.addText(defsPath, defsText);
	}
	
	setDef(name: string, newDef: TopLevelDef) {
		this.defs.set(name, newDef);
		logger.log(LogType.module, `setDef ${name}`);
	}
	
	getDef(fromDirectory: string, name: string): [string, TopLevelDef] | null {
		const nameList = name.split(pathSeparator);
		
		const paths = fromDirectory.split(pathSeparator);
		for (let i = 0; i < paths.length + 1; i++) {
			const pathList = paths.slice(0, i);
			pathList.push(name);
			
			const fullPath = pathList.join(pathSeparator);
			
			{
				const fullName = this.name + ":" + fullPath;
				const def = this.defs.get(fullName);
				if (def != undefined) {
					return [fullPath, def];
				}
			}
			
			const rootPathList = paths.slice(0, i);
			rootPathList.push(...nameList.slice(0, nameList.length-1));
			const rootPath = rootPathList.join(pathSeparator);
			for (let j = 0; j < this.imports.length; j++) {
				const element = this.imports[j];
				if (element.path == rootPath) {
					const module = moduleList[element.moduleIndex];
					const nameInModule = fullPath.slice(rootPath.length + 1);
					const fullName = module.name + ":" + nameInModule;
					const def = module.defs.get(fullName);
					if (def != undefined) {
						return [fullPath, def];
					}
				}
			}
		}
		return null;
	}
	
	getMetaObj(): MetaObject {
		return {
			imports: this.imports.map((value) => {
				// const module = moduleList[value.moduleIndex];
				// const fsPathList = [];
				// if (module.fsBasePath != null) {
				// 	fsPathList.push(module.fsBasePath);
				// }
				// fsPathList.push(module.name);
				const metaImport: MetaObjectImport = {
					path: value.path,
					relativeFsPath: value.relativeFsPath,
				};
				return metaImport;
			}),
		};
	}
	
	printDefs(addImports: boolean, extraLines: boolean): string {
		let list: string[] = [];
		if (addImports) {
			this.imports.forEach((value) => {
				list.push(`>cd ~${value.path}`);
				list.push(`>import ${value.relativeFsPath}`);
				list.push(`>cd ~`);
			});
		}
		this.defs.forEach((def, name) => {
			list.push(`// [${def.dependencies.join(", ")}]`);
			list.push(`${name.slice(this.name.length+1)} = ${def.value.print()}`);
			if (extraLines == true) {
				list.push("");
			}
		});
		return list.join("\n");
	}
	
	addToEvalQueue(def: TopLevelDef) {
		if (!this.defEvalQueue.includes(def)) {
			this.defEvalQueue.push(def);
			logger.log(LogType.module, `added to evalQueue: ${def.name}`);
		}
	}
	
	runEvalQueue() {
		logger.log(LogType.module, `runEvalQueue length: ${this.defEvalQueue.length}`);
		
		const oldDir = this.currentDirectory;
		
		for (let i = 0; i < this.defEvalQueue.length; i++) {
			const def = this.defEvalQueue[i];
			
			this.currentDirectory = def.valueRelativeTo;
			
			const context = new BuilderContext(this);
			context.resolve = "none";
			context.currentDef = def;
			const error = def.value.getType(context);
			if (error instanceof ASTnode_error && error.compileError) {
				this.errors.push(error.compileError);
				break;
			}
			def.value = def.value.evaluate(context);
		}
		
		this.defEvalQueue = [];
		this.currentDirectory = oldDir;
	}
	
	addAST(AST: ASTnode[]) {
		for (let i = 0; i < AST.length; i++) {
			const ASTnode = AST[i];
			
			if (ASTnode instanceof ASTnode_command) {
				runCommand(this, ASTnode.text.split(" "));
				continue;
			} else if (ASTnode instanceof ASTnode_alias) {
				// const hash = hashString(JSON.stringify(ASTnode.value));
				// const uuid = getUUID();
				let name = ASTnode.left.print();
				if (this.currentDirectory != "") {
					name = this.currentDirectory + pathSeparator + name;
				}
				name = this.name + ":" + name;
				const newDef = new TopLevelDef(name, ASTnode.value, this.currentDirectory, []);
				this.setDef(name, newDef);
				this.addToEvalQueue(newDef);
			} else {
				logger.log(LogType.module, `found top level evaluation`);
				
				this.runEvalQueue();
				
				const location = ASTnode.location;
				{
					const error = ASTnode.getType(new BuilderContext(this));
					if (error instanceof ASTnode_error) {
						if (!error.compileError) {
							debugger;
							logger.log(LogType.module, `!error.compileError`);
							break;
						}
						this.errors.push(error.compileError);
						continue;
					}
				}
				
				const result = ASTnode.evaluate(new BuilderContext(this));
				const codeGenContext = new CodeGenContext();
				codeGenContext.fprintOrigin = false;
				const resultText = result.print(codeGenContext);
				
				this.topLevelEvaluations.push({ location: location, msg: `${resultText}` });
			}
		}
	}
	
	addText(filePath: string, text: string) {
		let tokens;
		let AST;
		try {
			const lexStart = Date.now();
			tokens = lex(filePath, text);
			logger.addTime("lexing", Date.now() - lexStart);
			
			const parseStart = Date.now();
			AST = parse({
				tokens: tokens,
				i: 0,
			}, ParserMode.normal, 0, null);
			logger.addTime("parsing", Date.now() - parseStart);
			// console.log(`AST:\n${printAST(new CodeGenContext(), AST).join("\n")}\n`);
			
			this.addAST(AST);
		} catch (error) {
			if (error instanceof CompileError) {
				this.errors.push(error);
			} else {
				throw error;
			}
		}
	}
	
	outputErrorsAndEvaluations(fancyErrors: boolean) {
		const errors = removeDuplicateErrors(this.errors);

		for (let i = 0; i < errors.length; i++) {
			const error = errors[i];
			console.log(error.getText(true, fancyErrors));
		}

		if (errors.length == 0) {
			if (this.topLevelEvaluations.length > 0) {
				console.log("top level evaluations:");
			}
			for (let i = 0; i < this.topLevelEvaluations.length; i++) {
				const evaluation = this.topLevelEvaluations[i];
				let indicatorText = getIndicatorText(evaluation, true, fancyErrors, evaluation.msg.includes("\n"));
				console.log(indicatorText);
			}
		} else {
			process.exitCode = 1;
		}
	}
	
	dumpDebug() {
		console.log(`name: ${this.name}`);
		console.log(`basePath: ${this.fsBasePath}`);
		console.log(`currentDirectory: ${this.currentDirectory}`);
		console.log(`printDefs:\n${this.printDefs(true, true)}`);
		// console.log(`getMetaObj:`, this.getMetaObj());
	}
}