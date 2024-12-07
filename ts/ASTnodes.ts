import { getClassName, Hash, TODO, TODO_addError, unreachable } from "./utilities.js";
import { Module } from "./Module.js";
import { Report } from "./report.js";
import { builtinModule, builtinPrefix, getBuiltinType } from "./builtin.js";
import { CodeGenContext } from "./codegen.js";
import { isOperator } from "./lexer.js";
import logger, { LogType } from "./logger.js";

export type SourceLocation = "builtin" | {
	path: string,
	line: number,
	startColumn: number,
	endColumn: number,
	indentation: number,
	origin?: ASTnode,
};

export function SourceLocation_same(a: SourceLocation, b: SourceLocation): boolean {
	if (a == "builtin" || b == "builtin") return false;
	return (
		a.path == b.path &&
		a.line == b.line &&
		a.startColumn == b.startColumn &&
		a.endColumn == b.endColumn
	);
}

function fromNode(node: ASTnode): SourceLocation {
	const location = node.location;
	if (location == "builtin") {
		return location;
	} else {
		return {
			path: location.path,
			line: location.line,
			startColumn: location.startColumn,
			endColumn: location.endColumn,
			indentation: location.indentation,
			origin: node,
		};
	}
}

function getLast<T>(array: T[]): T {
	return array[array.length-1];
}

export type ResolveMode = "none" | "types" | "all" | "force";

export class LocalBuilderContext {
	// aliases: ASTnode_alias[] = [];
	// objects: ASTnode_object[] = [];
	scopes: ASTnode[][] = [];
}

export type DebuggerRecordType = "evaluate_start" | "evaluate_end" | "getType_start" | "getType_end";

export class DebuggerRecord {
	constructor(
		public type: DebuggerRecordType,
		public location: SourceLocation,
		public text: string,
	) {}
}

export class BuilderContext {
	local = new LocalBuilderContext();
	setUnalias: boolean = false;
	
	/**
	 * Resolve is for a case like this:
	 * 
	 * ```@x(Number) x + (1 + 1)```
	 * 
	 * If the function is at top level, I want the AST to stay the same.
	 * If resolve always happened the output of that expression would be:
	 * 
	 * ```@x(Number) x + 2```
	 * 
	 * Which is probably fine in this case, but for more complex expressions,
	 * having everything be reduced can make things completely unreadable.
	 * And can ruin the point of abstraction!
	 */
	resolve: ResolveMode = "all";
	
	evalStack: ASTnode[] = [];
	// fnStack: ASTnode_function[] = [];
	
	// currentDef: TopLevelDef | null = null;
	
	constructor(
		readonly module: Module,
	) {}
	
	pushEvalStack(node: ASTnode) {
		this.evalStack.push(node);
	}
	
	popEvalStack() {
		this.evalStack.pop();
	}
	
	isOnEvalStackOnlyIdentifiers(node: ASTnode): boolean {
		for (let i = 0; i < this.evalStack.length; i++) {
			const onStack = this.evalStack[i];
			if (!(onStack instanceof ASTnode_identifier)) {
				return false;
			}
			if (node.equals(onStack)) {
				return true;
			}
		}
		return false;
	}
	
	isOnEvalStack(node: ASTnode): boolean {
		for (let i = 0; i < this.evalStack.length; i++) {
			const onStack = this.evalStack[i];
			if (node.location == "builtin" && onStack.location == "builtin") {
				if (node == onStack) {
					return true;
				}
			}
			if (node.equals(onStack)) {
				return true;
			}
		}
		return false;
	}
	
	resolveTypes(): boolean {
		return this.resolve == "types" || this.doResolve();
	}
	
	doResolve(): boolean {
		return this.resolve == "all" || this.forceResolve();
	}
	
	forceResolve(): boolean {
		return this.resolve == "force";
	}
	
	getAlias(name: string): ASTnode_alias | null {
		if (name == "#import") {
			const alias = builtinModule.root.getMember("import");
			if (alias == null) unreachable();
			return alias;
		}
		
		for (let i = this.local.scopes.length-1; i >= 0; i--) {
			const scope = this.local.scopes[i];
			for (let j = 0; j < scope.length; j++) {
				const alias = scope[j];
				if (
					alias instanceof ASTnode_alias &&
					alias.left instanceof ASTnode_identifier &&
					alias.left.name == name
				) {
					return alias;
				}
			}
		}
		
		return null;
	}
	
	// getDef(name: string): [ModulePath, TopLevelDef] | null {
	// 	if (name == "#import") {
	// 		const def = builtins.get(builtinPrefix + "import");
	// 		if (def == undefined) unreachable();
	// 		return [new ModulePath([name]), def];
	// 	}
		
	// 	// if (name.startsWith("~")) {
	// 	// 	const path = name.slice(1);
	// 	// 	const def = this.module.getDef(this.module.currentDirectory, path);
	// 	// 	if (def != null) {
	// 	// 		return def;
	// 	// 	}
	// 	// } else {
	// 	const pair = this.module.getDef(this.module.currentDirectory, new ModulePath([name]));
	// 	if (pair != null) {
	// 		return pair;
	// 	}
	// 	// }
		
	// 	return null;
	// }
	
	debuggerRecords: DebuggerRecord[] = [];
	debug() {
		let indent = 0;
		console.log(this.debuggerRecords.map((record) => {
			let text = "";
			let currentIndent = indent;
			if (record.type == "evaluate_start") {
				indent++;
				text += "-> ";
			} else if (record.type == "evaluate_end") {
				indent--;
				currentIndent--;
				text += "<- ";
			} else if (record.type == "getType_start") {
				indent++;
				text += "type-> ";
			} else if (record.type == "getType_end") {
				indent--;
				currentIndent--;
				text += "type<- ";
			}
			text += "  ".repeat(currentIndent);
			
			return text + record.text;
		}).join("\n"));
	}
}

