export class WebAssemblyInterface<Exports> {
	exports: Exports & {
		malloc(size: number): number,
		freeAll(): void,
		
		memory: WebAssembly.Memory,
	};
	
	constructor(instance: WebAssembly.Instance) {
		this.exports = instance.exports as any;
	}
	
	static async fromBytes(bytes: BufferSource): Promise<WebAssemblyInterface<any>> {
		const imports = {
			wasm_log: (startPtr: number, length: number) => {
				const decoder = new TextDecoder();
				const bytecode = new Uint8Array(
					(instance.exports.memory as WebAssembly.Memory).buffer,
					startPtr,
					length,
				);
				const text = decoder.decode(bytecode);
				console.log("[WASM]", text);
			},
		};
		
		const { instance, module } = await WebAssembly.instantiate(bytes, { env: imports });
		// console.log("WebAssembly.Module.imports(module)", WebAssembly.Module.imports(module));
		return new WebAssemblyInterface(instance);
	}
	
	fillString(string: string): { ptr: number, size: number } {
		const encoder = new TextEncoder();
		const stringBuffer = encoder.encode(string);
		
		const exports = this.exports as any;
		
		const ptr = exports.malloc(stringBuffer.length);
		const cArray = new Uint8Array(
			exports.memory.buffer,
			ptr,
			stringBuffer.length,
		);
		cArray.set(stringBuffer);
		
		return {
			ptr: ptr,
			size: stringBuffer.length,
		};
	}
	
	freeAll() {
		this.exports.freeAll();
	}
}