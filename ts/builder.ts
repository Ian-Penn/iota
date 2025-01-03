import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_codeBlock,
	ASTnode_event,
	ASTnode_field,
	ASTnode_for,
	ASTnode_identifier,
	ASTnode_number,
	ASTnode_operator,
	ASTnode_set,
	ASTnode_string
} from "./ASTnodes.js";
import { getBuiltinScope } from "./builtin.js";
import { inSetOperator, notInSetOperator } from "./lexer.js";
import { getClassName, getUniqueInArray, Hash, TODO, TODO_addError, unreachable } from "./utilities.js";

export enum OptLevel {
	none,
	basic,
}

export class BuilderSettings {
	allowArbitraryCodeExecution = false;
	
	opt = OptLevel.basic;
	logging = false;
	addDebugger = false;
	
	languageSettings: {
		[key: string]: any;
	} = {};
}

enum Mode {
	interrogative,
	declarative,
}

enum UnaryOperator {
	not,
}

enum BinaryOperator {
	inSet,
	notInSet,
	addToSet,
	removeFromSet,
	
	add,
	subtract,
	multiply,
	divide,
	
	and,
	or,
	
	shallowEquals,
	setVar,
	
	lessThan,
	greaterThan,
}

// Makes it a little easier to generate something other than js later.
class Js {
	eventPrefix = "event_";
	varPrefix = "var_";
	allowArbitraryCodeExecution = false;
	
	languageSettings: {
		logFnName: string;
		[key: string]: any;
	};
	
	constructor(
		languageSettings: {
			[key: string]: any;
		}
	) {
		this.languageSettings = Object.assign({
			logFnName: "console.log",
		}, languageSettings);
	}
	
	bool(value: boolean): string {
		if (value) {
			return "true";
		} else {
			return "false";
		}
	}
	
	number(value: number): string {
		return `${value}`;
	}
	
	string(value: string): string {
		return `"${value.replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`;
	}
	
	use(name: string): string {
		return this.varPrefix + name;
	}
	
	alias(name: string, value: string): string {
		return `let ${this.varPrefix + name} = ${value};`
	}
	
	iterateSet(set: string, elementName: string, codeBlock: string[]): string {
		return `${set}.forEach(${this.use(elementName)} => ${this.codeBlock(codeBlock)})`;
	}
	
	func(name: string, argNames: string[], body: string[]): string {
		return `function ${this.eventPrefix + name}(${argNames.join(", ")}) {${joinBody(body)}\n}`;
	}
	
	call(name: string, args: string[]): string {
		return `${this.eventPrefix + name}(${args.join(", ")})`;
	}
	
	unaryOperator(op: UnaryOperator, input: string): string {
		if (op == UnaryOperator.not) {
			return `!(${input})`;
		}
		
		TODO();
	}
	
	binaryOperator(op: BinaryOperator, left: string, right: string): string {
		if (op == BinaryOperator.inSet) {
			return `${right}.has(${left})`;
		}
		if (op == BinaryOperator.notInSet) {
			return `!${right}.has(${left})`;
		}
		if (op == BinaryOperator.removeFromSet) {
			return `${right}.delete(${left})`;
		}
		if (op == BinaryOperator.addToSet) {
			return `${right}.add(${left})`;
		}
		
		if (op == BinaryOperator.add) {
			return `${left} + ${right}`;
		}
		if (op == BinaryOperator.subtract) {
			return `${left} - ${right}`;
		}
		
		if (op == BinaryOperator.and) {
			return `${left} && ${right}`;
		}
		if (op == BinaryOperator.or) {
			return `${left} || ${right}`;
		}
		
		if (op == BinaryOperator.shallowEquals) {
			return `${left} == ${right}`;
		}
		if (op == BinaryOperator.setVar) {
			return `${left} = ${right}`;
		}
		if (op == BinaryOperator.lessThan) {
			return `${left} < ${right}`;
		}
		if (op == BinaryOperator.greaterThan) {
			return `${left} > ${right}`;
		}
		
		TODO();
	}
	
	multipleStatements(list: string[]): string {
		if (list.length == 0) return "";
		return `${list.join(";\n")};`;
	}
	
	if(condition: string, body: string[]): string {
		if (body.length == 1) {
			return `if (${condition}) ${body[0]}`;
		} else {
			return `if (${condition}) {${joinBody(body)}\n}`;
		}
	}
	
	while(condition: string, body: string[]): string {
		return `while (${condition}) {${joinBody(body)}\n}`;
	}
	
	codeBlock(body: string[]): string {
		return `{${joinBody(body)}\n}`;
	}
	
