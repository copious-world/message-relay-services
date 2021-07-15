
const test = require('ava');

let JSONMessageQueue = require("../json-message-queue")
let path_constuctor = require("../path-handler/path-handler")
let PathHandler = path_constuctor.PathHandler
//
//

let MessageEndpoint = require('../lib/message_endpoint')

//
// /*
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


// */

class TestRelayClass {


    constructor(conf) {
        this.test_parameters = conf.test_parameters
        this.subcriptions = {}
    }

    send_on_path(message,path) {
        message._m_path = path
        return message
    }

    send_op_on_path(message,path,op) {
        message._m_path = path
        message._tx_op = op
        return message
    }

    subscribe(topic,path,msg,handler) {
        msg._ps_op = "sub"
        msg.topic = topic
        msg._m_path = path
        this.subcriptions[`update-${topic}-${path}`] = handler
    }

    unsubscribe(topic,path) {
        let handler = this.subcriptions[`update-${topic}-${path}`]
        delete this.subcriptions[`update-${topic}-${path}`]
        this.removeListener(`update-${topic}-${path}`,handler)
        let message = {
            "_ps_op" : "unsub",
            "topic" : topic
        }
        message._m_path = path
        return message
    }

    removeListener(tag,handler) {

    }
}

test('PathHandler - create', async t => {
    //
    let pconf = {
        "relay" : {
            "test_parameters" : {
                
            }
        }
    }
    //
    let p_handler = new PathHandler('tests',pconf,TestRelayClass)
    //
    t.is(p_handler.message_relayer.constructor.name,"TestRelayClass")
    
    // SEND
    let resp = await p_handler.send({ "text" : "a", "name" : "this is me" })  // must use await... 
    t.is(resp.name,"this is me")
    t.is(resp._m_path,'tests')
    // GET
    resp = await p_handler.get({ "text" : "a", "name" : "this is me" })  // must use await... 
    t.is(resp.name,"this is me")
    t.is(resp._m_path,'tests')
    t.is(resp._tx_op,'G')
    // DEL
    resp = await p_handler.del({ "text" : "a", "name" : "this is me" })  // must use await... 
    t.is(resp.name,"this is me")
    t.is(resp._m_path,'tests')
    t.is(resp._tx_op,'D')

    let msg = {
        "name" : "SUB TEST"
    }
    let topic = "SUB-TEST"
    let path = p_handler.path
    let handler = 42
    await p_handler.subscribe("SUB-TEST",msg,handler)
    t.is(msg.name,"SUB TEST")
    t.is(msg.topic,"SUB-TEST")
    t.is(msg._m_path,'tests')
    t.is(msg._ps_op,'sub')
    t.is(p_handler.message_relayer.subcriptions[`update-${topic}-${path}`],handler)
    //
    msg = {
        "name" : "SUB TEST"
    }
    resp = await p_handler.unsubscribe("SUB-TEST")
    t.is(resp.topic,"SUB-TEST")
    t.is(resp._m_path,'tests')
    t.is(resp.topic,"SUB-TEST")
    t.is(resp._ps_op,'unsub')
    t.is(p_handler.message_relayer.subcriptions[`update-${topic}-${path}`],undefined)
    //
    let expected_keys = {
        "user" : "UserHandler", 
        "persistence" : "PersistenceHandler", 
        "outgo_email" : "OutgoingEmailHandler", 
        "contact" : "ContactHandler", 
        "notify" : "NotificationHandler"
    }
    //
    for ( let classky in path_constuctor.classes ) {
        if ( classky in expected_keys ) {
            t.is(path_constuctor.classes[classky].name,expected_keys[classky])
        }
    }

    let path_handler = path_constuctor("user",pconf,TestRelayClass)
    t.is(path_handler.path,"user")
    t.is(path_handler.message_relayer.constructor.name,"TestRelayClass")
    let deleted = path_handler.del({})
    t.is(deleted,"none")

    // path,path_conf,FanoutRelayerClass
    //
    t.pass("used path handler class")
})


test("Message Endpoint - functional", async t => {

    class TestClass extends MessageEndpoint {
        constructor(conf) {
            super(conf)
        }

        init() {
            // do nothing... 
        }

        app_message_handler(msg_obj) {
            return msg_obj
        }

        app_subscription_handler(topic,msg_obj) {
            
        }
    }

    let call_results = {}

    class testSock {
        constructor(name) {
            this.readyState = "open"
            this.test_name = name
        }

        write(msg) {
            call_results[this.test_name] = JSON.parse(msg)
        }

        end() {}
    }

    let conf = {
        "port" : 500,
        "address" : "my address",
        "app_handles_subscriptions" : true
    }

    let inert = new TestClass(conf)

    let all_socks = []
    for ( let i = 0; i < 10; i++ ) {
        let client_name = `ACLIENT_${i}`
        let sock = new testSock(client_name)
        inert.add_connection(client_name,sock)
        all_socks.push(sock)
    }


    for ( let i = 0; i < 10; i++ ) {
        let msg = {
            "name" : "SUB TEST",
            "_response_id" : i
        }
        let client_name = `ACLIENT_${i}`
        try {
            let data = Buffer.from(JSON.stringify(msg))
            await inert.add_data_and_react(client_name,data)
        } catch (e) {
            console.error(e)
        }
    }

    for ( let i = 0; i < 10; i++ ) {
        let client_name = `ACLIENT_${i}`
        t.is(call_results[client_name]._response_id,i)
    }


    // _ps_op
    for ( let i = 0; i < 10; i++ ) {
        let msg = {
            "name" : "SUB TEST",
            "_ps_op" : "sub",
            "_response_id" : i,
            "topic" : "test"
        }
        let client_name = `ACLIENT_${i}`
        try {
            let data = Buffer.from(JSON.stringify(msg))
            await inert.add_data_and_react(client_name,data)
        } catch (e) {
            console.error(e)
        }
    }

    let t_set = inert.all_topics["test"]
    t.is(typeof t_set,"object")
    for ( let ty in t_set ) {
        t.is(t_set[ty].constructor.name,"Replier")
    }

    let i = 5
    let client_name = `ACLIENT_${i}`
    let msg = {
        "name" : "SUB TEST",
        "_ps_op" : "pub",
        "_response_id" : i,
        "topic" : "test"
    }
    try {
        let data = Buffer.from(JSON.stringify(msg))
        await inert.add_data_and_react(client_name,data)
    } catch (e) {
        console.error(e)
    }

    for ( let i = 0; i < 10; i++ ) {
        let client_name = `ACLIENT_${i}`
        if ( i !== 5 ) {
            t.is(call_results[client_name]._response_id,undefined)
            t.is(call_results[client_name].name,"SUB TEST")
            t.is(call_results[client_name].topic,"test")
        } else {
            t.is(call_results[client_name]._response_id,5)
        }
    }



    let j = 5
    let un_client_name = `ACLIENT_${j}`
    let msg_un = {
        "name" : "SUB TEST",
        "_ps_op" : "unsub",
        "_response_id" : j,
        "topic" : "test"
    }

    try {
        let data = Buffer.from(JSON.stringify(msg_un))
        await inert.add_data_and_react(un_client_name,data)
    } catch (e) {
        console.error(e)
    }


    let un_t_set = inert.all_topics["test"]
    t.is(typeof t_set,"object")
    for ( let ty in un_t_set ) {
        t.true(ty !== 'ACLIENT_5')
    }

    t.pass("end point without crash")
})