class makeHashContext {
	nextRef = 0;
	refs = new Map<ASTnode, number>();
}

function makeHash(context: makeHashContext, input: string | number | ASTnode | any[]): string {
	if (typeof input == "string" || typeof input == "number" || typeof input == "boolean") {
		const text = `${input}`;
		return `${typeof input}${text.length}${text}`;
	} else if (input instanceof Array) {
		return `array${input.length}[${input.map((element) => {
			return makeHash(context, element);
		}).join()}]`;
	} else if (input instanceof ASTnode) {
		const ref = context.refs.get(input);
		if (ref != undefined) {
			return `ref<${ref}>`
		}
		context.refs.set(input, context.nextRef);
		context.nextRef++;
		return `hash${input.getHash(context).toString()}`;
	} else {
		const text = JSON.stringify(input);
		return `json${text.length}${text}`;
	}
}

export class ASTnode {
	// lastAliasName: string | null = null;
	__cashedHash__ : Hash | null = null;
	
	id: string = "";
	
	// TODO: Use this for the builtin module for performance.
	// __CannotBeReducedMore__ = false;
	
	constructor(
		readonly location: SourceLocation,
	) {}
	
	equals(other: ASTnode): boolean {
		return this.getHash().equals(other.getHash());
	}
	
	isType(context: BuilderContext): this is ASTnodeType {
		const objectType = (
			this instanceof ASTnode_object &&
			this.hasPrototype(context, getBuiltinType("Type"))
		);
		
		return objectType || this instanceof ASTnodeType_functionType;
	}
	
	isDeadEnd(): this is ASTdeadEnd {
		return this instanceof ASTnode_error || this instanceof ASTnode_unknown;
	}
	
	getHash(context = new makeHashContext()): Hash {
		if (this.__cashedHash__ != null) {
			return this.__cashedHash__;
		}
		
		const hashInput = Object.keys(this).flatMap(key => {
			if (key == "prototype" || key == "location" || key == "__cashedHash__") {
				return [];
			}
			
			const value = (this as any)[key];
			
			// for ASTnode_builtinTask
			if (value instanceof Function) {
				return [];
			}
			
			return [makeHash(context, value)];
		}).join();
		
		// console.log("hashInput:", getClassName(this), Object.keys(this), hashInput);
		const hash = new Hash(hashInput);
		
		if (context.refs.size == 0) {
			this.__cashedHash__ = hash;
		}
		
		return hash;
	}
	
	/**
	 * Should not be over written by a subclass!
	 */
	print(context = new CodeGenContext()): string {
		// if (this.location != "builtin" && this.location.origin != undefined) {
		// 	const thisIsBuiltinType = this instanceof ASTnodeType && isSomeBuiltinType(this);
			
		// 	let printOrigin = false;
		// 	const origin = this.location.origin;
			
		// 	if (context.fprintOrigin) {
		// 		printOrigin = true;
		// 	}
			
		// 	if (printOrigin) {
		// 		const oldNoPrintOrigin = context.fprintOrigin;
		// 		context.fprintOrigin = false;
		// 		const text = origin._print(context);
		// 		context.fprintOrigin = oldNoPrintOrigin;
		// 		return text;
		// 	}
		// }
		
		if (this.id.startsWith(builtinPrefix)) {
			return this.id;
		}
		
		// const oldNoPrintOrigin = context.forceLastAliasName;
		// context.forceLastAliasName = false;
		const text = this._print(context);
		// context.forceLastAliasName = oldNoPrintOrigin;
		return text;
	}
	_print(context = new CodeGenContext()): string {
		unreachable();
	}
	
	/**
	 * Should not be over written by a subclass!
	 */
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		context.debuggerRecords.push(new DebuggerRecord(
			"getType_start",
			this.location,
			`${this.print()}`,
		));
		
		const output = this._getType(context);
		
		context.debuggerRecords.push(new DebuggerRecord(
			"getType_start",
			this.location,
			`${this.print()}`,
		));
		
		return output;
	}
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		unreachable();
	}
	
	/**
	 * Should not be over written by a subclass!
	 */
	evaluate(context: BuilderContext): ASTnode {
		
		const thisText = this.print();
		// console.log(`${evaluateDebugIndent}${"  ".repeat(evaluateDebugIndent)} > ${thisText}`);
		
		context.debuggerRecords.push(new DebuggerRecord(
			"evaluate_start",
			this.location,
			`${thisText}`,
		));
		
		if (this.print() == "__builtin__.Float64") {
			debugger;
		}
		
		// const outerRecords = context.debuggerRecords;
		// context.debuggerRecords = [];
		const output = this._evaluate(context);
		// const innerRecords = context.debuggerRecords;
		// context.debuggerRecords = outerRecords;
		
		context.debuggerRecords.push(new DebuggerRecord(
			"evaluate_end",
			this.location,
			`${output.print()}`,
		));
		
		if (this.equals(output)) {
			logger.log(LogType.resolve, "evaluation did not do anything");
		} else {
			// context.debuggerRecords.push(...innerRecords);
		}
		
		// if (this.location == "builtin") {
		// 	console.log(text);
		// } else {
		// 	const notError = new Report(text).indicator(this.location, "");
		// 	console.log(notError.getText("", false, true));
		// }
		
		return output;
	}
	_evaluate(context: BuilderContext): ASTnode {
		// unreachable();
		return this;
	}
}

export class ASTnode_command extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly text: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `>${this.text}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		unreachable();
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		unreachable();
	}
}

//#region literals

export class ASTnode_bool extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: boolean,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (this.value) {
			return "true";
		} else {
			return "false";
		}
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("Bool");
	}
}
export class ASTnode_number extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: number,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `${this.value}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("Float64");
	}
}
export class ASTnode_string extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `"${this.value.replaceAll("\n", "\\n").replaceAll("\"", "\\\"")}"`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("String");
	}
}

