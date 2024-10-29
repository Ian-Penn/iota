import crypto from "crypto";
import path from "path";

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
import { runCommand } from "./command.js";

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
	rootPath: string,
	// fsPath: string,
	name: string,
};

export type MetaObject = {
	// version: number,
	imports: MetaObjectImport[],
};

export type TopLevelDef = {
	// uuid: string,
	name: string,
	value: ASTnode,
	valueRelativeTo: string,
	dependencies: string[],
};

export type Import = {
	/**
	 * Inside the module.
	 */
	rootPath: string,
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

export class Module {
	defs = new Map<string, TopLevelDef>();
	topLevelEvaluations: Indicator[] = [];
	errors: CompileError[] = [];
	currentDirectory: string = "";
	private imports: Import[] = [];
	readonly moduleIndex: number;
	
	private evalQueue: TopLevelDef[] = [];
	
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
	
	importModule(rootPath: string, fullFsPath: string) {
		logger.log(LogType.module, `importModule ${fullFsPath}`);
		
		const basePath = path.dirname(fullFsPath);
		const name = path.basename(fullFsPath);
		
		const existingModule = getFromModuleList(name);
		
		if (name == "builtin") {
			if (existingModule == null) {
				utilities.unreachable();
			}
			this.imports.push({
				rootPath: rootPath,
				moduleIndex: existingModule.moduleIndex,
			})
		} else {
			utilities.TODO();
		}
	}
	
	getDefsPath(): string {
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		return path.join(this.fsBasePath, this.name, "defs.iota");
	}
	
	getMetaPath(): string {
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		return path.join(this.fsBasePath, this.name, "meta.json");
	}
	
	saveToFileSystem() {
		logger.log(LogType.module, "saveToFileSystem");
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		utilities.makeDir(this.fsBasePath);
		utilities.writeFile(this.getDefsPath(), this.printDefs());
		utilities.writeFile(this.getMetaPath(), JSON.stringify(this.getMetaObj(), null, "\t"));
	}
	
	loadFromFileSystem() {
		const metaPath = this.getMetaPath();
		const defsPath = this.getDefsPath();
		
		logger.log(LogType.module, `loadFromFileSystem ${defsPath} ${metaPath}`);
		
		const metaObject: MetaObject = JSON.parse(utilities.readFile(metaPath));
		for (let i = 0; i < metaObject.imports.length; i++) {
			const module = metaObject.imports[i];
			this.importModule(module.rootPath, module.name);
		}
		
		const defsText = utilities.readFile(this.getDefsPath());
		this.addText(defsPath, defsText);
	}
	
	setDef(name: string, newDef: TopLevelDef) {
		this.defs.set(name, newDef);
		logger.log(LogType.module, `setDef ${name}`);
	}
	
	getDef(fromDirectory: string, name: string): TopLevelDef | null {
		const nameList = name.split(pathSeparator);
		
		const paths = fromDirectory.split(pathSeparator);
		for (let i = 0; i < paths.length + 1; i++) {
			const pathList = paths.slice(0, i);
			pathList.push(name);
			
			{
				const fullName = this.name + ":" + pathList.join(pathSeparator);
				const def = this.defs.get(fullName);
				if (def != undefined) {
					return def;
				}
			}
			
			const rootPathList = paths.slice(0, i);
			rootPathList.push(...nameList.slice(0, nameList.length-1));
			const rootPath = rootPathList.join(pathSeparator);
			for (let j = 0; j < this.imports.length; j++) {
				const element = this.imports[j];
				if (element.rootPath == rootPath) {
					const module = moduleList[element.moduleIndex];
					const nameInModule = name.slice(rootPath.length + (rootPathList.length));
					const fullName = module.name + ":" + nameInModule;
					const def = module.defs.get(fullName);
					if (def != undefined) {
						return def;
					}
				}
			}
		}
		return null;
	}
	
	getMetaObj(): MetaObject {
		return {
			imports: this.imports.map((value) => {
				const module = moduleList[value.moduleIndex];
				// const fsPathList = [];
				// if (module.fsBasePath != null) {
				// 	fsPathList.push(module.fsBasePath);
				// }
				// fsPathList.push(module.name);
				const metaImport: MetaObjectImport = {
					rootPath: value.rootPath,
					name: module.name,
				};
				return metaImport;
			}),
		};
	}
	
	printDefs(extraLines?: boolean): string {
		let list: string[] = [];
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
		if (!this.evalQueue.includes(def)) {
			this.evalQueue.push(def);
			logger.log(LogType.module, `added to evalQueue: ${def.name}`);
		}
	}
	
	runEvalQueue() {
		logger.log(LogType.module, `runEvalQueue length: ${this.evalQueue.length}`);
		
		for (let i = 0; i < this.evalQueue.length; i++) {
			const def = this.evalQueue[i];
			
			const oldDir = this.currentDirectory;
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
			
			this.currentDirectory = oldDir;
		}
		this.evalQueue = [];
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
				const newDef: TopLevelDef = {
					// uuid: uuid,
					name: name,
					value: ASTnode.value,
					valueRelativeTo: this.currentDirectory,
					dependencies: [],
				};
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
		console.log(`printDefs:\n${this.printDefs()}`);
		console.log(`getMetaObj:`, this.getMetaObj());
	}
}