	assert(condition: string, message: string): string {
		return `if (${condition}) throw ${this.string(message)};`;
	}
	
	log(message: string): string {
		return `${this.languageSettings.logFnName}(${this.string(message)});`;
	}
	
	logList(list: string[]): string {
		return `${this.languageSettings.logFnName}(${list.join(", ")});`;
	}
	
	makeMin(a: string, b: string): string {
		return `${a} = Math.min(${a}, ${b}) - 1;`;
	}
	
	makeMax(a: string, b: string): string {
		return `${a} = Math.max(${a}, ${b}) + 1;`;
	}
	
	file(text: string): string {
		let output = "";
		
		// output += this.func("iterate", ["set", "callBack"], joinBody([
		// 	`${this.use("set")}.forEach(${this.use("callBack")})`
		// ])) + "\n";
		output += text;
		
		return output;
	}
};

type BuildRequest = {
	type: "hasInterrogativeUseOfIdentifier",
	name: string,
	output: boolean,
};
// {
// 	type: "hasInterrogativeUseOfHash",
// 	hash: Hash,
// 	output: boolean,
// }

class UpContext {
	pre: string[] = [];
	post: string[] = [];
	breakout: string[] | null = null;
};

export function buildAST(topAST: ASTnode[], settings: BuilderSettings): string {
	const js = new Js(settings.languageSettings);
	const builtinAST = getBuiltinScope();
	const scopes: ASTnode[][] = [builtinAST];
	const dependencyStack: ASTnode[] = [];
	
	let nextBreakoutLoopId = 0;
	
	const breakoutLoopMap = new Map<number, ASTnode[]>();
	
	function getBreakoutLoopOutId(node: ASTnode): number | null {
		for (const [id, list] of breakoutLoopMap) {
			if (list.includes(node)) {
				return id;
			}
		}
		return null;
	}
	
	function unalias(name: string) {
		for (let scopeI = 0; scopeI < scopes.length; scopeI++) {
			const scope = scopes[scopeI];
			for (let i = 0; i < scope.length; i++) {
				const node = scope[i];
				
				if (!(node instanceof ASTnode_alias) || !(node.left instanceof ASTnode_identifier)) {
					continue;
				}
				
				if (node.left.name == name) {
					return node.value;
				}
			}
		}
	}
	
	/**
	 * Get operators that need to be reevaluated for `operator`
	 */
	function getDependencies(operator: ASTnode_operator): ASTnode[] {
		// console.log("getDependencies", operator.print());
		
		const output: ASTnode[] = [];
		
		const identifiers: string[] = [];
		
		operator.analyze((identifier) => {
			if (!(identifier instanceof ASTnode_identifier)) return false;
			
			// console.log("operator.analyze", identifier);
			
			if (!identifiers.includes(identifier.name)) {
				identifiers.push(identifier.name);
			}
			
			return false;
		});
		
		identifiers.forEach((identifier) => {
			for (let scopeI = 0; scopeI < scopes.length; scopeI++) {
				const scope = scopes[scopeI];
				for (let i = 0; i < scope.length; i++) {
					const node = scope[i];
					
					if (!(node instanceof ASTnode_operator)) {
						continue;
					}
					
					const request: BuildRequest = {
						type: "hasInterrogativeUseOfIdentifier",
						name: identifier,
						output: false,
					}
					build(node, new UpContext(), request, Mode.declarative);
					if (request.output) {
						output.push(node);
					}
				}
			}
		});
		
		return output;
	}
	
	function build(node: ASTnode, upContext: UpContext, request: BuildRequest | null, mode: Mode): string {
		if (request && request.type == "hasInterrogativeUseOfIdentifier") {
			if (
				mode == Mode.interrogative &&
				node instanceof ASTnode_identifier &&
				!node.useOld &&
				node.name == request.name
			) {
				request.output = true;
				return "BuildRequestDone";
			}
		}
		
		if (node instanceof ASTnode_bool) {
			return js.bool(node.value);
		}
		
		else if (node instanceof ASTnode_number) {
			return js.number(node.value);
		}
		
		else if (node instanceof ASTnode_string) {
			return js.string(node.value);
		}
		
		else if (node instanceof ASTnode_set) {
			return `new Set()`;
		}
		
		else if (node instanceof ASTnode_atom) {
			return `{}`;
		}
		
		else if (node instanceof ASTnode_identifier) {
			// const value = unalias(node.name);
			// console.log("ASTnode_identifier", node.name, value);
			
			return js.use(node.name);
		}
		
		else if (node instanceof ASTnode_operator) {
			if (node.operatorText == "->") {
				if (mode != Mode.declarative) TODO_addError();
				
				if (node.left instanceof ASTnode_for) {
					const set = build(node.left.set, upContext, request, Mode.interrogative);
					
					const newUpContext = new UpContext();
					const right = build(node.right, newUpContext, request, Mode.declarative);
					return js.iterateSet(set, node.left.elementName, [...newUpContext.pre, right, ...newUpContext.post]);
				}
				
				const left = build(node.left, upContext, request, Mode.interrogative);
				
				const newUpContext = new UpContext();
				const right = build(node.right, newUpContext, request, Mode.declarative);
				if (newUpContext.breakout != null) {
					return js.codeBlock(newUpContext.breakout);
				}
				
				const body = [...newUpContext.pre, right, ...newUpContext.post];
				
				return js.if(left, body);
			}
			
			// When something is changed (Mode.declarative)
			// all of the dependencies need to be reevaluated.
			if (request == null && mode == Mode.declarative) {
				// if (!(node.right instanceof ASTnode_identifier)) {
				// 	TODO();
				// }
				
				let dependencies = getDependencies(node);
				dependencies = dependencies.filter(dependency => 
					!dependencyStack.includes(dependency)
				);
				dependencies = getUniqueInArray(dependencies);
				
				// dependencies.forEach((dependency) => {
				// 	if (dependencyStack.includes(dependency)) {
				// 		const breakoutLoopBodyList = [...dependencyStack];
						
				// 		dependencyStack.push(node);
				// 		const breakoutId = nextBreakoutLoopId;
				// 		nextBreakoutLoopId++;
				// 		breakoutLoopMap.set(breakoutId, dependencyStack);
				// 		const breakoutLoopBody = buildList(breakoutLoopBodyList, Mode.declarative);
				// 		breakoutLoopMap.delete(breakoutId);
				// 		dependencyStack.pop();
						
				// 		debugger;
				// 		upContext.breakout = [
				// 			js.alias(`breakoutId_${breakoutId}`, js.bool(true)),
				// 			js.while(js.use(`breakoutId_${breakoutId}`), [
				// 				js.binaryOperator(BinaryOperator.setVar, js.use(`breakoutId_${breakoutId}`), js.bool(false)),
				// 				...breakoutLoopBody,
				// 			])
				// 		];
						
				// 		return;
				// 	}
					
				// 	dependencyStack.push(dependency);
				// 	const text = build(dependency, upContext, request, Mode.declarative);
				// 	dependencyStack.pop();
					
				// 	if (settings.opt > OptLevel.none && upContext.post.includes(text)) {
				// 		return;
				// 	}
				// 	upContext.post.push(text + " // dependency");
				// });
				
				if (dependencies.length == 1 && settings.opt > OptLevel.none) {
					debugger;
					dependencyStack.push(dependencies[0]);
					const dependencyText = build(dependencies[0], upContext, request, Mode.declarative);
					dependencyStack.pop();
					
					upContext.post.push(
						dependencyText
					);
				} else if (dependencies.length > 0) {
					debugger;
					
					const breakoutId = nextBreakoutLoopId;
					nextBreakoutLoopId++;
					
					dependencyStack.push(...dependencies);
					const breakoutLoopBody = buildList(dependencies, Mode.declarative);
					dependencies.forEach(() => dependencyStack.pop());
					
					upContext.post.push(
						js.alias(`breakoutId_${breakoutId}`, js.bool(true)),
						js.while(js.use(`breakoutId_${breakoutId}`), [
							js.binaryOperator(BinaryOperator.setVar, js.use(`breakoutId_${breakoutId}`), js.bool(false)),
							...breakoutLoopBody,
						])
					);
				}
				
				// return "/**/";
			}
			
			let op: BinaryOperator;
			
			if (node.operatorText == "=") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.shallowEquals;
				} else {
					op = BinaryOperator.setVar;
				}
				
				const left = build(node.left, upContext, request, Mode.declarative);
				const right = build(node.right, upContext, request, Mode.interrogative);
				return js.binaryOperator(op, left, right);
			}
			
			const left = build(node.left, upContext, request, mode);
			const right = build(node.right, upContext, request, mode);
			
			if (node.operatorText == inSetOperator) {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.inSet;
				} else {
					op = BinaryOperator.addToSet;
				}
			}
			else if (node.operatorText == notInSetOperator) {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.notInSet;
				} else {
					// const left = build(node.left, post, request);
					// const right = build(node.right, post, request);
					// js.binaryOperator(BinaryOperator.inSet, left, right)
					
					// const oldMode = mode;
					// mode = Mode.interrogative;
					// const condition = build(new ASTnode_operator(
					// 	"builtin",
					// 	inSetOperator,
					// 	node.left,
					// 	node.right,
					// ), post, request);
					// mode = oldMode;
					// return js.assert(condition, "BAD");
					
					op = BinaryOperator.removeFromSet;
				}
			}
			
			else if (node.operatorText == "+") {
				op = BinaryOperator.add;
			}
			else if (node.operatorText == "-") {
				op = BinaryOperator.add;
			}
			
			else if (node.operatorText == "&") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.and;
				} else {
					const left = build(node.left, upContext, request, mode);
					const right = build(node.right, upContext, request, mode);
					return js.multipleStatements([left, right]);
				}
			}
			
			else if (node.operatorText == "<") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.lessThan;
				} else {
					return js.makeMin(left, right);
				}
			}
			
			else if (node.operatorText == ">") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.greaterThan;
				} else {
					return js.makeMax(left, right);
				}
			}
			
			else {
				TODO(node.operatorText);
			}
			
			if (mode == Mode.declarative) {
				// Print what is now true if it was not true a moment ago
				if (settings.logging) {
					const interrogativeThis = build(node, upContext, null, Mode.interrogative);
					upContext.pre.push(
						js.if(js.unaryOperator(UnaryOperator.not, interrogativeThis), [js.log(node.print())])
					);
				}
			
				const breakoutId = getBreakoutLoopOutId(node);
				if (breakoutId != null) {
					const interrogativeThis = build(node, upContext, null, Mode.interrogative);
					
					upContext.pre.push(
						js.if(js.unaryOperator(UnaryOperator.not, interrogativeThis), [
							js.binaryOperator(BinaryOperator.setVar, js.use(`breakoutId_${breakoutId}`), js.bool(true))
						])
					);
				}
			}
			
			return js.binaryOperator(op, left, right);
		}
		
		else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const right = build(node.value, new UpContext(), request, Mode.interrogative);
			
			return js.alias(node.left.name, right);
		}
		// else if (node instanceof ASTnode_field) {
		// 	const right = build(node.type, [], request);
		// 	return `let ${node.name} = ${right};`;
		// }
		
		else if (node instanceof ASTnode_codeBlock) {
			const body = buildList(node.body, Mode.declarative);
			return js.codeBlock(body);
		}
		
		else if (node instanceof ASTnode_event) {
			if (mode == Mode.interrogative) {
				return `TODO`;
			} else {
				if (node.name == "__rawEval__") {
					if (settings.allowArbitraryCodeExecution) {
						const stringNode = node.args[0];
						if (!(stringNode instanceof ASTnode_string)) {
							TODO_addError();
						}
						return stringNode.value;
					} else {
						return "nope allowArbitraryCodeExecution";
					}
				} else if (node.name == "_log") {
					return js.logList(buildList(node.args, Mode.interrogative));
				}
				const args = buildList(node.args, Mode.interrogative);
				return js.call(node.name, args);
			}
		}
		
		else {
			TODO(getClassName(node));
		}
	}
	
	// TODO: request: BuildRequest
	function buildList(AST: ASTnode[], mode: Mode): string[] {
		const list: string[] = [];
		
		scopes.push(AST);
		
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			
			const upContext = new UpContext();
			
			if (node instanceof ASTnode_operator && node.operatorText == "->") {
				if (node.left instanceof ASTnode_event) {
					const argNames: string[] = node.left.args.map((arg) => {
						if (arg instanceof ASTnode_identifier) {
							return arg.name;
						} else if (arg instanceof ASTnode_field) {
							return arg.name;
						} else {
							unreachable();
						}
					});
					
					const right = build(node.right, upContext, null, Mode.declarative);
					
					list.push(js.func(node.left.name, argNames, [right]));
					continue;
				}
			}
			
			const text = build(node, upContext, null, mode);
			
			list.push(...upContext.pre, text, ...upContext.post);
		}
		
		scopes.pop();
		
		return list;
	}
	
	let topText = "";
	
	const builtinText = buildList(builtinAST, Mode.declarative);
	const mainText = buildList(topAST, Mode.declarative);
	
	if (settings.addDebugger) topText += "debugger;\n";
	topText += builtinText.join("\n") + "\n";
	topText += mainText.join("\n");
	if (settings.addDebugger) topText += "\ndebugger;";
	
	return js.file(topText);
}

function indent(text: string): string {
	return text.replaceAll("\n", "\n\t");
}
function joinBody(body: string[]): string {
	if (body.length == 0) return "";
	return indent("\n" + body.join("\n"));
}