// export class ASTnode_list extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		readonly elements: ASTnode[],
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const elements = printAST(context, this.elements).join(", ");
// 		return `[${elements}]`;
// 	}
	
// 	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
// 		let type = getBuiltinType("__Unknown__");
// 		for (let i = 0; i < this.elements.length; i++) {
// 			const element = this.elements[i];
// 			const elementType = element.getType(context);
// 			if (elementType instanceof ASTnode_error) {
// 				return elementType;
// 			}
// 			if (isBuiltinType(type, "__Unknown__")) {
// 				type = elementType;
// 			} else {
// 				const error = expectType(context, type, elementType);
// 				if (error != null) {
// 					// TODO: add more error context
// 					return new ASTnode_error(fromNode(this), error);
// 				}
// 			}
// 		}
// 		return makeListType(type);
// 	}
	
// 	_evaluate(context: BuilderContext): ASTnode {
// 		const elements: ASTnode[] = [];
// 		for (let i = 0; i < this.elements.length; i++) {
// 			const element = this.elements[i];
// 			elements.push(element.evaluate(context));
// 		}
// 		return new ASTnode_list(fromNode(this), elements);
// 	}
// }

export type ASTnodeType = (ASTnode_object & {
	prototype: ASTnode_object
}) | ASTnodeType_functionType;
export class ASTnode_object extends ASTnode {
	// static prototypeName = "__prototype__";
	
	constructor(
		location: SourceLocation,
		readonly prototype: ASTnode | null,
		readonly members: ASTnode[],
		id: string = "",
	) {
		super(location);
		this.id = id;
	}
	
	hasPrototype(context: BuilderContext, other: ASTnodeType): boolean {
		if (!(other instanceof ASTnode_object)) {
			return false;
		}
		
		if (this.prototype == null) {
			return false;
		}
		
		const prototype = this.prototype;//.evaluate(context);
		if (!(prototype instanceof ASTnode_object)) {
			unreachable();
		}
		
		const same = prototype.equals(other);
		
		return same || prototype.hasPrototype(context, other);
	}
	
	// TODO: bad for this.members?
	addMember(name: string, value: ASTnode) {
		const location = "builtin"; // TODO? location
		// value.lastAliasName = name;
		const alias = new ASTnode_alias(
			location,
			new ASTnode_identifier(location, name),
			value,
		);
		this.members.push(alias);
	}
	
	// TODO: bad for this.members?
	setMember(name: string, value: ASTnode) {
		const member = this.getMember(name);
		if (member != null) {
			// TODO: will be bad soon
			(member.value as any) = value;
		} else {
			this.addMember(name, value);
		}
	}
	
	getMember(name: string): ASTnode_alias | null {
		for (let i = 0; i < this.members.length; i++) {
			const member = this.members[i];
			if (!(member instanceof ASTnode_alias) || !(member.left instanceof ASTnode_identifier)) {
				continue
			}
			if (member instanceof ASTnode_alias && member.left.name == name) {
				return member;
			}
		}
		return null;
	}
	
	_print(context = new CodeGenContext()): string {
		// if (context.forceLastAliasName || (context.stack.includes(this) && this.lastAliasName != null)) {
		// 	if (this.lastAliasName == null) {
		// 		unreachable();
		// 	}
		// 	return this.lastAliasName;
		// }
		if (context.stack.includes(this)) {
			return "__bad: stopping a stack overflow__";
		}
		
		context.stack.push(this);
		let prototype = "";
		if (this.prototype != null) {
			prototype = `&(${this.prototype.print(context)})`;
		}
		let memberText = joinBody(printAST(context, this.members)) + "\n";
		if (memberText.trim() == "") {
			memberText = "";
		}
		context.stack.pop();
		
		return `${this.id}${prototype}{${memberText}}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		// TODO: typecheck members
		// const valueType = member.value.getType(context);
		// if (valueType instanceof ASTnode_error) {
		// 	done();
		// 	return valueType;
		// }
		return getBuiltinType("Any");
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		if (context.isOnEvalStack(this)) {
			const object = new ASTnode_object(this.location, this.prototype, this.members, this.id);
			// object.lastAliasName = this.lastAliasName;
			return object;
		}
		
		context.local.scopes.push(this.members);
		context.pushEvalStack(this);
		function done() {
			context.local.scopes.pop();
			context.popEvalStack();
		}
		
		const members: ASTnode[] = [];
		for (let i = 0; i < this.members.length; i++) {
			const member = this.members[i];
			if (!(member instanceof ASTnode_alias)) {
				continue;
			}
			if (!(member.left instanceof ASTnode_identifier)) {
				TODO();
			}
			// const name = member.left.print();
			
			const value = member.value.evaluate(context);
			
			members.push(new ASTnode_alias(member.location,
				new ASTnode_identifier(member.left.location, member.left.name),
				value,
			));
		}
		
		done();
		const newObject = new ASTnode_object(this.location, this.prototype, members, this.id);
		// object.lastAliasName = this.lastAliasName;
		return newObject;
	}
}

//#endregion

//#region types

export class ASTnodeType_functionType extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly argType: ASTnode,
		readonly returnType: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const argType = this.argType.print(context);
		const returnType = this.returnType.print(context);
		return `\\(${argType}) -> ${returnType}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		{
			const argType = this.argType.getType(context);
			if (!argType.isType(context)) {
				return argType;
			}
			const error = expectType(context, getBuiltinType("Type"), argType);
			if (error != null) {
				return new ASTnode_error(this.location,
					error.indicator(this.location, "here")
				);
			}
		}
		{
			const returnType = this.returnType.getType(context);
			if (!returnType.isType(context)) {
				return returnType;
			}
			const error = expectType(context, getBuiltinType("Type"), returnType);
			if (error != null) {
				return new ASTnode_error(this.location,
					error.indicator(this.location, "here")
				);
			}
		}
		
		return getBuiltinType("Type");
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		const argType = this.argType.evaluate(context);
		const returnType = this.returnType.evaluate(context);
		return new ASTnodeType_functionType(fromNode(this), argType, returnType);
	}
}

