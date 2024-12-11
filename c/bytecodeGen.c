// note: Debugging on works for the first time after restarting VS code.
// note: WebAssembly is Little-endian

#include "wasm.c"
#include "instruction.c"

#define maxBytecodeOutputSize 2000

typedef struct BytecodeOutput {
	int byteLength;
	unsigned char bytecode[];
} BytecodeOutput;

BytecodeOutput *output;

#define error() return NULL;

#define growBy(size_) output->byteLength += size_;\
if (output->byteLength > maxBytecodeOutputSize) { error(); }\

#define addByte(byte_) output->bytecode[output->byteLength] = (unsigned char)byte_; growBy(1);

#define charAccumulator_maxSize 50
#define charAccumulator_new(name_) char name_[50] = {0}; int name_##_length = 0;
#define charAccumulator_add(name_, char_) name_[name_##_length] = char_; name_##_length++;

BytecodeOutput *bytecodeGen(char *string, int stringLength) {
	output = malloc(maxBytecodeOutputSize);
	output->byteLength = 0;
	
	charAccumulator_new(instructionName);
	
	int i = 0;
	while (i < stringLength) {
		if (string[i] == '(') {
			i++;
			continue;
		}
		
		if (string[i] == ' ' || string[i] == ')') {
			Instruction instruction = instructionNameToByte(instructionName, instructionName_length);
			addByte(instruction);
			
			// if (instruction == Instruction_f32_new) {
			// 	addByte(Instruction_f32_new);
			// }
		} else {
			charAccumulator_add(instructionName, string[i]);
		}
		
		i++;
	}
	
	return output;
}

#ifndef NO_MAIN
int main(int argc, char const *argv[]) {
	char *string = "(f32_new)";
	bytecodeGen(string, strlen(string));
	return 0;
}
#endif