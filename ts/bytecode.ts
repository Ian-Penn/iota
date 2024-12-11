// If I want my bytecode to be the thing that runs type of functions, it needs to be functional and pretty high-level.

// The text format exists largely because I don't want to cashe binary data. (That sounds hard to debug.)

import { ASTnode, ASTnode_alias, ASTnode_function, ASTnode_identifier, ASTnode_number, ASTnode_object, ASTnode_operator } from "./ASTnodes.js";
import { getClassName, TODO, unreachable } from "./utilities.js";

// In () means arguments to the instruction
// In [] means on the stack. (top is on the left)
// export enum Instruction {
// 	nop = 0x00,
	
// 	func_new, // () [argType] -> [func]
// 	func_call,
	
// 	local_get,
// 	local_set,
	
// 	type_new,
	
// 	table_new,
// 	table_set, // (size: u8 name: char[size]) [value, table] -> [table]
// 	table_get,
	
// 	// i32_add,
// 	// i32_sub,
// 	// i32_mul,
// 	// i32_div,
	
// 	// same as JavaScript "number"
// 	f32_new, // (value: f32) []
// 	f32_add, // () [right: f32, left: f32]
// 	f32_sub, // () [right: f32, left: f32]
// 	f32_mul, // () [right: f32, left: f32]
// 	f32_div, // () [right: f32, left: f32]
// }

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
			// return `${print(node.arg.type)}\n(func (${body + "\n"}))`;
			return `${print(node.arg.type)}\n(func_start)${body}\n\t(func_end)`;
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

// export function bytecode_compileTextFormat(text: string): DataView {
// 	const extraGrowSize = 256;
	
// 	let program = new DataView(new ArrayBuffer(extraGrowSize));
// 	let programSize = 0;
	
// 	function growTo(n: number) {
// 		if (n > program.byteLength) {
// 			const newBuffer = new ArrayBuffer(n + extraGrowSize);
// 			const newProgram = new Uint8Array(n + extraGrowSize);
// 			newProgram.set(program);
// 			program = newProgram;
// 		}
// 	}
	
// 	function addRawByte(bytes: number) {
// 		growTo(programSize + 1);
// 		program.setUint8(bytes, programSize);
// 		programSize += 1;
// 	}
// 	function addRawBytes(bytes: number[]) {
// 		growTo(programSize + bytes.length);
// 		bytes.forEach(byte => {
// 			program.setUint8(byte, programSize);
// 			programSize += 1;
// 		});
// 	}
	
// 	function addf32(number: number) {
// 		const byteSize = 4;
// 		growTo(programSize + byteSize);
// 		program.setUint8(programSize, number);
// 		programSize += byteSize;
// 	}
	
// 	function addString(text: string) {
// 		const programView = program.buffer.
// 		const encoder = new TextEncoder();
// 		growTo(programSize + buffer.byteLength);
// 		buffer.forEach(byte => {
// 			program.setUint8(byte, programSize);
// 			programSize += 1;
// 		});
// 	}
	
// 	let index = 0;
	
// 	function readThing(): string {
// 		index++;
		
// 		let isString = false;
		
// 		let op = "";
// 		while (index < text.length) {
// 			if (!isString) {
// 				if (text[index] == " " || text[index] == ")") {
// 					break;
// 				}
// 			}
			
// 			if (text[index] == '"') {
// 				isString = !isString;
// 			} else {
// 				op += text[index];
// 			}
			
// 			index++;
// 		}
		
// 		return op
// 	}
	
// 	function parse() {
// 		while (index < text.length) {
// 			if (text[index] == "(") {
// 				const op = readThing();
// 				const instruction = Instruction[op as any] as any as number;
				
// 				console.log("op", op, instruction);
				
// 				if (op == "table_new") {
// 					addRawBytes([instruction]);
// 				}
				
// 				else if (op == "table_set") {
// 					const name = readThing();
					
// 					addRawBytes([instruction, name.length]);
// 					addString(name);
// 				}
				
// 				else if (op == "f32_new") {
// 					const number = Number(readThing());
// 					addRawBytes([instruction, number]); // TODO: Number can be larger than one byte.
// 				}
				