//#endregion

//#region other

export class ASTnode_alias extends ASTnode {
	unalias = false;
	
	constructor(
		location: SourceLocation,
		/**
		 * left is an ASTnode instead of a string
		 * because an ASTnode lets the left side of the alias be something like `a.b.c`
		 */
		readonly left: ASTnode,
		readonly value: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const value = this.value.print(context);
		return `${left} = ${value}`;
	}
	
	/**
	 * Currently this gets the type of `value`.
	 */
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		// const leftType = this.left.getType(context);
		// // If the left side does not give an error, then that means left is already defined.
		// if (!(leftType instanceof ASTnode_error)) {
		// 	const oldResolve = context.resolve;
		// 	context.resolve = "force";
		// 	const original = this.left.evaluate(context);
		// 	context.resolve = oldResolve;
		// 	return new ASTnode_error(fromNode(this),
		// 		new CompileError(`alias '${this.left.print()}' is already defined`)
		// 			.indicator(this.location, `redefinition here`)
		// 			.indicator(original.location, `original from here`)
		// 	);
		// }
		
		const valueType = this.value.getType(context);
		if (!valueType.isType(context)) {
			return valueType;
		}
		
		return valueType;
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		const value = withResolve(context, () => this.value.evaluate(context));
		// value.lastAliasName = this.left.print();
		
		const out = new ASTnode_alias(fromNode(this), this.left, value);
		out.unalias = this.unalias;
		return out;
	}
}

export class ASTnode_identifier extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (isOperator(this.name) && !context.noParenthesesForFloatingOperators) {
			return `(${this.name})`;
		} else {
			return `${this.name}`;
		}
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		if (context.isOnEvalStackOnlyIdentifiers(this)) {
			// TODO: This is better than the compiler stack overflowing.
			// But this is still not a very good error message.
			return new ASTnode_error(
				this.location,
				new Report("recursive definition!")
					.indicator(this.location, "here")
			);
		}
		
		let value: ASTnode;
		{
			const alias = context.getAlias(this.name);
			if (alias != null) {
				value = alias.value;
			} else {
				return new ASTnode_error(fromNode(this),
					new Report(`alias '${this.name}' does not exist`)
						.indicator(this.location, `here`)
				);
				// const pair = context.getDef(this.name);
				// if (pair != null) {
				// 	value = pair[1].value;
				// 	if (context.currentDef != null && !context.currentDef.dependencies.includes(this.name)) {
				// 		context.currentDef.dependencies.push(this.name);
				// 	}
				// } else {
				// 	return new ASTnode_error(fromNode(this),
				// 		new CompileError(`alias '${this.name}' does not exist`)
				// 			.indicator(this.location, `here`)
				// 	);
				// }
			}
		}
		
		// const oldAliases = context.local.aliases;
		// context.local.aliases = [];
		context.pushEvalStack(this);
		const output = value.getType(context);
		context.popEvalStack();
		// context.local.aliases = oldAliases;
		
		return output;
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		let unalias = false;
		let value: ASTnode;
		// let defPair: [ModulePath, TopLevelDef] | null = null;
		{
			const alias = context.getAlias(this.name);
			if (alias != null) {
				value = alias.value.evaluate(context);
				if (alias.unalias) {
					unalias = true;
				}
			} else {
				unreachable();
				// defPair = context.getDef(this.name);
				// if (defPair != null) {
				// 	value = defPair[1].value.evaluate(context);
				// 	if (context.currentDef != null && !context.currentDef.dependencies.includes(this.name)) {
				// 		context.currentDef.dependencies.push(this.name);
				// 	}
				// } else {
				// 	unreachable();
				// }
			}
		}
		
		if (context.forceResolve()) {
			return value;
		}
		
		if ((context.doResolve() || unalias) && !value.isDeadEnd()) {
			// logger.log(LogType.resolve, `resolved ${this.name} to ${value.print()}`);
			return value;
		}
		
		const newIdentifier = new ASTnode_identifier(this.location, this.name);
		return newIdentifier;
	}
}

export class ASTnode_function extends ASTnode {
	/**
	 * TODO: hack for builtinTasks
	 * 
	 * There might be more elegant way of doing this.
	 */
	onlyResolveOnFullCall = false;
	
	constructor(
		location: SourceLocation,
		readonly arg: ASTnode_argument,
		readonly body: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		let type = this.arg.type.print(context);
		let body = printAST(context, this.body);
		if (this.body[0] instanceof ASTnode_function || !body.join("\n").includes("\n")) {
			return `@${this.arg.name}(${type}) ${body.join("\n")}`;
		} else {
			return `@${this.arg.name}(${type})${joinBody(body)}`;
		}
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		if (context.isOnEvalStack(this)) {
			return new ASTnode_unknown(fromNode(this), null);
		}
		
		const arg = this.arg;
		const argumentTypeType = arg.type.getType(context);
		if (!argumentTypeType.isType(context)) {
			return argumentTypeType;
		}
		
		let argumentType = withResolve(context, () => arg.type.evaluate(context));
		if (!argumentType.isType(context)) {
			argumentType = getBuiltinType("Any");
		}
		context.local.scopes.push([makeAliasWithType(arg.location, arg.name, argumentType as ASTnodeType)]);
		context.pushEvalStack(this);
		const actualResultType = getTypeFromList(context, this.body);
		context.popEvalStack();
		context.local.scopes.pop();
		
		if (actualResultType instanceof Array) {
			return new ASTnodeType_functionType(fromNode(this), argumentType, getLast(actualResultType));
		} else {
			return actualResultType;
		}
	}
	
