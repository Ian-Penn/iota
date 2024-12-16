import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_event,
	ASTnode_field,
	ASTnode_identifier,
	ASTnode_number,
	ASTnode_operator,
	ASTnode_set,
	ASTnode_string
} from "./ASTnodes.js";
import { getClassName, Hash, TODO, TODO_addError, unreachable } from "./utilities.js";

enum OptLevel {
	none,
	basic,
}

export class BuilderSettings {
	allowArbitraryCodeExecution = false;
	
	opt = OptLevel.basic;
}

class AliasData {
	useCount = 0;
}

enum Mode {
	interrogative,
	declarative,
}

enum BinaryOperator {
	inSet,
	addToSet,
	
	and,
	or,
	
	add,
	subtract,
	multiply,
	divide,
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
	
	binaryOperator(op: BinaryOperator, left: string, right: string): string {
		if (op == BinaryOperator.inSet) {
			return `${right}.has(${left})`;
		}
		
		if (op == BinaryOperator.addToSet) {
			return `${right}.add(${left})`;
		}
		
		if (op == BinaryOperator.and) {
			return `${left} && ${right}`;
		}
		
		if (op == BinaryOperator.or) {
			return `${left} || ${right}`;
		}
		
		TODO();
	}
	
	doubleStatement(left: string, right: string) {
		return `${left}; ${right}`;
	}
	
	if(condition: string, body: string): string {
		return `if (${condition}) {${body}}`;
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
	
	let alwaysFunction: string[] = [];
	
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
	
	/**
	 * Get operators that need to be reevaluated when `name` changes
	 */
	function getDependencies(operator: ASTnode_operator): ASTnode[] {
		const output: ASTnode[] = [];
		
		const operatorHash = operator.getHash();
		
		for (let i = 0; i < topAST.length; i++) {
			const topNode = topAST[i];
			
			// if (operatorHash.equals(topNode.getHash())) {
			// 	output.push(topNode);
			// }
			
			// if (topNode instanceof ASTnode_alias) {
			// 	continue; // TODO: ?
			// }
			
			const request: BuildRequest = {
				type: "hasInterrogativeUseOfHash",
				hash: operatorHash,
				output: false,
			}
			build(topNode, [], request);
			if (request.output) {
				output.push(topNode);
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
				return js.if(left, right);
			}
			
			let op: BinaryOperator;
			if (node.operatorText == "in") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.inSet;
				} else {
					if (request == null) {
						if (!(node.right instanceof ASTnode_identifier)) {
							TODO();
						}
						
						const uses = getDependencies(node);
						console.log(uses, post);
						uses.forEach((use) => {
							console.log("use:", use.print());
							// const oldMode = mode;
							// mode = Mode.declarative;
							const text = build(use, post, request);
							// mode = oldMode;
							if (settings.opt > OptLevel.none && post.includes(text)) {
								return;
							}
							post.push(text);
						});
					}
					op = BinaryOperator.addToSet;
				}
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
			
			else {
				TODO(node.operatorText);
			}
			
			const left = build(node.left, post, request);
			const right = build(node.right, post, request);
			return js.binaryOperator(op, left, right);
		}
		
		else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const right = build(node.value, [], request);
			return `let ${node.left.name} = ${right};`;
		}
		
		else {
			TODO(getClassName(node));
		}
	}
	
	function buildList(AST: ASTnode[], top?: boolean): string[] {
		const list: string[] = [];
		
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
			
			// if (top == true) {
			// 	alwaysFunction.push(text);
			// } else {
			// 	list.push(text);
			// }
			list.push(text);
			
			list.push(...post);
		}
		
		return list;
	}
	
	function indent(text: string): string {
		return text.replaceAll("\n", "\n\t");
	}
	function joinBody(body: string[]): string {
		if (body.length == 0) return "";
		return indent("\n" + body.join("\n"));
	}
	
	let topText = "";
	
	const mainText = buildList(topAST, true);
	// topText += js.func("always", [], joinBody(alwaysFunction));
	topText += mainText.join("\n");
	topText += "\ndebugger;";
	
	return topText;
}