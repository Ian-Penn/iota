// note: Debugging on works for the first time after restarting VS code.
// note: WebAssembly is Little-endian!?!

#include "wasm.c"

#define maxBytecodeOutputSize 2000

typedef struct BytecodeOutput {
	int byteLength;
	unsigned char bytecode[];
} BytecodeOutput;

BytecodeOutput *output;

// void error() {
// 	*NULL = 100;
// }

#define error() return NULL;

#define growBy(size_) output->byteLength += size_;\
if (output->byteLength > maxBytecodeOutputSize) { error(); }\

#define addByte(byte_) output->bytecode[output->byteLength] = (unsigned char)byte_; growBy(1);

BytecodeOutput *bytecodeGen(char *string, int stringLength) {
	output = malloc(maxBytecodeOutputSize);
	output->byteLength = 0;
	
	int i = 0;
	while (i < stringLength) {
		addByte(i);
		i++;
	}
	
	return output;
}