	// Be very careful with early returns from this function.
	_evaluate(context: BuilderContext): ASTnode {
		if (context.isOnEvalStack(this)) {
			return new ASTnode_unknown(this.location, null);
		}
		
		const arg = this.arg;
		
		context.pushEvalStack(this);
		const argumentType = withResolve(context, () => arg.type.evaluate(context));
		context.popEvalStack();
		
		let argValue: ASTnode = new ASTnode_unknown(arg.location, null);
		if (argumentType.isType(context)) {
			argValue = new ASTnode_unknown(arg.location, argumentType);
		}
		
		context.local.scopes.push([
			new ASTnode_alias(arg.location, new ASTnode_identifier(arg.location, arg.name), argValue)
		]);
		const oldSetUnalias = context.setUnalias;
		context.setUnalias = false;
		context.pushEvalStack(this);
		const body = evaluateList(context, this.body);
		context.popEvalStack();
		context.setUnalias = oldSetUnalias;
		context.local.scopes.pop();
		
		if (!(body instanceof Array)) {
			return body; // deadEnd
		}
		
		const newFunction = new ASTnode_function(fromNode(this), new ASTnode_argument(arg.location, arg.name, argumentType), body);
		newFunction.onlyResolveOnFullCall = this.onlyResolveOnFullCall;
		newFunction.id = this.id;
		
		// logger.log(LogType.evaluate, "newFunction", newFunction.print());
		
		return newFunction;
	}
}

export class ASTnode_argument extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
		readonly type: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const type = this.type.print(context);
		return `${this.name} ${type}`;
	}
	
	evaluate(context: BuilderContext): ASTnode_argument {
		const type = this.type.evaluate(context);
		return new ASTnode_argument(fromNode(this), this.name, type);
	}
}

export class ASTnode_call extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly left: ASTnode,
		readonly arg: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const arg = this.arg.print(context);
		return `(${left} ${arg})`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const leftType = this.left.getType(context);
		if (leftType instanceof ASTnode_error) {
			return leftType;
		}
		if (leftType instanceof ASTnode_unknown) {
			return new ASTnode_unknown(this.location, null);
		}
		if (!(leftType instanceof ASTnodeType_functionType)) {
			const error = new Report(`can not call type ${leftType.print()}`)
				.indicator(this.left.location, `here`);
			return new ASTnode_error(fromNode(this), error);
		}
		
		const functionToCall = withResolve(context, () => this.left.evaluate(context));
		if (!(functionToCall instanceof ASTnode_function)) {
			if (leftType.returnType.isType(context)) {
				return leftType.returnType;
			} else {
				return getBuiltinType("Type");
			}
		}
		
		const functionToCallArgType = withResolve(context, () => functionToCall.arg.type.evaluate(context));
		if (!(functionToCallArgType.isType(context))) {
			TODO_addError();
		}
		
		const actualArgType = this.arg.getType(context);
		if (actualArgType instanceof ASTnode_error) {
			return actualArgType;
		}
		if (!(actualArgType instanceof ASTnode_unknown)) {
			const error = expectType(context, functionToCallArgType, actualArgType);
			if (error) {
				error.indicator(this.location, `for function call here`);
				error.indicator(this.arg.location, `(this argument)`);
				error.indicator(functionToCall.location, `function from here`);
				return new ASTnode_error(fromNode(this), error);
			}
		}
		
		const arg = this.arg;
		
		const resolved = withResolve(context, () => this.evaluate(context));
		if (resolved instanceof ASTnode_error) unreachable();
		if (resolved instanceof ASTnode_unknown) {
			const functionToCallType = functionToCall.getType(context);
			if (!(functionToCallType instanceof ASTnodeType_functionType)) {
				unreachable();
			}
			if (!(functionToCallType.returnType.isType(context))) {
				unreachable();
			}
			return functionToCallType.returnType;
		} else {
			const newAlias = makeAliasWithType(arg.location, functionToCall.arg.name, functionToCallArgType);
			newAlias.unalias = true;
			context.local.scopes.push([newAlias]);
			const returnType = resolved.getType(context);
			context.local.scopes.pop();
			
			return returnType;
		}
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		let functionToCall = this.left.evaluate(context);
		let argValue = this.arg.evaluate(context);
		let resolve = context.doResolve();
		
		const hasDeadEnd = functionToCall.isDeadEnd() || argValue.isDeadEnd();
		
		{
			const resolvedArg = withResolve(context, () => this.arg.evaluate(context));
			if (context.resolveTypes() && resolvedArg.isType(context)) {
				resolve = true;
				functionToCall = withResolve(context, () => this.left.evaluate(context))
				argValue = resolvedArg;
			}
		}
		
		if (functionToCall instanceof ASTnode_function && functionToCall.onlyResolveOnFullCall) {
			if (argValue.isDeadEnd()) {
				resolve = false;
			}
		}
		
		if (
			!hasDeadEnd &&
			functionToCall instanceof ASTnode_function &&
			!context.isOnEvalStack(functionToCall)
		) {
			const oldSetUnalias = context.setUnalias;
			context.setUnalias = true;
			const arg = functionToCall.arg;
			const newAlias = new ASTnode_alias(arg.location, new ASTnode_identifier(arg.location, arg.name), argValue);
			newAlias.unalias = true;
			context.local.scopes.push([newAlias]);
			if (!resolve) context.pushEvalStack(functionToCall);
			const resultList = evaluateList(context, functionToCall.body);
			if (!resolve) context.popEvalStack();
			context.local.scopes.pop();
			context.setUnalias = oldSetUnalias;
			
			if (resolve) {
				// if (this.location != "builtin") {
				// 	result.location = {
				// 		path: this.location.path,
				// 		line: this.location.line,
				// 		startColumn: this.location.startColumn,
				// 		endColumn: this.location.endColumn,
				// 		indentation: this.location.indentation,
				// 		origin: this,
				// 	};
				// }
				if (!(resultList instanceof Array)) {
					return resultList; // deadEnd
				}
				const result = resultList[resultList.length-1];
				return result;
			}
		}
		
		// logger.log(LogType.resolve, `call: ${context.resolve} -> ${functionToCall.print()}`);
		
		const newCall = new ASTnode_call(fromNode(this), functionToCall, argValue);
		return newCall;
	}
}

