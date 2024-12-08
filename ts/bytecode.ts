import { ASTnode, ASTnode_alias, ASTnode_function, ASTnode_identifier, ASTnode_number, ASTnode_operator } from "./ASTnodes.js";
import { getClassName, TODO, unreachable } from "./utilities.js";

export enum BytecodeOp {
	nop = 0x00,
	
	func_new,
	func_call,
	
	local_get,
	local_set,
	
	type_new,
	
	// i32_add,
	// i32_sub,
	// i32_mul,
	// i32_div,
	
	f32_new,
	f32_add,
	f32_sub,
	f32_mul,
	f32_div,
}

export function bytecode_makeTextFormat(topAST: ASTnode[]): string {
	function joinBody(body: string[]): string {
		return ("\n" + body.join("\n")).replaceAll("\n", "\n\t") + "\n";
	}
	
	function print(node: ASTnode): string {
		console.log(getClassName(node), node.print());
		
		if (node instanceof ASTnode_number) {
			return `(f32_new ${node.value})`;
		} else if (node instanceof ASTnode_function) {
			const body = joinBody(printAST(node.body));
			return `(func ((arg "${node.arg.name}" ${print(node.arg.type)})) (${body}))`;
		} else if (node instanceof ASTnode_operator) {
			const left = print(node.left);
			const right = print(node.right);
			return `${left}\n${right}\n(f32_add)`;
		} else if (node instanceof ASTnode_identifier) {
			return `(local_get "${node.name}")`;
		} else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const name = node.left.name;
			const value = print(node.value);
			return `${value}\n(alias_new "${name}")`;
		} else {
			return `(TODO "${getClassName(node)}")`;
		}
	}
	
	function printAST(AST: ASTnode[]): string[] {
		const list: string[] = [];
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			const text = print(node);
			list.push(text);
		}
		return list;
	}
	
	return printAST(topAST).join("\n");
}

export function bytecode_compileTextFormat(text: string): Uint8Array {
	const bytecode: number[] = [];
	function addBytes(bytes: number[]) {
		bytecode.push(...bytes);
	}
	
	let index = 0;
	
	function readThing(): string {
		index++;
		
		let op = "";
		while (index < text.length && text[index] != " " && text[index] != ")") {
			op += text[index];
			index++;
		}
		return op
	}
	
	function parse() {
		while (index < text.length) {
			if (text[index] == "(") {
				const op = readThing();
				const opCode = BytecodeOp[op as any] as any as number;
				
				console.log("op", op, opCode);
				
				if (op == "f32_new") {
					const number = Number(readThing());
					console.log(number);
					addBytes([opCode, number]); // TODO: Number can be larger than one byte.
				} else if (op == "f32_add") {
					addBytes([opCode]);
				} else {
					unreachable();
				}
			}
			index++;
		}
	}
	
	parse();
	
	return new Uint8Array(bytecode);
}

export function bytecode_debug(byteCode: Uint8Array, top: number = Infinity): string {
	let text = "";
	
	for (let i = 0; i < Math.min(byteCode.length, top); i++) {
		const byte = byteCode[i];
		text += `   0x${byte.toString(16)}\n`;
	}
	
	return text;
}

export class Environment {
	stackTop = 0;
	stack: Uint8Array;
	
	constructor(
		maxStackSize: number
	) {
		this.stack = new Uint8Array(maxStackSize);
	}
	
	run(program: Uint8Array) {
		const self = this;
		
		function pushByte(byte: number) {
			self.stack[self.stackTop] = byte;
			self.stackTop += 1;
		}
		function popByte() {
			const byte = self.stack[self.stackTop - 1];
			self.stackTop -= 1;
			return byte;
		}
		
		let pc = 0;
		while (pc < program.length) {
			const opCode = program[pc];
			switch (opCode) {
				case BytecodeOp.f32_new: {
					pc++
					const number = program[pc];
					console.log("number", number);
					pushByte(number);
					
					break;
				}
				
				case BytecodeOp.f32_add: {
					debugger;
					const left = popByte();
					const right = popByte();
					
					pushByte(left + right);
					break;
				}
				
				default:
					unreachable();
			}
			pc++;
		}
	}
}