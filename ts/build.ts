import { ASTnode, ASTnode_alias, ASTnode_bool, ASTnode_event, ASTnode_field, ASTnode_identifier, ASTnode_number, ASTnode_operator, ASTnode_string } from "./ASTnodes.js";
import { getClassName, TODO, TODO_addError, unreachable } from "./utilities.js";

export class BuilderSettings {
	allowArbitraryCodeExecution = false;
}

class AliasData {
	useCount = 0;
}

enum Mode {
	interrogative,
	declarative,
}

enum BinaryOperator {
	add,
	subtract,
	multiply,
	divide,
	
	inSet,
	addToSet,
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
			return `${left}.has(${right})`;
		}
		
		if (op == BinaryOperator.addToSet) {
			return `${left}.add(${right})`;
		}
		
		TODO();
	}
	
	if(condition: string, body: string): string {
		return `if (${condition}) {${body}}`;
	}
};
const js = new Js();

export function buildAST(inputAST: ASTnode[], settings: BuilderSettings): string {
	let mode = Mode.declarative;
	
	const topAliases = new Map<number, AliasData>();
	
	let alwaysFunction: string[] = [];
	
	function build(node: ASTnode): string {
		if (node instanceof ASTnode_bool) {
			return js.bool(node.value);
		}
		
		else if (node instanceof ASTnode_number) {
			return js.number(node.value);
		}
		
		else if (node instanceof ASTnode_string) {
			return js.string(node.value);
		}
		
		else if (node instanceof ASTnode_identifier) {
			return js.identifier(node.name);
		}
		
		else if (node instanceof ASTnode_operator) {
			if (node.operatorText == "->") {
				const left = build(node.left);
				const right = build(node.right);
				return js.if(left, right);
			}
			
			let op: BinaryOperator;
			if (node.operatorText == "in") {
				if (mode == Mode.interrogative) {
					op = BinaryOperator.inSet;
				} else {
					op = BinaryOperator.addToSet;
				}
			} else {
				TODO(node.operatorText);
			}
			
			const left = build(node.left);
			const right = build(node.right);
			return js.binaryOperator(op, left, right);
		}
		
		else {
			TODO(getClassName(node));
		}
	}
	
	function buildList(AST: ASTnode[], top?: boolean): string[] {
		const list: string[] = [];
		
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			
			if (node instanceof ASTnode_alias) {
				if (top != true) TODO();
				if (!(node.left instanceof ASTnode_identifier)) {
					TODO();
				}
				continue;
			}
			
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
					
					const oldMode = mode;
					mode = Mode.declarative;
					const right = build(node.right);
					mode = oldMode;
					
					list.push(js.func(node.left.name, argNames, right));
					continue;
				}
			}
			
			const text = build(node);
			
			if (top == true) {
				alwaysFunction.push(text);
			} else {
				list.push(text);
			}
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
	
	const mainText = buildList(inputAST, true);
	topText += js.func("always", [], joinBody(alwaysFunction));
	topText += mainText.join("\n");
	
	return topText;
}