/**
 * `a * b` -> `(typeof a).* a b`
 */
export class ASTnode_operator extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly operatorText: string,
		readonly left: ASTnode,
		readonly right: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const right = this.right.print(context);
		return `(${left} ${this.operatorText} ${right})`;
	}
	
	getAsCall(context: BuilderContext): ASTnode {
		const leftType = this.left.getType(context);
		if (leftType.isDeadEnd()) {
			return leftType;
		}
		if (!(leftType instanceof ASTnode_object)) {
			TODO_addError();
		}
		const operatorFnMember = leftType.getMember(this.operatorText);
		if (operatorFnMember == null || !(operatorFnMember.value instanceof ASTnode_function)) {
			TODO_addError();
		}
		
		const operatorFnCall = new ASTnode_call(
			this.location,
			new ASTnode_call(
				this.location,
				operatorFnMember.value,
				this.left
			),
			this.right
		);
		
		return operatorFnCall;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const operatorFnCall = this.getAsCall(context);
		if (operatorFnCall instanceof ASTnode_error) {
			return operatorFnCall;
		}
		if (operatorFnCall instanceof ASTnode_unknown) {
			return new ASTnode_unknown(this.location, null);
		}
		
		return operatorFnCall.getType(context);
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		// const oldEvalStack = context.evalStack;
		// context.evalStack = [];
		const operatorFnCall = this.getAsCall(context);
		// context.evalStack = oldEvalStack;
		
		if (operatorFnCall instanceof ASTnode_error) {
			unreachable();
		}
		if (operatorFnCall instanceof ASTnode_unknown) {
			return this;
		}
		
		return operatorFnCall.evaluate(context);
	}
}

export class ASTnode_memberAccess extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly left: ASTnode,
		readonly name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		return `${left}.${this.name}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const left = this.left.evaluate(context);
		if (left.isDeadEnd()) {
			return left;
		}
		
		if (left instanceof ASTnode_object) {
			const alias = left.getMember(this.name);
			if (!alias) {
				TODO_addError();
			}
			
			return alias.value.getType(context);
		} else {
			TODO();
		}
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		const left = this.left.evaluate(context);
		if (left.isDeadEnd()) {
			const output = new ASTnode_memberAccess(fromNode(this), left, this.name);
			return output;
		}
		
		if (left instanceof ASTnode_object) {
			const alias = left.getMember(this.name);
			if (!alias) {
				unreachable();
			}
			
			return alias.value;
		}
		// else if (left instanceof ASTnodeType_enum) {
		// 	const enumCase = left.getCase(name);
		// 	if (enumCase == null) {
		// 		unreachable();
		// 	}
		// 	const task = new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
		// 		return left;
		// 	}, (context): ASTnode => {
		// 		return withResolve(context, () => {
		// 			const input = task_getArg(context, "input");
		// 			if (!(input instanceof ASTnode_instance)) {
		// 				return task;
		// 			}
		// 			const instance = new ASTnode_instance(this.location, left, input.codeBlock);
		// 			// instance.caseName = left.getCaseIndex(name);
		// 			// if (instance.caseName == null) {
		// 			// 	unreachable();
		// 			// }
		// 			instance.caseName = name;
		// 			return instance;
		// 		});
		// 	});
		// 	const enumConstructor = new ASTnode_function(
		// 		this.location,
		// 		new ASTnode_argument(this.location, "input", enumCase.type),
		// 		[
		// 			task
		// 		],
		// 	);
		// 	return enumConstructor;
		// }
		else {
			unreachable();
		}
	}
}

export class ASTnode_field extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
		readonly type: ASTnode,
	) {
		super(location);
	}
}

export class ASTnode_match extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly expression: ASTnode,
		readonly codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_matchCase extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
		readonly types: ASTnode[],
		readonly codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_while extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly condition: ASTnode,
		readonly codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_if extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly condition: ASTnode,
		readonly trueBody: ASTnode[],
		readonly falseBody: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const condition = this.condition.print(context);
		const trueBody = joinBody(printAST(new CodeGenContext(), this.trueBody));
		const falseBody = joinBody(printAST(new CodeGenContext(), this.falseBody));
		return `if ${condition} then${trueBody}\nelse${falseBody}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const conditionType = this.condition.getType(context);
		if (!conditionType.isType(context)) {
			return conditionType;
		}
		
		{
			const error = expectType(context, conditionType, getBuiltinType("Bool"));
			if (error) {
				TODO_addError();
			}
		}
		
		const trueList = getTypeFromList(context, this.trueBody);
		if (trueList instanceof ASTnode_error) {
			return trueList;
		}
		const falseList = getTypeFromList(context, this.falseBody);
		if (falseList instanceof ASTnode_error) {
			return falseList;
		}
		
		if (!(trueList instanceof Array) && !(falseList instanceof Array)) {
			TODO_addError();
		}
		if (!(trueList instanceof Array)) {
			return getLast(falseList as ASTnodeType[]);
		}
		if (!(falseList instanceof Array)) {
			return getLast(trueList as ASTnodeType[]);
		}
		
		const trueType = getLast(trueList);
		const falseType = getLast(trueList);
		
		// if (trueType instanceof ASTnode_unknown && falseType instanceof ASTnode_unknown) {
		// 	TODO_addError();
		// }
		// if (trueType instanceof ASTnode_unknown) {
		// 	return falseType;
		// }
		// if (falseType instanceof ASTnode_unknown) {
		// 	return trueType;
		// }
		
		// Make sure that trueType and falseType are the same.
		{
			const error = expectType(context, trueType, falseType);
			if (error) {
				const trueLocation = this.trueBody[this.trueBody.length-1].location;
				const falseLocation = this.falseBody[this.falseBody.length-1].location;
				error.indicator(trueLocation, `expected same type as trueBody (${trueType.print()})`);
				error.indicator(falseLocation, `but got type ${falseType.print()}`);
				return new ASTnode_error(fromNode(this), error);
			}
		}
		
		return trueType;
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		const condition = this.condition.evaluate(context);
		if (!(condition instanceof ASTnode_bool)) {
			let trueBody = evaluateList(context, this.trueBody);
			let falseBody = evaluateList(context, this.falseBody);
			
			const node = new ASTnode_if(
				fromNode(this),
				condition,
				trueBody,
				falseBody,
			);
			return node;
		}
		
		if (condition.value) {
			const resultList = evaluateList(context, this.trueBody);
			return resultList[resultList.length-1];
		} else {
			const resultList = evaluateList(context, this.falseBody);
			return resultList[resultList.length-1];
		}
	}
}

