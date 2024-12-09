// If I want my bytecode to be the thing that runs type of functions, it needs to be functional and pretty high-level.

// The text format exists largely because I don't want to cashe binary data. (That sounds hard to debug.)

import { ASTnode, ASTnode_alias, ASTnode_function, ASTnode_identifier, ASTnode_number, ASTnode_object, ASTnode_operator } from "./ASTnodes.js";
import { getClassName, TODO, TODO_addError, unreachable } from "./utilities.js";

// In () means arguments to the instruction
// In [] means on the stack. (top is on the left)
export enum Instruction {
	nop = 0x00,
	
	func_new, // () [argType] -> [func]
	func_call,
	
	local_get,
	local_set,
	
	type_new,
	
	table_new,
	table_set, // (size: u8 name: char[size]) [value, table] -> [table]
	table_get,
	
	// i32_add,
	// i32_sub,
	// i32_mul,
	// i32_div,
	
	// same as JavaScript "number"
	f32_new, // (value: f32) []
	f32_add, // () [right: f32, left: f32]
	f32_sub, // () [right: f32, left: f32]
	f32_mul, // () [right: f32, left: f32]
	f32_div, // () [right: f32, left: f32]
}

export function bytecode_makeTextFormat(topAST: ASTnode[]): string {
	function joinBody(body: string[]): string {
		return ("\n" + body.join("\n")).replaceAll("\n", "\n\t");
	}
	
	function print(node: ASTnode): string {
		console.log(getClassName(node), node.print());
		
		if (node instanceof ASTnode_number) {
			return `(f32_new ${node.value})`;
		} else if (node instanceof ASTnode_object) {
			let post: string[] = [];
			// for (let i = 0; i < node.members.length; i++) {
			// 	const member = node.members[i];
			// 	if (member.) {
					
			// 	}
			// }
			const members = joinBody(printAST(node.members));
			return `(table_new)${members}`;
		} else if (node instanceof ASTnode_function) {
			const body = joinBody(printAST(node.body));
			// return `(func ((arg "${node.arg.name}" ${print(node.arg.type)})) (${body}))`;
			// return `(func ("${node.arg.name}" ${print(node.arg.type)}) (${body} + "\n"))`;
			return `${print(node.arg.type)}\n(func (${body + "\n"}))`;
		} else if (node instanceof ASTnode_operator) {
			const left = print(node.left);
			const right = print(node.right);
			return `${left}\n${right}\n(f32_add)`;
		} else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const name = node.left.name;
			const value = print(node.value);
			return `${value}\n(table_set "${name}")`;
		} else if (node instanceof ASTnode_identifier) {
			return `(local_get "${node.name}")`;
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
	
	return "(table_new)\n" + printAST(topAST).join("\n");
}

export function bytecode_compileTextFormat(text: string): Uint8Array {
	const extraGrowSize = 256;
	
	let program = new Uint8Array(extraGrowSize);
	let programSize = 0;
	
	function growTo(n: number) {
		if (programSize > program.length) {
			const newProgram = new Uint8Array(n + extraGrowSize);
			newProgram.set(program);
			program = newProgram;
		}
	}
	
	function addBytes(bytes: number[]) {
		growTo(program.length + bytes.length);
		program.set(bytes, programSize);
		programSize += bytes.length;
	}
	
	function addString(text: string) {
		growTo(program.length + text.length);
		program.set(Buffer.from(text), programSize);
		programSize += text.length;
	}
	
	let index = 0;
	
	function readThing(): string {
		index++;
		
		let isString = false;
		
		let op = "";
		while (index < text.length) {
			if (!isString) {
				if (text[index] == " " || text[index] == ")") {
					break;
				}
			}
			
			if (text[index] == '"') {
				isString = !isString;
			} else {
				op += text[index];
			}
			
			index++;
		}
		
		return op
	}
	
	function parse() {
		while (index < text.length) {
			if (text[index] == "(") {
				const op = readThing();
				const instruction = Instruction[op as any] as any as number;
				
				console.log("op", op, instruction);
				
				if (op == "table_new") {
					addBytes([instruction]);
				}
				
				else if (op == "table_set") {
					const name = readThing();
					
					debugger;
					addBytes([instruction, name.length]);
					addString(name);
				}
				
				else if (op == "f32_new") {
					const number = Number(readThing());
					addBytes([instruction, number]); // TODO: Number can be larger than one byte.
				}
				
				else if (op == "f32_add") {
					addBytes([instruction]);
				}
				
				else {
					unreachable();
				}
			}
			index++;
		}
	}
	
	parse();
	
	{
		debugger;
		const output = new Uint8Array(programSize);
		output.set(program.subarray(0, programSize));
		return output;
	}
}

export function bytecode_debug(byteCode: Uint8Array, top: number = Infinity): string {
	let text = "";
	
	for (let i = 0; i < Math.min(byteCode.length, top); i++) {
		const byte = byteCode[i];
		text += `   0x${byte.toString(16).padStart(2, "0")}    ${`(${Instruction[byte]})`.padEnd(12)} '${String.fromCharCode(byte)}'\n`;
	}
	
	return text;
}

export class Environment {
	stackTop = 0;
	stack: Uint8Array;
	heap: Uint8Array;
	
	constructor(
		stackSize: number,
		heapSize: number,
	) {
		this.stack = new Uint8Array(stackSize);
		this.stack.buffer
		this.heap = new Uint8Array(heapSize);
	}
	
	debug(): string {
		let text = "";
		
		for (let i = this.stackTop - 1; i >= 0; i--) {
			const byte = this.stack[i];
			text += `${i}   0x${byte.toString(16)}\n`;
		}
		
		return text;
	}
	
	error() {
		TODO_addError();
	}
	
	pushByte(byte: number) {
		this.stack[this.stackTop] = byte;
		this.stackTop += 1;
	}
	popByte() {
		const byte = this.stack[this.stackTop - 1];
		this.stackTop -= 1;
		return byte;
	}
	
	// TODO: not one byte
	push_f32(number: number) {
		this.pushByte(number);
		this.pushByte(Instruction.f32_new);
	}
	// TODO: not one byte
	pop_f32(): number {
		const op = this.popByte();
		if (op != Instruction.f32_new) this.error();
		const number = this.popByte();
		return number;
	}
	
	/**
	 * Returns the table ID
	 */
	// makeTable(): number {
		
	// }
	
	run(program: Uint8Array) {
		let pc = 0;
		while (pc < program.length) {
			const instruction = program[pc];
			switch (instruction) {
				case Instruction.table_new: {
					break;
				}
				case Instruction.table_set: {
					break;
				}
				
				case Instruction.f32_new: {
					pc++
					const number = program[pc];
					this.push_f32(number);
					
					break;
				}
				case Instruction.f32_add: {
					const right = this.pop_f32();
					const left = this.pop_f32();
					
					this.push_f32(left + right);
					break;
				}
				
				default:
					console.error(instruction, Instruction[instruction]);
					unreachable();
			}
			pc++;
		}
	}
}