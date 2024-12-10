# brew install llvm
# brew link --force llvm
# brew install wabt # Web assembly binary tool kit, generally useful

# clang c/vm.c --target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export-all -o out/vm.wasm

makeWasm () {
    printf 'makeWasm: %s\n' $1 &&
	clang c/$1.c -Wall -Werror -Wno-error=unused-variable -Wno-incompatible-library-redeclaration --target=wasm32 -emit-llvm -c -g -S -o out/$1.ll &&
	llc out/$1.ll -march=wasm32 -filetype=obj &&
	wasm-ld out/$1.o --no-entry --export-all -o out/$1.wasm
}

makeWasm "vm"
makeWasm "bytecodeGen"