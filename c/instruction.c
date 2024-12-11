#include "wasm.c"

// In () means arguments to the instruction
// In [] means on the stack. (top is on the left)
typedef enum Instruction {
	Instruction_nop = 0x00,
	
	Instruction_func_new, // () [argType] -> [func]
	Instruction_func_call,
	
	Instruction_local_get,
	Instruction_local_set,
	
	Instruction_type_new,
	
	Instruction_table_new,
	Instruction_table_set, // (size: u8 name: char[size]) [value, table] -> [table]
	Instruction_table_get,
	
	// i32_add,
	// i32_sub,
	// i32_mul,
	// i32_div,
	
	// same as JavaScript "number"
	Instruction_f32_new, // (value: f32) []
	Instruction_f32_add, // () [right: f32, left: f32]
	Instruction_f32_sub, // () [right: f32, left: f32]
	Instruction_f32_mul, // () [right: f32, left: f32]
	Instruction_f32_div, // () [right: f32, left: f32]
} Instruction;

#define test(name_) (memcmp(#name_, instructionName, min(instructionName_length, strlen(#name_))) == 0) return Instruction_##name_;
Instruction instructionNameToByte(char *instructionName, int instructionName_length) {
	if test(nop)
	
	else if test(func_new)
	else if test(func_call)
	
	else if test(local_get)
	else if test(local_set)
	
	else if test(type_new)
	
	else if test(table_new)
	else if test(table_set)
	else if test(table_get)
	
	else if test(f32_new)
	else if test(f32_add)
	else if test(f32_sub)
	else if test(f32_mul)
	else if test(f32_div)
	
	else {
		return Instruction_nop;
	}
}
#undef test