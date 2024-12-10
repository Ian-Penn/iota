# brew install llvm
# brew link --force llvm
# brew install wabt # Web assembly binary tool kit, generally useful

# clang c/vm.c --target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export-all -o out/vm.wasm

# vm
clang c/vm.c --target=wasm32 -emit-llvm -c -S -o out/vm.ll &&
llc out/vm.ll -march=wasm32 -filetype=obj &&
wasm-ld out/vm.o --no-entry --export-all -o out/vm.wasm &&

# bytecodeGen
clang c/bytecodeGen.c --target=wasm32 -emit-llvm -c -S -o out/bytecodeGen.ll &&
llc out/bytecodeGen.ll -march=wasm32 -filetype=obj &&
wasm-ld out/bytecodeGen.o --no-entry --export-all -o out/bytecodeGen.wasm