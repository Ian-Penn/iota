import * as utilities from "./utilities.js";
import logger, { LogType } from "./logger.js";
import { Module } from "./Module.js";
import { CompileError } from "./report.js";
import { builtinModule, builtinPrefix, getBuiltinType } from "./builtin.js";
import { CodeGenContext } from "./codegen.js";
import { isOperator } from "./lexer.js";

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

export class BuilderContext {
	local = new LocalBuilderContext();
	setUnalias: boolean = false;
	
	/**
	 * Resolve is for a case like this:
	 * 
	 * ```@x(Number) x + (1 + 1)```
	 * 
	 * If the function is a evaluated at top level, I want the AST to stay the same.
	 * If resolve always happened the output of that expression would be:
	 * 
	 * ```@x(Number) x + 2```
	 * 
	 * Which is probably fine in this case, but for more complex expressions,
	 * having everything be simplified can make things completely unreadable.
	 * And can ruin the point of abstraction!
	 */
	resolve: ResolveMode = "all";
	
	evalStack: ASTnode[] = [];
	// fnStack: ASTnode_function[] = [];
	
	// currentDef: TopLevelDef | null = null;
	
	constructor(
		public module: Module,
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
			if (SourceLocation_same(node.location, onStack.location)) {
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
			if (SourceLocation_same(node.location, onStack.location)) {
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
			if (alias == null) utilities.unreachable();
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
	// 		if (def == undefined) utilities.unreachable();
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
}

export class ASTnode {
	deadEnd = false;
	lastAliasName: string | null = null;
	
	constructor(
		public location: SourceLocation,
	) {}
	
	isType(context: BuilderContext): this is ASTnodeType {
		return (
			this instanceof ASTnode_object &&
			this.hasPrototype(context, getBuiltinType("Type"))
		) || (
			this instanceof ASTnodeType_functionType
		);
	}
	
	_print(context = new CodeGenContext()): string {
		utilities.unreachable();
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
		
		// const oldNoPrintOrigin = context.forceLastAliasName;
		// context.forceLastAliasName = false;
		const text = this._print(context);
		// context.forceLastAliasName = oldNoPrintOrigin;
		return text;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		utilities.unreachable();
	}
	
	evaluate(context: BuilderContext): ASTnode {
		return this;
	}
}

export class ASTnode_command extends ASTnode {
	constructor(
		location: SourceLocation,
		public text: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `>${this.text}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		utilities.unreachable();
	}
	
	evaluate(context: BuilderContext): ASTnode {
		utilities.unreachable();
	}
}

//#region literals

export class ASTnode_bool extends ASTnode {
	constructor(
		location: SourceLocation,
		public value: boolean,
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
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("Bool");
	}
}
export class ASTnode_number extends ASTnode {
	constructor(
		location: SourceLocation,
		public value: number,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `${this.value}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("Float64");
	}
}
export class ASTnode_string extends ASTnode {
	constructor(
		location: SourceLocation,
		public value: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `"${this.value.replaceAll("\n", "\\n").replaceAll("\"", "\\\"")}"`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return getBuiltinType("String");
	}
}

// export class ASTnode_list extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public elements: ASTnode[],
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const elements = printAST(context, this.elements).join(", ");
// 		return `[${elements}]`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
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
	
// 	evaluate(context: BuilderContext): ASTnode {
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
	
	public data: any = null;
	public name: string = "";
	
	constructor(
		location: SourceLocation,
		public prototype: ASTnode | null,
		public members: ASTnode[],
	) {
		super(location);
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
			utilities.unreachable();
		}
		
		return prototype.equals(other) || prototype.hasPrototype(context, other);
	}
	
	equals(other: ASTnode_object): boolean {
		return (
			this.name == other.name &&
			// TODO: Bad for performance because print is recursive!
			this.print() == other.print()
		);
	}
	
	addMember(name: string, value: ASTnode) {
		const location = "builtin"; // TODO? location
		value.lastAliasName = name;
		const alias = new ASTnode_alias(
			location,
			new ASTnode_identifier(location, name),
			value,
		);
		this.members.push(alias);
	}
	
	setMember(name: string, value: ASTnode) {
		const member = this.getMember(name);
		if (member != null) {
			member.value = value;
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
	
	getFunctionTypeData(): {
		argType: ASTnode,
		returnType: ASTnode,
	} | CompileError {
		debugger;
		const argType = this.getMember("returnType");
		if (argType == null) {
			utilities.TODO_addError();
		}
		
		const returnType = this.getMember("returnType");
		if (returnType == null) {
			utilities.TODO_addError();
		}
		
		return {
			argType: argType,
			returnType: returnType,
		};
	}
	
	_print(context = new CodeGenContext()): string {
		// if (context.forceLastAliasName || (context.stack.includes(this) && this.lastAliasName != null)) {
		// 	if (this.lastAliasName == null) {
		// 		utilities.unreachable();
		// 	}
		// 	return this.lastAliasName;
		// }
		if (context.stack.includes(this)) {
			return "__bad__";
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
		return `${prototype}{${memberText}}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		// TODO: typecheck members
		// const valueType = member.value.getType(context);
		// if (valueType instanceof ASTnode_error) {
		// 	done();
		// 	return valueType;
		// }
		return getBuiltinType("Any");
	}
	
	evaluate(context: BuilderContext): ASTnode {
		if (context.isOnEvalStack(this)) {
			const object = new ASTnode_object(this.location, this.prototype, this.members);
			object.lastAliasName = this.lastAliasName;
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
			// const name = member.left.print();
			
			const value = member.value.evaluate(context);
			
			members.push(value);
		}
		
		done();
		const object = new ASTnode_object(this.location, this.prototype, members);
		object.lastAliasName = this.lastAliasName;
		return object;
	}
}

//#endregion

//#region types

export class ASTnodeType_functionType extends ASTnode {
	constructor(
		location: SourceLocation,
		public argType: ASTnode,
		public returnType: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const argType = this.argType.print(context);
		const returnType = this.returnType.print(context);
		return `\\(${argType}) -> ${returnType}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
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
	
	evaluate(context: BuilderContext): ASTnode {
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
		public left: ASTnode,
		public value: ASTnode,
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
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
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
	
	evaluate(context: BuilderContext): ASTnode {
		const value = withResolve(context, () => this.value.evaluate(context));
		value.lastAliasName = this.left.print();
		
		const out = new ASTnode_alias(fromNode(this), this.left, value);
		out.unalias = this.unalias;
		return out;
	}
}

export class ASTnode_identifier extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
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
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		if (context.isOnEvalStackOnlyIdentifiers(this)) {
			// TODO: This is better than the compiler stack overflowing.
			// But this is still not a very good error message.
			return new ASTnode_error(
				this.location,
				new CompileError("recursive definition!")
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
					new CompileError(`alias '${this.name}' does not exist`)
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
	
	evaluate(context: BuilderContext): ASTnode {
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
				utilities.unreachable();
				// defPair = context.getDef(this.name);
				// if (defPair != null) {
				// 	value = defPair[1].value.evaluate(context);
				// 	if (context.currentDef != null && !context.currentDef.dependencies.includes(this.name)) {
				// 		context.currentDef.dependencies.push(this.name);
				// 	}
				// } else {
				// 	utilities.unreachable();
				// }
			}
		}
		
		if (context.forceResolve()) {
			return value;
		}
		
		if (value.deadEnd) {
			const newIdentifier = new ASTnode_identifier(this.location, this.name);
			newIdentifier.deadEnd = true;
			return newIdentifier;
		}
		
		if (context.doResolve() || unalias) {
			logger.log(LogType.resolve, `resolved ${this.name} to ${value.print()}`);
			return value;
		}
		
		const newIdentifier = new ASTnode_identifier(this.location, this.name);
		newIdentifier.deadEnd = true;
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
		public arg: ASTnode_argument,
		public body: ASTnode[],
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
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
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
	
	evaluate(context: BuilderContext): ASTnode {
		const arg = this.arg;
		
		const argumentType = withResolve(context, () => arg.type.evaluate(context));
		
		let argValue: ASTnode = new ASTnode_unknown(arg.location, null);
		if (argumentType.isType(context)) {
			argValue = new ASTnode_unknown(arg.location, argumentType);
		}
		
		let body = this.body;
		
		if (!context.isOnEvalStack(this)) {
			context.local.scopes.push([
				new ASTnode_alias(arg.location, new ASTnode_identifier(arg.location, arg.name), argValue)
			]);
			
			const oldSetUnalias = context.setUnalias;
			context.setUnalias = false;
			context.pushEvalStack(this);
			body = evaluateList(context, this.body);
			context.popEvalStack();
			context.setUnalias = oldSetUnalias;
			
			context.local.scopes.pop();
		}
		
		const newFunction = new ASTnode_function(fromNode(this), new ASTnode_argument(arg.location, arg.name, argumentType), body);
		newFunction.onlyResolveOnFullCall = this.onlyResolveOnFullCall;
		
		// logger.log(LogType.evaluate, "newFunction", newFunction.print());
		
		return newFunction;
	}
}

export class ASTnode_argument extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public type: ASTnode,
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
		public left: ASTnode,
		public arg: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const arg = this.arg.print(context);
		return `(${left} ${arg})`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const leftType = this.left.getType(context);
		if (leftType instanceof ASTnode_error) {
			return leftType;
		}
		if (!(leftType instanceof ASTnodeType_functionType)) {
			const error = new CompileError(`can not call type ${leftType.print()}`)
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
			utilities.TODO_addError();
		}
		
		const actualArgType = this.arg.getType(context);
		if (!actualArgType.isType(context)) {
			return actualArgType;
		}
		
		{
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
		if (resolved.deadEnd) {
			const functionToCallType = functionToCall.getType(context);
			if (!(functionToCallType instanceof ASTnodeType_functionType)) {
				utilities.unreachable();
			}
			if (!(functionToCallType.returnType.isType(context))) {
				utilities.unreachable();
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
	
	evaluate(context: BuilderContext): ASTnode {
		let functionToCall = this.left.evaluate(context);
		let argValue = this.arg.evaluate(context);
		let resolve = context.doResolve();
		
		const hasDeadEnd = functionToCall.deadEnd || argValue.deadEnd;
		
		{
			const resolvedArg = withResolve(context, () => this.arg.evaluate(context));
			if (context.resolveTypes() && resolvedArg.isType(context)) {
				resolve = true;
				functionToCall = withResolve(context, () => this.left.evaluate(context))
				argValue = resolvedArg;
			}
		}
		
		if (functionToCall instanceof ASTnode_function && functionToCall.onlyResolveOnFullCall) {
			if (argValue.deadEnd) {
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
			let result = resultList[resultList.length-1];
			if (!resolve) context.popEvalStack();
			context.local.scopes.pop();
			context.setUnalias = oldSetUnalias;
			
			if (resolve) {
				if (this.location != "builtin") {
					result.location = {
						path: this.location.path,
						line: this.location.line,
						startColumn: this.location.startColumn,
						endColumn: this.location.endColumn,
						indentation: this.location.indentation,
						origin: this,
					};
				}
				return result;
			}
		}
		
		logger.log(LogType.resolve, `call: ${context.resolve} -> ${functionToCall.print()}`);
		
		const newCall = new ASTnode_call(fromNode(this), functionToCall, argValue);
		newCall.deadEnd = hasDeadEnd;
		return newCall;
	}
}

/**
 * `a * b` -> `(typeof a).* a b`
 */
export class ASTnode_operator extends ASTnode {
	constructor(
		location: SourceLocation,
		public operatorText: string,
		public left: ASTnode,
		public right: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const right = this.right.print(context);
		return `(${left} ${this.operatorText} ${right})`;
	}
	
	getAsCall(context: BuilderContext): ASTnode_call | ASTnode_error {
		const leftType = this.left.getType(context);
		if (leftType instanceof ASTnode_error) {
			return leftType;
		}
		if (!(leftType instanceof ASTnode_object)) {
			utilities.TODO_addError();
		}
		const operatorFnMember = leftType.getMember(this.operatorText);
		if (operatorFnMember == null || !(operatorFnMember.value instanceof ASTnode_function)) {
			utilities.TODO_addError();
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
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const operatorFnCall = this.getAsCall(context);
		if (operatorFnCall instanceof ASTnode_error) {
			return operatorFnCall;
		}
		
		return operatorFnCall.getType(context);
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const operatorFnCall = this.getAsCall(context);
		if (operatorFnCall instanceof ASTnode_error) {
			return operatorFnCall;
		}
		
		return operatorFnCall.evaluate(context);
	}
}

export class ASTnode_memberAccess extends ASTnode {
	constructor(
		location: SourceLocation,
		public left: ASTnode,
		public name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		return `${left}.${this.name}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const left = this.left.evaluate(context);
		if (left.deadEnd) {
			return new ASTnode_unknown(this.location, null);
		}
		
		if (left instanceof ASTnode_object) {
			const alias = left.getMember(this.name);
			if (!alias) {
				utilities.TODO_addError();
			}
			
			return alias.value.getType(context);
		} else {
			utilities.TODO();
		}
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const left = this.left.evaluate(context);
		
		if (left.deadEnd) {
			const output = new ASTnode_memberAccess(fromNode(this), left, this.name);
			if (context.doResolve()) {
				output.deadEnd = true;
			}
			return output;
		}
		
		if (left instanceof ASTnode_object) {
			const alias = left.getMember(this.name);
			if (!alias) {
				utilities.unreachable();
			}
			
			return alias.value;
		}
		// else if (left instanceof ASTnodeType_enum) {
		// 	const enumCase = left.getCase(name);
		// 	if (enumCase == null) {
		// 		utilities.unreachable();
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
		// 			// 	utilities.unreachable();
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
			utilities.unreachable();
		}
	}
}

export class ASTnode_field extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public type: ASTnode,
	) {
		super(location);
	}
}

export class ASTnode_match extends ASTnode {
	constructor(
		location: SourceLocation,
		public expression: ASTnode,
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_matchCase extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public types: ASTnode[],
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_while extends ASTnode {
	constructor(
		location: SourceLocation,
		public condition: ASTnode,
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_if extends ASTnode {
	constructor(
		location: SourceLocation,
		public condition: ASTnode,
		public trueBody: ASTnode[],
		public falseBody: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const condition = this.condition.print(context);
		const trueBody = joinBody(printAST(new CodeGenContext(), this.trueBody));
		const falseBody = joinBody(printAST(new CodeGenContext(), this.falseBody));
		return `if ${condition} then${trueBody}\nelse${falseBody}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		const conditionType = this.condition.getType(context);
		if (!conditionType.isType(context)) {
			return conditionType;
		}
		
		{
			const error = expectType(context, conditionType, getBuiltinType("Bool"));
			if (error) {
				utilities.TODO_addError();
			}
		}
		
		const trueList = getTypeFromList(context, this.trueBody);
		if (!(trueList instanceof Array)) {
			return trueList;
		}
		const trueType = getLast(trueList);
		const falseList = getTypeFromList(context, this.falseBody);
		if (falseList instanceof ASTnode_error) {
			return falseList;
		}
		const falseType = getLast(trueList);
		
		if (trueType instanceof ASTnode_unknown && falseType instanceof ASTnode_unknown) {
			utilities.TODO_addError();
		}
		if (trueType instanceof ASTnode_unknown) {
			return falseType;
		}
		if (falseType instanceof ASTnode_unknown) {
			return trueType;
		}
		
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
	
	evaluate(context: BuilderContext): ASTnode {
		const condition = this.condition.evaluate(context);
		if (!(condition instanceof ASTnode_bool)) {
			const trueBody = evaluateList(context, this.trueBody);
			const falseBody = evaluateList(context, this.falseBody);
			
			return new ASTnode_if(
				fromNode(this),
				condition,
				trueBody,
				falseBody,
			);
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
// 		public source: string,
// 		public list: ASTnode,
// 		public type: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const list = this.list.print(context);
// 		const type = this.type.print(context);
// 		return `unsafeEffect "${this.source.replaceAll("\"", "\\\"")}" ${list} ${type}`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
// 		{
// 			const error = this.type.getType(context);
// 			if (error instanceof ASTnode_error) {
// 				return error;
// 			}
// 		}
		
// 		let type = withResolve(context, () => this.type.evaluate(context));
// 		if (!type.isType()) {
// 			utilities.unreachable();
// 		}
		
// 		return makeEffectType(type);
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		return new ASTnode_unsafeEffect(fromNode(this), this.source, this.list.evaluate(context), this.type.evaluate(context));
// 	}
// }

//#endregion

//#region internal

type ASTdeadEnd = ASTnode_error | ASTnode_unknown;

export class ASTnode_error extends ASTnode {
	constructor(
		location: SourceLocation,
		public compileError: CompileError | null,
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

export class ASTnode_unknown extends ASTnode {
	constructor(
		location: SourceLocation,
		public type: ASTnodeType | null,
	) {
		super(location);
		this.deadEnd = true;
	}
	
	_print(context = new CodeGenContext()): string {
		let type = "";
		if (this.type != null) {
			type = `(${this.type.print(context)})`;
		}
		return `__ASTnode_unknown__${type}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		if (this.type == null) {
			utilities.TODO();
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
		private _getType: (context: BuilderContext) => ASTnodeType | ASTnode_error,
		private _evaluate: (context: BuilderContext, task: ASTnode_builtinTask) => ASTnode,
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
		utilities.unreachable();
	}
	
	_print(context = new CodeGenContext()): string {
		return "__builtinTask__";
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTdeadEnd {
		return this._getType(context);
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const output = this._evaluate(context, this);
		if (output == this) {
			const newTask = new ASTnode_builtinTask(
				this.codegenId,
				// [],
				this._getType,
				this._evaluate,
			);
			
			for (let i = 0; i < this.dependencies.length; i++) {
				const dependency = this.dependencies[i];
				
				let value = dependency.value.evaluate(context);
				if (value.deadEnd) {
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
			utilities.unreachable();
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
): CompileError | null {
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
	// 		utilities.unreachable();
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
	// 			utilities.TODO_addError();
	// 		}
	// 		if (!(expectedField.type instanceof ASTnodeType) || !(actualField.type instanceof ASTnodeType)) {
	// 			utilities.unreachable();
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
	// 			utilities.TODO_addError();
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
		const value = node.getType(context);
		if (!value.isType(context)) {
			done();
			return value;
		}
		outNodes.push(value);
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