// 				else if (op == "f32_add") {
// 					addRawBytes([instruction]);
// 				}
				
// 				else {
// 					unreachable();
// 				}
// 			}
// 			index++;
// 		}
// 	}
	
// 	parse();
	
// 	{
// 		const output = new Uint8Array(programSize);
// 		output.set(program.subarray(0, programSize));
// 		return output;
// 	}
// }

// function printByte(byte: number): string {
// 	const hex = byte.toString(16).padStart(2, "0");
// 	const instruction = `(${Instruction[byte]})`.padEnd(12);
// 	const char = String.fromCharCode(byte)
// 		.replace("\n", "\\n")
// 		.replace("\t", "\\t");
// 	return `0x${hex}    ${instruction} '${char}'`;
// }

// export function bytecode_debug(byteCode: Uint8Array, top: number = Infinity): string {
// 	let text = "";
	
// 	for (let i = 0; i < Math.min(byteCode.length, top); i++) {
// 		const byte = byteCode[i];
// 		text += `    ${printByte(byte)}\n`;
// 	}
	
// 	return text;
// }

// export type RuntimeHeapPointer = number;
// export class Runtime {
// 	stackTop = 0;
// 	stack: DataView;
// 	heap: DataView;
	
// 	constructor(
// 		stackSize: number,
// 		heapSize: number,
// 	) {
// 		this.stack = new DataView(new ArrayBuffer(stackSize));
// 		this.heap = new DataView(new ArrayBuffer(heapSize));
// 	}
	
// 	debug(): string {
// 		let text = "";
		
// 		for (let i = this.stackTop - 1; i >= 0; i--) {
// 			const byte = this.stack.getUint8(i);
// 			text += `${`${i}`.padEnd(2, " ")}  ${printByte(byte)}\n`;
// 		}
		
// 		return text;
// 	}
	
// 	error(...data: any[]): never {
// 		console.error("run time error:", ...data);
// 		debugger;
// 		throw "runTimeError";
// 	}
	
// 	// malloc(size: number): RuntimeHeapPointer {
		
// 	// }
	
// 	// free(ptr: RuntimeHeapPointer) {
		
// 	// }
	
// 	// makeTable(): RuntimeHeapPointer {
		
// 	// }
	
// 	popCount(count: number) {
// 		this.stackTop -= count;
// 		if (this.stackTop < 0) {
// 			this.error("this.stackTop", this.stackTop);
// 		}
// 	}
	
// 	push_rawByte(byte: number) {
// 		this.stack.setUint8(this.stackTop, byte);
// 		this.stackTop += 1;
// 	}
// 	pop_rawByte() {
// 		this.popCount(1);
// 		const byte = this.stack.getUint8(this.stackTop);
// 		return byte;
// 	}
	
// 	push_f32(number: number) {
// 		this.stack.setFloat32(this.stackTop, number);
// 		this.stackTop += 4;
// 		this.push_rawByte(Instruction.f32_new);
// 	}
// 	pop_f32(): number {
// 		const op = this.pop_rawByte();
// 		if (op != Instruction.f32_new) this.error();
		
// 		debugger;
		
// 		this.popCount(4);
// 		const number = this.stack.getFloat32(this.stackTop);
// 		return number;
// 	}
	
// 	/**
// 	 * Returns the table ID
// 	 */
// 	// makeTable(): number {
		
// 	// }
	
// 	run(program: Uint8Array) {
// 		let pc = 0;
// 		while (pc < program.length) {
// 			const instruction = program[pc];
// 			switch (instruction) {
// 				case Instruction.table_new: {
					
// 					break;
// 				}
// 				case Instruction.table_set: {
// 					break;
// 				}
				
// 				case Instruction.f32_new: {
// 					pc++
// 					const number = program[pc];
// 					this.push_f32(number);
					
// 					break;
// 				}
// 				case Instruction.f32_add: {
// 					const right = this.pop_f32();
// 					const left = this.pop_f32();
					
// 					this.push_f32(left + right);
// 					break;
// 				}
				
// 				default:
// 					this.error("unknown instruction", instruction, Instruction[instruction]);
// 			}
// 			pc++;
// 		}
// 	}
// }