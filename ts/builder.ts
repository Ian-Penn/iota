import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_codeBlock,
	ASTnode_event,
	ASTnode_field,
	ASTnode_identifier,
	ASTnode_number,
	ASTnode_operator,
	ASTnode_set,
	ASTnode_string
} from "./ASTnodes.js";
import { inSetOperator, notInSetOperator } from "./lexer.js";
import { getClassName, Hash, TODO, TODO_addError, unreachable } from "./utilities.js";

enum OptLevel {
	none,
	basic,
}

export class BuilderSettings {
	allowArbitraryCodeExecution = false;
	
	opt = OptLevel.basic;
	logging = true;
}

class AliasData {
	useCount = 0;
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
	allowArbitraryCodeExecution = false;
	
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
	
	identifier(name: string): string {
		return name;
	}
	
	func(name: string, argNames: string[], body: string): string {
		return `function ${name}(${argNames.join(", ")}) {${body}\n}`;
	}
	
	unaryOperator(op: UnaryOperator, input: string): string {
		if (op == UnaryOperator.not) {
			return `!${input}`;
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
	
	doubleStatement(left: string, right: string) {
		return `${left}; ${right}`;
	}
	
	if(condition: string, body: string[]): string {
		if (body.length == 1) {
			return `if (${condition}) ${body[0]}`;
		} else {
			return `if (${condition}) {${joinBody(body)}\n}`;
		}
	}
	
	codeBlock(body: string[]): string {
		return `{${joinBody(body)}\n}`;
	}
	
	assert(condition: string, message: string) {
		return `if (${condition}) throw ${this.string(message)}`;
	}
	
	log(message: string) {
		return `console.log(${this.string(message)})`;
	}
	
	min(a: string, b: string): string {
		return `${a} = Math.min(${a}, ${b}) - 1`;
	}
	
	max(a: string, b: string): string {
		return `${a} = Math.max(${a}, ${b}) + 1`;
	}
};
const js = new Js();

type BuildRequest = {
	type: "hasInterrogativeUseOfHash",
	hash: Hash,
	output: boolean,
};

export function buildAST(topAST: ASTnode[], settings: BuilderSettings): string {
	let mode = Mode.declarative;
	
	const topAliases = new Map<number, AliasData>();
	
	// function getUses(name: string): ASTnode[] {
	// 	const output: ASTnode[] = [];
		
	// 	for (let i = 0; i < topAST.length; i++) {
	// 		const topNode = topAST[i];
			
	// 		let used = false;
			
	// 		if (topNode instanceof ASTnode_operator) {
	// 			topNode.analyze((node) => {
	// 				if (node instanceof ASTnode_identifier) {
	// 					if (node.name == name) {
	// 						used = true;
	// 					}
	// 				}
	// 			});
	// 		}
			
	// 		if (used) {
	// 			output.push(topNode);
	// 		}
	// 	}
		
	// 	return output;
	// }
	
	const scopes: ASTnode[][] = [];
	
	/**
	 * Get operators that need to be reevaluated when `name` changes
	 * TODO: This algorithm is surprisingly effective, but I think it fails with operator anagrams.
	 */
	function getDependencies(operator: ASTnode_operator): ASTnode[] {
		console.log("getDependencies", operator.print());
		
		const output: ASTnode[] = [];
		
		const operatorHash = operator.getHash();
		
		for (let scopeI = 0; scopeI < scopes.length; scopeI++) {
			const scope = scopes[scopeI];
			for (let i = 0; i < scope.length; i++) {
				const node = scope[i];
				
				// if (operatorHash.equals(topNode.getHash())) {
				// 	output.push(topNode);
				// }
				
				if (!(node instanceof ASTnode_operator)) {
					continue;
				}
				
				const request: BuildRequest = {
					type: "hasInterrogativeUseOfHash",
					hash: operatorHash,
					output: false,
				}
				build(node, [], request);
				if (request.output) {
					output.push(node);
				}
				
				// if (topNode instanceof ASTnode_operator) {
				// 	topNode.analyze((node) => {
				// 		if (operatorHash.equals(node.getHash())) {
				// 			output.push(topNode);
				// 			return true;
				// 		}
				// 		return false;
				// 	});
				// }
			}
		}
		
		return output;
	}
	
	function build(node: ASTnode, post: string[], request: BuildRequest | null): string {
		if (request && request.type == "hasInterrogativeUseOfHash") {
			if (mode == Mode.interrogative && request.hash.equals(node.getHash())) {
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
			return js.identifier(node.name);
		}
		
		else if (node instanceof ASTnode_operator) {
			if (node.operatorText == "->") {
				const oldMode = mode;
				mode = Mode.interrogative;
				const left = build(node.left, post, request);
				mode = oldMode;
				const right = build(node.right, post, request);
				
				const body = [
					right
				];
				
				if (settings.logging) {
					const oldMode = mode;
					mode = Mode.interrogative;
					const interrogativeRight = build(node.right, post, null);
					mode = oldMode;
					
					// Print what is now true if it was not true a moment ago
					body.unshift(
						js.if(js.unaryOperator(UnaryOperator.not, interrogativeRight), [js.log(node.right.print())])
					);
				}
				
				return js.if(left, body);
			}
			
			// When something is changed all of the dependencies need to be reevaluated.
			if (
				node.operatorText == inSetOperator ||
				node.operatorText == notInSetOperator
			) {
				if (request == null && mode == Mode.declarative) {
					if (!(node.right instanceof ASTnode_identifier)) {
						TODO();
					}
					
					const dependencies = getDependencies(node);
					dependencies.forEach((dependency) => {
						// console.log("use:", use.print());
						// const oldMode = mode;
						// mode = Mode.declarative;
						const text = build(dependency, post, request);
						// mode = oldMode;
						if (settings.opt > OptLevel.none && post.includes(text)) {
							return;
						}
						post.push(text + " // dependency");
					});
				}
			}
			
			const left = build(node.left, post, request);
			const right = build(node.right, post, request);
			
			let op: BinaryOperator;
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
					const left = build(node.left, post, request);
					const right = build(node.right, post, request);
					return js.doubleStatement(left, right);
				}
			}
			
			else if (node.operatorText == "=") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.shallowEquals;
				} else {
					op = BinaryOperator.setVar;
				}
			}
			
			else if (node.operatorText == "<") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.lessThan;
				} else {
					return js.min(left, right);
				}
			}
			
			else if (node.operatorText == ">") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.greaterThan;
				} else {
					return js.max(left, right);
				}
			}
			
			else {
				TODO(node.operatorText);
			}
			
			return js.binaryOperator(op, left, right);
		}
		
		else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const right = build(node.value, [], request);
			return `let ${node.left.name} = ${right};`;
		}
		// else if (node instanceof ASTnode_field) {
		// 	const right = build(node.type, [], request);
		// 	return `let ${node.name} = ${right};`;
		// }
		
		else if (node instanceof ASTnode_codeBlock) {
			const body = buildList(node.body);
			return js.codeBlock(body);
		}
		
		else {
			TODO(getClassName(node));
		}
	}
	
	function buildList(AST: ASTnode[], top?: boolean): string[] {
		const list: string[] = [];
		
		scopes.push(AST);
		
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			
			const post: string[] = [];
			
			if (node instanceof ASTnode_operator && node.operatorText == "->") {
				if (node.left instanceof ASTnode_event) {
					if (top != true) TODO_addError();
					
					const argNames: string[] = node.left.args.map((arg) => {
						if (arg instanceof ASTnode_identifier) {
							return arg.name;
						} else if (arg instanceof ASTnode_field) {
							return arg.name;
						} else {
							unreachable();
						}
					});
					
					const right = build(node.right, post, null);
					
					list.push(js.func(node.left.name, argNames, right));
					continue;
				}
			}
			
			const text = build(node, post, null);
			
			list.push(text);
			list.push(...post);
		}
		
		scopes.pop();
		
		return list;
	}
	
	let topText = "";
	
	const mainText = buildList(topAST, true);
	topText += "debugger;\n";
	topText += mainText.join("\n");
	topText += "\ndebugger;";
	
	return topText;
}

function indent(text: string): string {
	return text.replaceAll("\n", "\n\t");
}
function joinBody(body: string[]): string {
	if (body.length == 0) return "";
	return indent("\n" + body.join("\n"));
}