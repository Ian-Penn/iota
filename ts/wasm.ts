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
		const { instance } = await WebAssembly.instantiate(bytes);
		return new WebAssemblyInterface(instance);
	}
	
	fillString(string: string): { ptr: number, size: number } {
		var encoder = new TextEncoder()
		const stringBuffer = encoder.encode(string);
		
		const exports = this.exports as any;
		
		const ptr = exports.malloc(stringBuffer.length);
		const cArray = new Uint32Array(
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