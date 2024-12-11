build () {
    printf 'build: %s\n' $1 &&
	clang c/$1.c -Wall -Werror -Wno-error=unused-variable -g -o out/$1
}

build "bytecodeGen"
build "virtualMachine"