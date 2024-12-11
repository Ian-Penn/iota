// note: Debugging on works after waiting for a moment.
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

BytecodeOutput *bytecodeGen(char *string, int string_length) {
	wasm_log(string, string_length);
	
	output = malloc(maxBytecodeOutputSize);
	output->byteLength = 0;
	
	char *current = NULL;
	int current_length = 0;
	
	// int iterations;
	// const char	*errstr;

	// iterations	= strtonum(optarg, 1, 64, &errstr);
	// if	(errstr	!= NULL)
	// 	errx(1, "number of	iterations is %s: %s", errstr, optarg);
	
	int i = 0;
	while (i < string_length) {
		if (string[i] == '(') {
			i++;
			continue;
		}
		
		if (current != NULL) {
			wasm_log(current, current_length);
		}
		
		if (string[i] == ' ' || string[i] == ')') {
			Instruction instruction = instructionNameToByte(current, current_length);
			current = NULL;
			current_length = 0;
			
			addByte(instruction);
			
			// if (instruction == Instruction_f32_new) {
			// 	addByte(Instruction_f32_new);
			// }
		} else {
			if (current == NULL) {
				current = &string[i];
			}
			
			current_length += 1;
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