// export class ASTnode_unsafeEffect extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		readonly source: string,
// 		readonly list: ASTnode,
// 		readonly type: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const list = this.list.print(context);
// 		const type = this.type.print(context);
// 		return `unsafeEffect "${this.source.replaceAll("\"", "\\\"")}" ${list} ${type}`;
// 	}
	
// 	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
// 		{
// 			const error = this.type.getType(context);
// 			if (error instanceof ASTnode_error) {
// 				return error;
// 			}
// 		}
		
// 		let type = withResolve(context, () => this.type.evaluate(context));
// 		if (!type.isType()) {
// 			unreachable();
// 		}
		
// 		return makeEffectType(type);
// 	}
	
// 	_evaluate(context: BuilderContext): ASTnode {
// 		return new ASTnode_unsafeEffect(fromNode(this), this.source, this.list.evaluate(context), this.type.evaluate(context));
// 	}
// }

//#endregion

//#region internal

type ASTdeadEnd = ASTnode_error | ASTnode_unknown;

/**
 * Means failure to type check.
 * 
 * If `getType` finds this it should immediately return with the error.
 */
export class ASTnode_error extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly compileError: Report | null,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (this.compileError != null) {
			return `__compileError__(${this.compileError.msg})`;
		} else {
			return `__compileError__`;
		}
	}
}

/**
 * Means soft failure. A hole in the type system.
 * (cannot continue, but there is no type checking error)
 * 
 * In this example the value of `x` is ASTnode_unknown
 * during type checking of the function:
 * 
 * `@x(Number) x + 1`
 * 
 * We know that that `x` exists and we know it's type, but we do not know the value until the function is called.
 */
export class ASTnode_unknown extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly type: ASTnodeType | null,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		let type = "";
		if (this.type != null) {
			type = `(${this.type.print(context)})`;
		}
		return `__ASTnode_unknown__${type}`;
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		if (this.type == null) {
			unreachable();
		}
		return this.type;
	}
}

type ASTnode_builtinTask_dependency = {
	name: string,
	value: ASTnode,
};
export class ASTnode_builtinTask extends ASTnode {
	dependencies: ASTnode_builtinTask_dependency[] = [];
	
	constructor(
		readonly codegenId: string,
		// dependencies: string[],
		private task_getType: (context: BuilderContext) => ASTnodeType | ASTnode_error,
		private task_evaluate: (context: BuilderContext, task: ASTnode_builtinTask) => ASTnode,
	) {
		super("builtin");
		// for (let i = 0; i < dependencies.length; i++) {
		// 	const name = dependencies[i];
		// 	this.dependencies.push({
		// 		name: name,
		// 		value: new ASTnode_identifier(this.location, name),
		// 	});
		// }
	}
	
	getDependency(context: BuilderContext, name: string): ASTnode {
		for (let i = 0; i < this.dependencies.length; i++) {
			const dependency = this.dependencies[i];
			if (dependency.name == name) {
				return dependency.value.evaluate(context);
			}
		}
		unreachable();
	}
	
	_print(context = new CodeGenContext()): string {
		return "__builtinTask__";
	}
	
	_getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return this.task_getType(context);
	}
	
	_evaluate(context: BuilderContext): ASTnode {
		const output = this.task_evaluate(context, this);
		if (output == this) {
			const newTask = new ASTnode_builtinTask(
				this.codegenId,
				// [],
				this.task_getType,
				this.task_evaluate,
			);
			
			for (let i = 0; i < this.dependencies.length; i++) {
				const dependency = this.dependencies[i];
				
				let value = dependency.value.evaluate(context);
				if (value.isDeadEnd()) {
					value = dependency.value;
				}
				
				newTask.dependencies.push({
					name: dependency.name,
					value: value,
				});
			}
			
			return newTask;
		} else {
			// done
			return output;
		}
	}
}

//#endregion

//#region utilities

export function withResolve<T>(context: BuilderContext, fn: () => T): T {
	const oldResolve = context.resolve;
	context.resolve = "all";
	const output = fn();
	context.resolve = oldResolve;
	return output;
}

