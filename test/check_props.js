





function mixin(target, source) {
    // ignore the Function-properties
    const {name,length,prototype,...statics} = Object.getOwnPropertyDescriptors(source);
    Object.defineProperties(target, statics);
    // ignore the constructor
    const {constructor,...proto} = Object.getOwnPropertyDescriptors(source.prototype);
    Object.defineProperties(target.prototype, proto);
    //
    return target;
}



class B {
    constructor() {
        this.q = "q"
        this.r = "r"
        this.check = "CHECK B"
    }


    static giraffe() {
        console.log("GIRAFFE")
    }

    goober(str) {
        console.log(`GOOBER:: ${str} ${this.check}`)
    }
}


class A {
    constructor(aclass) {
        this.x = "Z"
        this.y = "W"
        this.z = "T"
        this.check = "CHECK A"

        let b = new aclass()
        for ( let ky in b ) {   // fields
            this[ky] = b[ky]
        }

        const {name,length,prototype,...statics} = Object.getOwnPropertyDescriptors(aclass);
        Object.defineProperties(this, statics);
    
        const {constructor,...proto} = Object.getOwnPropertyDescriptors(aclass.prototype);
        Object.defineProperties(this, proto);

    }

    static elephant() {
        console.log("ELEPHANT")
    }

    goober(str) {
        console.log(`NO NO!!! ${str}  ${this.check}`)
    }
}



let a = new A(B)

console.log(a)
console.dir(a)
console.log("------- ------- ------- ------- ------- ------- ")
console.dir(Object.getOwnPropertyDescriptors(a))
console.log("------- ------- ------- ------- ------- ------- ")
console.dir(Object.getOwnPropertyDescriptors(A))
console.dir(Object.getOwnPropertyDescriptors(B))
console.log("------- ------- ------- ------- ------- ------- ")
console.dir(Object.getOwnPropertyDescriptors(A.prototype))
console.dir(Object.getOwnPropertyDescriptors(B.prototype))
console.log("------- ------- ------- ------- ------- ------- ")

a.goober("me")
a.giraffe()

A.elephant()
B.giraffe()

//a.elephant()