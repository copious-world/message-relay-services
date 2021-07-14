
const test = require('ava');

let JSONMessageQueue = require("../json-message-queue")

test('json message queue: create class', t => {
    let mod = new JSONMessageQueue(false)
    if ( mod ) {
        t.is(mod.message_decoder,mod.default_decoder)
        return
    }
    t.fail("no class instance")
})


test('json message queue: default parser is JSON.parse', t => {
    let mod = new JSONMessageQueue(false)
    if ( mod ) {
        let b = mod.message_decoder("this is some junk")
        t.is(b,false)
        let obj = {
            "b" : [ "a", 1, true],
            "c" : "q"
        }
        b = mod.message_decoder(JSON.stringify(obj))
        t.is(b.b[0],"a")
        return
    }
    t.fail("no class instance")
})


test('json message queue: add strings ', t => {
    let mod = new JSONMessageQueue(false)
    if ( mod ) {
        let obj_array = [
                            { "b" : [ "a", 1, true], "c" : "q" },
                            { "b" : [ "g", 3, false], "c" : "r" },
                            { "b" : [ "g", 5, true], "c" : "s" }
                        ]
        for ( let obj of obj_array ) {
            let obj_str = JSON.stringify(obj)
            let buf = Buffer.from(obj_str)
            mod.add_data(buf)
        }
        t.is(mod.last_message,`{"b":["a",1,true],"c":"q"}{"b":["g",3,false],"c":"r"}{"b":["g",5,true],"c":"s"}`)
        t.pass("to string")
        return
    }
    t.fail("no class instance")
})


test('json message queue: message complete ', t => {
    let mod = new JSONMessageQueue(false)
    if ( mod ) {
        let obj_array = [
                            { "b" : [ "a", 1, true], "c" : "q" },
                            { "b" : [ "g", 3, false], "c" : "r" },
                            { "b" : [ "g", 5, true], "c" : "s" }
                        ]
        let sep = ""
        for ( let obj of obj_array ) {
            let obj_str = JSON.stringify(obj) + sep
            sep += " "
            let buf = Buffer.from(obj_str)
            mod.add_data(buf)
        }
        let rest = mod.message_complete()
        t.is(rest,undefined)
        t.is(mod.last_message,"")
        t.is(mod.message_queue.length,3)
        rest = mod.message_complete()
        t.is(rest,undefined)
        t.is(mod.last_message,"")
        t.is(mod.message_queue.length,3)
        //
        for ( let obj of obj_array ) {
            let obj_str = JSON.stringify(obj) + sep
            sep += " "
            let buf = Buffer.from(obj_str)
            mod.add_data(buf)
        }
        let buf = Buffer.from(`{ "b" : [ "g", 5, true`)
        mod.add_data(buf)
        //
        mod.message_complete()
        t.is(mod.last_message,`{ "b" : [ "g", 5, true`)
        t.is(mod.message_queue.length,6)

        buf = Buffer.from(`], "c" : "s" }`)
        mod.add_data(buf)
        buf = Buffer.from(`{ "b" : [ "g", 3, false], "c" : "r" }`)
        mod.add_data(buf)
        mod.message_complete()
        t.is(mod.message_queue.length,8)
        t.is(mod.last_message,"")

        return
    }
    t.fail("no class instance")
})


test('json message queue: dequeue message complete ', t => {
    let mod = new JSONMessageQueue(false)
    if ( mod ) {
        let obj_array = [
                            { "b" : [ "e", 1, true], "c" : "q" },
                            { "b" : [ "f", 3, false], "c" : "r" },
                            { "b" : [ "g", 5, true], "c" : "s" }
                        ]
        let sep = ""
        for ( let obj of obj_array ) {
            let obj_str = JSON.stringify(obj) + sep
            sep += " "
            let buf = Buffer.from(obj_str)
            mod.add_data(buf)
        }
        let rest = mod.message_complete()
        t.is(rest,undefined)
        t.is(mod.last_message,"")
        t.is(mod.message_queue.length,3)
        let obj = mod.dequeue()
        t.is(obj.b[0],"e")
        t.is(mod.message_queue.length,2)
        obj = mod.dequeue()
        t.is(obj.b[0],"f")
        t.is(mod.message_queue.length,1)
        obj = mod.dequeue()
        t.is(obj.b[0],"g")
        t.is(mod.message_queue.length,0)
        return
    }
    t.fail("no class instance")
})