function getArgText(context: CodeGenContext, args: ASTnode[]): string {
	let argText = "";
	for (let i = 0; i < args.length; i++) {
		const argNode = args[i];
		const comma = argText == "";
		argText += argNode.print(context);
		if (comma) {
			argText += ", ";
		}
	}
	return argText;
}

export function makeAliasWithType(location: SourceLocation, name: string, type: ASTnodeType): ASTnode_alias {
	return new ASTnode_alias(
		location,
		new ASTnode_identifier(location, name),
		new ASTnode_unknown(location, type),
	);
}

export function getAliasFromList(AST: ASTnode[], name: string): ASTnode_alias | null {
	for (let i = 0; i < AST.length; i++) {
		const alias = AST[i];
		if (!(alias instanceof ASTnode_alias)) {
			unreachable();
		}
		if (alias.left instanceof ASTnode_identifier && alias.left.name == name) {
			return alias;
		}
	}

	return null;
}

/**
 * Takes an expectedType and an actualType, if the types are different returns a CompileError else null.
 */
function expectType(
	context: BuilderContext,
	expectedType: ASTnodeType,
	actualType: ASTnodeType,
): Report | null {
	// if (expectedType instanceof ASTnodeType_selfType) {
	// 	return null;
	// }
	
	// if (isBuiltinType(expectedType, "Any")) {
	// 	return null;
	// }
	
	// if (isBuiltinType(expectedType, "Function") && actualType instanceof ASTnodeType_functionType) {
	// 	return null;
	// }
	
	// if (expectedType instanceof ASTnodeType_functionType && actualType instanceof ASTnodeType_functionType) {
	// 	if (
	// 		!(expectedType.returnType instanceof ASTnodeType) ||
	// 		!(actualType.returnType instanceof ASTnodeType)
	// 	) {
	// 		unreachable();
	// 	}
	// 	const error = expectType(context, expectedType.returnType, actualType.returnType);
	// 	if (error != null) {
	// 		error.msg =
	// 		`expected type \"${expectedType.print()}\", but got type \"${actualType.print()}\"\n  return type `
	// 		+ error.msg;
	// 	}
	// 	return error;
	// }
	
	// if (expectedType.id != actualType.id) {
	// 	const expectedTypeText = expectedType.print();
	// 	const actualTypeText = actualType.print();
	// 	const error = new CompileError(`expected type ${expectedTypeText}, but got type ${actualTypeText}`);
	// 	debugger;
	// 	return error;
	// }
	
	// if (expectedType instanceof ASTnodeType_struct && actualType instanceof ASTnodeType_struct) {
	// 	for (let i = 0; i < expectedType.fields.length; i++) {
	// 		const expectedField = expectedType.fields[i];
	// 		const actualField = actualType.getField(expectedField.name);
	// 		if (!actualField) {
	// 			TODO_addError();
	// 		}
	// 		if (!(expectedField.type instanceof ASTnodeType) || !(actualField.type instanceof ASTnodeType)) {
	// 			unreachable();
	// 		}
	// 		const error = expectType(context, expectedField.type, actualField.type);
	// 		if (error != null) {
	// 			error.msg =
	// 			`expected type \"${expectedType.print()}\", but got type \"${actualType.print()}\"\n  field "${expectedField.name}" `
	// 			+ error.msg;
	// 			return error;
	// 		}
	// 	}
		
	// 	for (let i = 0; i < actualType.fields.length; i++) {
	// 		const actualField = actualType.fields[i];
	// 		const expectedField = expectedType.getField(actualField.name);
	// 		if (expectedField == null) {
	// 			TODO_addError();
	// 		}
	// 	}
	// }
	
	return null;
}

export function printAST(context: CodeGenContext, AST: ASTnode[]): string[] {
	let textList: string[] = [];
	
	for (let i = 0; i < AST.length; i++) {
		let nodeText = AST[i].print(context);
		textList.push(nodeText);
	}
	
	return textList;
}

export function getTypeFromList(context: BuilderContext, AST: ASTnode[]): ASTnodeType[] | ASTdeadEnd {
	context.local.scopes.push(AST);
	function done() {
		context.local.scopes.pop();
	}
	
	const outNodes: ASTnodeType[] = [];
	for (let i = 0; i < AST.length; i++) {
		const node = AST[i];
		// if (node instanceof ASTnode_alias) {
		// 	const valueType = node.getType(context);
		// 	if (valueType instanceof ASTnode_error) {
		// 		done();
		// 		return valueType;
		// 	}
		// 	const name = node.left.print();
		// 	context.local.aliases.push(makeAliasWithType(node.location, name, valueType));
		// } else {
		if (node instanceof ASTnode_error) {
			done();
			return node;
		} 
		const type = node.getType(context);
		if (!type.isType(context)) {
			done();
			return type;
		}
		outNodes.push(type);
		// }
	}
	
	done();
	return outNodes;
}

export function evaluateList(context: BuilderContext, AST: ASTnode[]): ASTnode[] {
	context.local.scopes.push(AST);
	function done() {
		context.local.scopes.pop();
	}
	
	let output: ASTnode[] = [];
	for (let i = 0; i < AST.length; i++) {
		const node = AST[i];
		const value = node.evaluate(context);
		// if (result instanceof ASTnode_alias) {
		// 	if (context.setUnalias) {
		// 		result.unalias = true;
		// 	}
		// 	context.local.aliases.push(result);
		// 	aliasCount++;
		// }
		output.push(value);
	}
	
	done();
	return output;
}

function joinBody(body: string[]): string {
	return indent("\n" + body.join("\n"));
}

function indent(text: string): string {
	return text.replaceAll("\n", "\n\t");
}

//#endregion