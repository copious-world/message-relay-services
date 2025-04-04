
const test = require('ava');

let JSONMessageQueue = require("../json-message-queue")
let path_constuctor = require("../path-handler/path-handler")
let PathHandler = path_constuctor.PathHandler
//
//
let MessageEndpoint = require('../lib/message_endpoint')
let MessageRelay = require('../lib/message_relay')
let MessageRelayClient = require('../lib/message_relay_client');

let RelayCommunicator = MessageRelay.Communicator

const { EventEmitter } = require('events');

//

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

let T_test_message_lookup = {
}

class TestRelayClass {

    constructor(conf) {
        this.test_parameters = conf.test_parameters
        this.subcriptions = {}
    }

    send_on_path(message,path) {
        message._m_path = path
        T_test_message_lookup[message._test_lookup] = message
        return message
    }

    send_op_on_path(message,path,op) {
        message._m_path = path
        message._tx_op = op
        T_test_message_lookup[message._test_lookup] = message
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
    t.is(p_handler.topic_listeners["SUB-TEST"][0],handler)
    //
    msg = {
        "name" : "SUB TEST"
    }
    resp = await p_handler.unsubscribe("SUB-TEST")
    t.is(resp.topic,"SUB-TEST")
    t.is(resp._m_path,'tests')
    t.is(resp.topic,"SUB-TEST")
    t.is(resp._ps_op,'unsub')
    t.is(p_handler.topic_listeners["SUB-TEST"],undefined)
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

        _init() {
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


// * /

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

test("message_relay service", async t => {
    //
    let call_results = {}

    class testSock {
        constructor(name) {
            this.readyState = "open"
            this.test_name = name
            this.remoteAddress = "wiggly"
            this.remotePort = "pigly"
        }

        write(msg) {
            call_results[this.test_name] = JSON.parse(msg)
        }

        end() {}

        
    }

    // ---- ---- ---- ---- ---- ---- ----
    class test_Relay extends MessageRelay {

        constructor(conf,fanoutRelayer) {
            super(conf,fanoutRelayer)
        }

        _init() {
        }

    }

    let conf = {
        "port" : "wine",
        "address" : "101 home st",
        "tls" : undefined,
        "path_types" : {
            "winding" : {
                "relay" : {
                    "files_only" : false,
                    "output_dir" : "fail_over_user",
                    "output_file" : "/user_data.json",
                    "port" : 5114,
                    "address" : "localhost",
                    "max_pending_messages" : false,
                    "file_shunting" : false,
                    "max_reconnect" : 24,
                    "reconnect_wait" : 5,
                    "attempt_reconnect" : true
                }
            }
        },
        "path_handler_factory" : __dirname + "/helpers/faux_paths"
    }

    let sock = new testSock("wiggly-pigly")

    let relay_class_obj = new test_Relay(conf,TestRelayClass)
    relay_class_obj.add_connection(sock.test_name,sock)
    //
    //
    let path = Object.keys(relay_class_obj.message_paths)[0]
    t.is(path,"winding")
    //
    let m_handler = relay_class_obj.messenger_connections['wiggly-pigly']
    let message = {
        "_m_path" : path,
        "data" : "this is a test",
        "_response_id" : 23,
        "_test_lookup" : "A"
    }

    let data = Buffer.from(JSON.stringify(message))
    await m_handler.data_handler(data)
    //
    t.is(T_test_message_lookup[message._test_lookup]._response_id,23)
    t.is(call_results[sock.test_name].msg.data,"this is a test")
    //
    message = {
        "_m_path" : path,
        "_tx_op" : "G",
        "data" : "this is a test",
        "_response_id" : 24,
        "_test_lookup" : "B"
    }

    data = Buffer.from(JSON.stringify(message))
    await m_handler.data_handler(data)
    //
    t.is(T_test_message_lookup[message._test_lookup]._response_id,24)
    t.is(call_results[sock.test_name].msg.data,"this is a test")
    //
    message = {
        "_m_path" : path,
        "_tx_op" : "D",
        "data" : "this was a test",
        "_response_id" : 25,
        "_test_lookup" : "C"
    }

    data = Buffer.from(JSON.stringify(message))
    await m_handler.data_handler(data)
    //
    t.is(T_test_message_lookup[message._test_lookup]._response_id,25)
    t.is(call_results[sock.test_name].msg.data,"this was a test")

    // 
    message = {
        "_m_path" : path,
        "_tx_op" : "S",
        "_ps_op"  : "sub",
        "data" : "this was a test",
        "_response_id" : 25,
        "_test_lookup" : "C"
    }

    data = Buffer.from(JSON.stringify(message))
    await m_handler.data_handler(data)
    //

    message = {
        "_m_path" : path,
        "_tx_op" : "S",
        "_ps_op"  : "unsub",
        "data" : "this was a test",
        "_response_id" : 25,
        "_test_lookup" : "C"
    }

    data = Buffer.from(JSON.stringify(message))
    await m_handler.data_handler(data)
    //


    t.pass("framework OK")
})



test("MessageRelayClient", async t => {

    let call_results = {}

    class testSock extends EventEmitter {
        constructor(name) {
            super()
            this.readyState = "open"
            this.test_name = name
            this.remoteAddress = "wiggly"
            this.remotePort = "pigly"
        }

        write(msg) {
            console.log(msg)
            call_results[this.test_name] = JSON.parse(msg)
        }

        end() {}
    }

    class test_RC extends MessageRelayClient {
        constructor(conf) {
            super(conf)

            this.socket = new testSock("wiggly-pigly")
            this.writer = this.socket
        }
        //
        _connect() {}
        _setup_connection_handlers(client,conf) {}
        
    }

    let conf = {
        "port" : "wine",
        "address" : "211 memoryville",
        "send_on_reconnect" : true,
        "tls" : undefined,
        "files_only" : false,
        "shunt_file" : "message_relay.txt",
        "file_shunting" : true,
        "file_per_message" : false,
        "attempt_reconnect" : false
    }

    let relayer = new test_RC(conf)

    let message = {
        "you" : "are",
        "here" : true
    }
    let p = relayer.send_on_path(message,"twisty")

    let resp_id = call_results["wiggly-pigly"]._response_id

    message = {
        "_response_id" : resp_id
    }
    let p2 = new Promise((resolve,reject) => {
        setImmediate(() => {
            let data = Buffer.from(JSON.stringify(message))
            relayer.client_add_data_and_react(data)
            resolve(true)
        })    
    })

    await p2
    await p

    t.pass("client class OK")
})

// * /

test("MessageRelayClient - files", async t => {

    let call_results = {}

    class testSock extends EventEmitter {
        constructor(name) {
            super()
            this.readyState = "open"
            this.test_name = name
            this.remoteAddress = "wiggly"
            this.remotePort = "pigly"
        }

        write(msg) {
            console.log("testSock." + "write ..." + msg)
            call_results[this.test_name] = JSON.parse(msg)
            this.emit('test-call-results-ok')
        }

        end() {}
    }

    class test_RC extends MessageRelayClient {
        constructor(conf) {
            super(conf)

            this.socket = new testSock("wiggly-pigly")
            this.writer = this.socket
        }
        //
        _connect() {}
        _setup_connection_handlers(client,conf) {}
        
    }

    let conf = {
        "port" : "wine",
        "address" : "211 memoryville",
        "send_on_reconnect" : true,
        "tls" : undefined,
        "files_only" : false,
        "shunt_file" : "message_relay.txt",
        "output_dir" : __dirname + "/messages",
        "file_shunting" : true,
        "ensure_directories" : true,
        "file_per_message" : false,
        "attempt_reconnect" : false
    }

    let relayer = new test_RC(conf)
    await relayer._start_file_shunting(conf)

    let hold_promises = []
    relayer.socket.on('test-call-results-ok',async () => {
        await relayer._shutdown_files_going(hold_promises,true)

        let resp_id = call_results["wiggly-pigly"]._response_id
        message = {
            "_response_id" : resp_id
        }    
    })

    let message = {
        "you" : "are 2",
        "here" : true
    }
    await relayer.send_on_path(message,"twisty")


    let p2 = new Promise((resolve,reject) => {
        setImmediate(() => {
            let data = Buffer.from(JSON.stringify(message))
            relayer.client_add_data_and_react(data)
            resolve(true)
        })    
    })


    await p2
    console.dir(hold_promises)
    await Promise.all(hold_promises)

    t.pass("client class OK")
})




test('PathHandler - pub/sub', async t => {

    let call_results = {}


    class testSock extends EventEmitter {
        constructor(name) {
            super()
            this.readyState = "open"
            this.test_name = name
            this.remoteAddress = "wiggly"
            this.remotePort = "pigly"
        }

        write(msg) {
            console.log("testSock." + "write ..." + msg)
            let mm = JSON.parse(msg)
            let a_topic = mm.topic
            if ( call_results[a_topic]  === undefined  ) {
                call_results[a_topic] = {}
                console.log("strange topic: " + a_topic)
            }
            call_results[a_topic][this.test_name] = mm
        }

        end() {}
    }

    class test_RC extends MessageRelayClient {
        constructor(conf) {
            super(conf)

            this.socket = new testSock("wiggly-pigly")
            this.writer = this.socket
        }
        //
        _connect() {}
        _setup_connection_handlers(client,conf) {}
        
    }

    //
    let pconf = {
        "relay" : {
            "test_parameters" : {
                
            }
        }
    }
    //
    let p_handler = new PathHandler('tests',pconf,test_RC)
    t.is(p_handler.message_relayer.constructor.name,"test_RC")
    
    //
    // make an array of writers
    let writer_names = [ "A", "B", "C", "D", "E", "F", "G", "H", "I"]
    let all_writers = writer_names.map(w_name => {
        return new testSock(w_name)
    })


    let topics = ["SUB-TEST1", "SUB-TEST2"]
    let listeners = {"SUB-TEST1" : [], "SUB-TEST2" : []}

    for ( let topic of topics ) {
        //
        let msg = {
            "name" : topic
        }
        //
        all_writers.forEach ( async a_writer => {
            let listener = ((wrtr,tt) => {      // forward publication to the client (this socket)
                return (msg) => {
                        msg.topic = tt
                        let forwarded = JSON.stringify(msg)
                        //wrtr.write(forwarded)
                        return wrtr.test_name
                    }
                }
            )(a_writer,topic)                       
            listeners[topic][a_writer.test_name] = listener  // for a generic cleanup
            await p_handler.subscribe(topic,msg,listener)
            //
            t.is(msg.name,topic)
            t.is(msg.topic,topic)
            t.is(msg._m_path,'tests')
            t.is(msg._ps_op,'sub')
        })
        //
    }

    for ( let topic of topics ) {
        let listens = p_handler.topic_listeners[topic]
        for ( let i = 0; i < listens.length; i++ ) {
            let msg = {
                "name" : topic
            }
            let w_name = writer_names[i]
            let listener = p_handler.topic_listeners[topic][i]
            let tst_name = listener(msg)
            t.is(w_name,tst_name)
        }
    }



    for ( let topic of topics ) {
        //
        all_writers.forEach ( async a_writer => {
            let listener = listeners[topic][a_writer.test_name] // for a generic cleanup
            await p_handler.unsubscribe(topic,listener)
        })
        //
    }

    for ( let topic of topics ) {
        // initialize here
        call_results[topic] = {}
        //
        let msg = {
            "name" : topic
        }
        //
        all_writers.forEach ( async a_writer => {
            let listener = ((wrtr,tt) => {      // forward publication to the client (this socket)
                return (msg) => {
                        msg.topic = tt
                        let forwarded = JSON.stringify(msg)
                        wrtr.write(forwarded)
                    }
                }
            )(a_writer,topic)                       
            listeners[topic][a_writer.test_name] = listener  // for a generic cleanup
            await p_handler.subscribe(topic,msg,listener)
            //
            t.is(msg.name,topic)
            t.is(msg.topic,topic)
            t.is(msg._m_path,'tests')
            t.is(msg._ps_op,'sub')
        })
        //
    }

    for ( let a_topic of topics ) { 
        let P_msg = {
            "topic" : a_topic,
            "_m_path" : 'tests'
        }
        let topic = P_msg.topic
        let path = P_msg._m_path
        p_handler.message_relayer.emit(`update-${topic}-${path}`,P_msg)
    }

    let p = new Promise((resolve,reject) => {
        setTimeout(() => {
            resolve(call_results)
        },5)
    })

    let final_results = await p;

    console.dir(final_results)

    for ( let test_topic of topics ) {
        t.is(final_results[test_topic]["B"].topic,test_topic)
        t.is(final_results[test_topic]["D"]._m_path,"tests")
    }

    // path,path_conf,FanoutRelayerClass
    //
    t.pass("used path handler class")
})



test('Relay - pub/sub', async t => {

    let call_results = {}


    class testSock extends EventEmitter {
        constructor(name) {
            super()
            this.readyState = "open"
            this.test_name = name
            this.remoteAddress = "wiggly"
            this.remotePort = "pigly"
        }

        write(msg) {
            console.log("testSock." + "write ..." + msg)
            let mm = JSON.parse(msg)
            let a_topic = mm.topic
            if ( call_results[a_topic]  === undefined  ) {
                call_results[a_topic] = {}
                console.log("strange topic: " + a_topic)
            }
            call_results[a_topic][this.test_name] = mm
        }

        end() {}
    }

    class test_RC extends MessageRelayClient {
        constructor(conf) {
            super(conf)

            this.socket = new testSock("wiggly-pigly")
            this.writer = this.socket
        }
        //
        _connect() {}
        _setup_connection_handlers(client,conf) {}
    }

    class test_RelayCommunicator extends RelayCommunicator {
        //
        constructor(conf) {
            super(conf,test_RC)

            this.socket = new testSock("wiggly-pigly")
            this.writer = this.socket
        }

        _init() {
            // what goes here? for a test
        }
    }

    let path_handler_factory = (path,path_conf,FanoutRelayerClass) => {
        //
        let pc = new PathHandler(path,path_conf,FanoutRelayerClass)
        return pc
    }

    let conf = {
        "path_types" :  { 
            "test" : {
                "relay" :{
                    "files_only" : false,
                    "output_dir" : "fail_over_user",
                    "output_file" : "/user_data.json",
                    "port" : 5114,
                    "address" : "localhost",
                    "max_pending_messages" : false,
                    "file_shunting" : false,
                    "max_reconnect" : 24,
                    "reconnect_wait" : 5,
                    "attempt_reconnect" : false
                }
            }, 
            "best" : {
                "relay" : {
                    "files_only" : false,
                    "output_dir" : "fail_over_user",
                    "output_file" : "/user_data.json",
                    "port" : 5116,
                    "address" : "localhost",
                    "max_pending_messages" : false,
                    "file_shunting" : false,
                    "max_reconnect" : 24,
                    "reconnect_wait" : 5,
                    "attempt_reconnect" : false
                }
            }, 
            "jest" :  {
                "relay" : {
                    "files_only" : false,
                    "output_dir" : "fail_over_user",
                    "output_file" : "/user_data.json",
                    "port" : 5118,
                    "address" : "localhost",
                    "max_pending_messages" : false,
                    "file_shunting" : false,
                    "max_reconnect" : 24,
                    "reconnect_wait" : 5,
                    "attempt_reconnect" : false
                }
            }
        },
        "path_handler_factory" : path_handler_factory
    }


    let test_rc = new test_RelayCommunicator(conf)

    t.is(Object.keys(test_rc.message_paths).length,3)

    for ( let path in test_rc.message_paths ) {
        let p_handler = test_rc.message_paths[path]
        t.is(p_handler.path,path)
        t.is(p_handler.message_relayer.constructor.name, "test_RC")
        t.is(p_handler.message_relayer.writer.constructor.name, "testSock")
    }



    let subscription_results = {}

    class subSock extends testSock {
        constructor(name) {
            super(name)
            this.remoteAddress = "humpdee"
            this.remotePort = "dumpdee"
        }

        write(msg) {
            console.log("testSock." + "write ..." + msg)
            let mm = JSON.parse(msg)
            let a_topic = mm.topic
            if ( subscription_results[a_topic]  === undefined  ) {
                subscription_results[a_topic] = {}
                console.log("strange topic: " + a_topic)
            }
            subscription_results[a_topic][this.test_name] = mm
        }

        end() {}
    }


    let all_socks = []
    for ( let i = 0; i < 10; i++ ) {
        let client_name = `ACLIENT_${i}`
        let sock = new subSock(client_name)
        test_rc.add_connection(client_name,sock)
        all_socks.push(sock)
    }

    let topics = ["SUB-TEST1", "SUB-TEST2"]
    for ( let sock of all_socks ) {
        let name = sock.test_name
        for ( let topic of topics ) {
            for ( let path in test_rc.message_paths ) {
                let sub_message = {
                    "topic" : topic,
                    "_m_path" : path,
                    "_ps_op" : 'sub' 
                }
                let sub_message_bytes = Buffer.from(JSON.stringify(sub_message))
                test_rc.add_data_and_react(name,sub_message_bytes)
            }
        }
    }

    //

    console.dir(test_rc.messenger_connections)
    for ( let path in test_rc.message_paths ) {
        let mpath = test_rc.message_paths[path]
        t.is(mpath.path,path)
        let subs = mpath.message_relayer.subcriptions
        for ( let topic of topics ) {
            let ev_name = `update-${topic}-${path}`
            t.true(ev_name in subs)

            //
            let m_relayer = mpath.message_relayer
            let pub_message = {
                "topic" : topic,
                "_m_path" : path,
                "message" : "have a nice day"
            }
            let publish_buffer = Buffer.from(JSON.stringify(pub_message))
            m_relayer.client_add_data_and_react(publish_buffer)
            //
        }
    }


    setImmediate(() => {
        console.dir(subscription_results)
    },1000)


    t.pass("link relay to path handler to message-relay-client")

})


test('Connecting class intialization', async t => {

    class test_EndPoint extends MessageEndpoint {
        constructor(conf) {
            super(conf)
        }

        /**
         * 
         * @returns {object}
         */
        _load_tls_keys() {
            //
            let base = process.cwd()
            //
            // allow exceptions to be thrown
            if ( this.tls_conf ) {
                // //
                // let server_key = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_key ) {
                //     server_key = this.tls_conf.preloaded.server_key
                // } else {
                //     server_key = fs.readFileSync(`${base}/${this.tls_conf.server_key}`)
                // }
                // //
                // let server_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_cert ) {
                //     server_cert = this.tls_conf.preloaded.server_cert
                // } else {
                //     server_cert = fs.readFileSync(`${base}/${this.tls_conf.server_cert}`)
                // }
                // //
                // let client_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_cert ) {
                //     client_cert = this.tls_conf.preloaded.client_cert
                // } else {
                //     client_cert = fs.readFileSync(`${base}/${this.tls_conf.client_cert}`)
                // }

                let tls_options = {
                    key: "server_key",
                    cert: "client_cert",
                    requestCert: true,
                    ca: [ "client_cert" ]
                };

                return tls_options
            }
            //
            return false
        }




        /**
         * 
         */
        _create_connection() {
            if ( (this.UDS_path !== undefined) || (this.uds_path_count == 0) ) {
                if ( !(this.use_tls) ) {
                    //this.connection = net.createServer((sock) => { this.onClientConnected_func(sock) })
                } else {
                    if ( this.default_tls ) {
                        //this.connection = tls.createServer((sock) => { this.onClientConnected_func(sock) });
                    } else {
                        const options = this.preloaded_tls_keys;
                        if ( this.extended_tls_options !== false ) {
                            options = Object.assign({},options,this.extended_tls_options)
                        }
                        //this.connection = tls.createServer(options,((sock) => { this.onClientConnected_func(sock) }));    
                    }
                }
            } else {
                for ( let i = 0; i < this.uds_path_count; i++ ) {
                    let uds_path = `${this.UDS_path}-$[i]`
                    if ( !(this.use_tls) ) {
                        //this.connection = net.createServer((sock) => { this.onClientConnected_func(sock,uds_path) })
                    } else {
                        if ( this.default_tls ) {
                            //this.connection = tls.createServer((sock) => { this.onClientConnected_func(sock,uds_path) });
                        } else {
                            const options = this.preloaded_tls_keys;
                            if ( this.extended_tls_options !== false ) {
                                options = Object.assign({},options,this.extended_tls_options)
                            }
                            //this.connection = tls.createServer(options,((sock) => { this.onClientConnected_func(sock,uds_path) }));    
                        }
                    }
                }
                this.uds_server_list[uds_path] = this.connection
            }
            //   UDS 
            if ( this.UDS_path !== undefined ) {
                if ( this.uds_path_count == 0 ) {
                    // this.connection.listen({ 'path' : this.UDS_path }, () => {
                    //     console.log(`Server started at: ${this.UDS_path}`);
                    // });
                } else {
                    for ( let i = 0; i < this.uds_path_count; i++ ) {
                        let uds_path = `${this.UDS_path}-$[i]`
                        let connection = this.uds_server_list[uds_path]
                        // connection.listen({ 'path' : uds_path }, () => {
                        //     console.log(`Server started at: ${uds_path}`);
                        // });    
                    }
                }
            } else {
                // this.connection.listen(this.port, this.address, () => {
                //     console.log(`Server started at: ${this.address}:${this.port}`);
                // });    
            }

        }

        _create_connection() {
            if ( !(this.use_tls) ) {
                //this.connection = net.createServer((sock) => { this.onClientConnected_func(sock) })
            } else {
                this.options = {
                    key: (typeof this.tls_conf.server_key === "string"), // fs.readFileSync(this.tls_conf.server_key),
                    cert: (typeof this.tls_conf.server_cert === "string"),  // fs.readFileSync(this.tls_conf.server_cert),
                    requestCert: true,  // using client certificate authentication
                    ca: [ (typeof this.tls_conf.client_cert === "string") ] // fs.readFileSync(this.tls_conf.client_cert)  client uses a self-signed certificate
                };
                //this.connection = tls.createServer(options,((sock) => { this.onClientConnected_func(sock) }));    
            }
            /*
            this.connection.listen(this.port, this.address, () => {
                console.log(`Server started at: ${this.address}:${this.port}`);
            });
            */
        }
    

    }


    class test_MessageRelay extends MessageRelay {
        constructor(conf) {
            super(conf)
        }

    
        /**
         * 
         * @returns {object}
         */
        _load_tls_keys() {
            //
            let base = process.cwd()
            //
            // allow exceptions to be thrown
            if ( this.tls_conf ) {
                // //
                // let server_key = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_key ) {
                //     server_key = this.tls_conf.preloaded.server_key
                // } else {
                //     server_key = fs.readFileSync(`${base}/${this.tls_conf.server_key}`)
                // }
                // //
                // let server_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_cert ) {
                //     server_cert = this.tls_conf.preloaded.server_cert
                // } else {
                //     server_cert = fs.readFileSync(`${base}/${this.tls_conf.server_cert}`)
                // }
                // //
                // let client_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_cert ) {
                //     client_cert = this.tls_conf.preloaded.client_cert
                // } else {
                //     client_cert = fs.readFileSync(`${base}/${this.tls_conf.client_cert}`)
                // }

                let tls_options = {
                    key: "server_key",
                    cert: "client_cert",
                    requestCert: true,
                    ca: [ "client_cert" ]
                };

                return tls_options
            }
            //
            return false
        }




        _create_connection() {
            if ( !(this.use_tls) ) {
                this.net_con = "simples server" //  net.createServer(this.onClientConnected_func);
            } else {
                this.options = {
                    key: (typeof this.tls_conf.server_key === "string"), // fs.readFileSync(this.tls_conf.server_key),
                    cert: (typeof this.tls_conf.server_cert === "string"),  // fs.readFileSync(this.tls_conf.server_cert),
                    requestCert: true,  // using client certificate authentication
                    ca: [ (typeof this.tls_conf.client_cert === "string") ] // fs.readFileSync(this.tls_conf.client_cert)  client uses a self-signed certificate
                };
                this.net_con = "tls server"
                //this.net_con = tls.createServer(options,this.onClientConnected_func);    
            }
            //
            /*
            if ( this.net_con ) {
                this.net_con.listen(this.port, this.address, () => {
                    console.log(`Server started at: ${this.address}:${this.port}`);
                });    
            }
            */
        }
    }

    
    class test_MessageRelayClient extends MessageRelayClient {
        constructor(conf) {
            super(conf)
        }

        _setup_connection_handlers(client,conf) {}



        /**
         * 
         * @returns {object} - tls options use in the call to `connect`
         */
        _load_tls_keys() {
            //
            let base = process.cwd()
            //
            // allow exceptions to be thrown
            if ( this.tls_conf ) {
                // //
                // let client_key = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_key ) {
                //     client_key = this.tls_conf.preloaded.client_key
                // } else {
                //     client_key = fs.readFileSync(`${base}/${this.tls_conf.client_key}`)
                // }
                // //
                // let client_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_cert ) {
                //     client_cert = this.tls_conf.preloaded.client_cert
                // } else {
                //     client_cert = fs.readFileSync(`${base}/${this.tls_conf.client_cert}`)
                // }
                // //
                // let server_cert = false
                // if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_cert ) {
                //     server_cert = this.tls_conf.preloaded.server_cert
                // } else {
                //     if ( Array.isArray(this.tls_conf.server_cert) ) {
                //         server_cert = []
                //         for ( let cert_file of this.tls_conf.server_cert ) {
                //             let one_cert = fs.readFileSync(`${base}/${cert_file}`)
                //             server_cert.push(one_cert)
                //         }
                //     } else {
                //         server_cert = fs.readFileSync(`${base}/${this.tls_conf.server_cert}`)
                //     }
                // }

                let server_cert = false

                let tls_options = {
                    // Necessary only if the server requires client certificate authentication.
                    key: "client_key",
                    cert: "client_cert",
                    // Necessary only if the server uses a self-signed certificate.
                    ca: Array.isArray(server_cert) ? server_cert :  [ "server_cert" ],
                    // Necessary only if the server's cert isn't for "localhost".
                    checkServerIdentity: () => { return null; },
                };
        
                return tls_options
            }
            //
            return false
        }


        _create_connection() {
            if ( !(this.use_tls) ) {
                this.net_con = "simples server" //  net.createServer(this.onClientConnected_func);
            } else {
                this.options = {
                    key: (typeof this.tls_conf.server_key === "string"), // fs.readFileSync(this.tls_conf.server_key),
                    cert: (typeof this.tls_conf.server_cert === "string"),  // fs.readFileSync(this.tls_conf.server_cert),
                    requestCert: true,  // using client certificate authentication
                    ca: [ (typeof this.tls_conf.client_cert === "string") ] // fs.readFileSync(this.tls_conf.client_cert)  client uses a self-signed certificate
                };
                this.net_con = "tls server"
                //this.net_con = tls.createServer(options,this.onClientConnected_func);    
            }
            //
            /*
            if ( this.net_con ) {
                this.net_con.listen(this.port, this.address, () => {
                    console.log(`Server started at: ${this.address}:${this.port}`);
                });    
            }
            */
        }
    }


    let endpoint = new test_EndPoint({
        app_handles_subscriptions : true,
        port : 5111,
        address : "192.168.1.1",
        tls : false

    })
    t.is(endpoint.port,5111)
    t.is(endpoint.options,undefined)
    t.is(endpoint.use_tls,false)

    let endpoint_tls = new test_EndPoint({
        app_handles_subscriptions : true,
        port : 5111,
        address : "192.168.1.1",
        tls : {
            server_key : "A file name",
            server_cert : "A file name",
            client_cert : "A file name"
        }

    })
    t.is(endpoint_tls.port,5111)
    t.is(endpoint_tls.options.key,true)
    t.is(endpoint_tls.options.cert,true)
    t.is(endpoint_tls.options.ca[0],true)
    t.is(endpoint_tls.tls_conf.server_key,"A file name")
    t.is(endpoint_tls.tls_conf.server_cert,"A file name")
    t.is(endpoint_tls.tls_conf.client_cert,"A file name")
    t.is(endpoint_tls.use_tls,true)

    // RELAY

    let relay = new test_MessageRelay({
        app_handles_subscriptions : true,
        port : 5111,
        address : "192.168.1.1",
        tls : false,

        "path_types" : {
            "winding" : {
                "relay" : {
                    "junk" : "junk"
                }
            }
        },
        "path_handler_factory" : (a_path,conf,anythinv) =>  {
            return a_path + " from path_handler_factory"
        }
    })
    t.is(relay.port,5111)
    t.is(relay.options,undefined)
    t.is(relay.use_tls,false)

    let relay_tls = new test_MessageRelay({
        port : 5111,
        address : "192.168.1.1",
        tls : {
            server_key : "A file name",
            server_cert : "A file name",
            client_cert : "A file name"
        },

        "path_types" : {
            "winding" : {
                "relay" : {
                    "junk" : "junk"
                }
            }
        },
        "path_handler_factory" : (a_path,conf,anythinv) => {
            return a_path + " from path_handler_factory"
        }
    })

    t.is(relay_tls.port,5111)
    t.is(relay_tls.options.key,true)
    t.is(relay_tls.options.cert,true)
    t.is(relay_tls.options.ca[0],true)
    t.is(relay_tls.tls_conf.server_key,"A file name")
    t.is(relay_tls.tls_conf.server_cert,"A file name")
    t.is(relay_tls.tls_conf.client_cert,"A file name")
    t.is(relay_tls.use_tls,true)

    
    let mrc = new test_MessageRelayClient({
        attempt_reconnect : false,
        port : 5111,
        address : "192.168.1.1",
        tls : false

    })
    t.is(mrc.port,5111)
    t.is(mrc.options,undefined)
    t.is(mrc.use_tls,false)

    let mrc_tls = new test_MessageRelayClient({
        attempt_reconnect : false,
        port : 5111,
        address : "192.168.1.1",
        tls : {
            server_key : "A file name",
            server_cert : "A file name",
            client_cert : "A file name"
        }

    })
    t.is(mrc_tls.port,5111)
    t.is(mrc_tls.options.key,true)
    t.is(mrc_tls.options.cert,true)
    t.is(mrc_tls.options.ca[0],true)
    t.is(mrc_tls.tls_conf.server_key,"A file name")
    t.is(mrc_tls.tls_conf.server_cert,"A file name")
    t.is(mrc_tls.tls_conf.client_cert,"A file name")
    t.is(mrc_tls.use_tls,true)

})





test('Message via Unix domain sockets -- configuration special', async t => {


    class UDSEndpoint extends MessageEndpoint {
        constructor(conf) {
            super(conf)
        }

        app_message_handler(msg_obj) {
            console.log("UDS ENDPOINT!!")
            console.dir(msg_obj)
            return({ "status" : "OK" })
        }
    }


    class UDSMEssenger extends MessageRelayClient {
        constructor(conf) {
console.log("BEFORE MessageRelayClient CONSCTRUCTOR")
            super(conf)
console.log("UDS MESSENGR CONSCTRUCTOR")
        }

    }


    let test_path = `${__dirname}/my_test_pipe`
    let conf = {
        "uds_path" : test_path,
        "uds_path_count" : 0

    }
    let epoint = new UDSEndpoint(conf)

    let p = new Promise((resolve,reject) => {
        epoint.on('SERVER-READY_test',async () => {

            console.log("RECEIVED SERVER READY")
    
            let messngr = new UDSMEssenger(conf)

            messngr.on('client-ready',async (pipe,should_be_UDS) => {
                //
                console.log(`CAN SEND MESSAGES ON  ${should_be_UDS} pipe ${pipe}`)
                //
                console.log("Sending messages UDS TEST")
                //
                await messngr.send_op_on_path({
                    "data" : "this is the message",
                    "client" : "client 1"
                },"tests-uds","W");
                //
                let response = await messngr.send_op_on_path({
                    "data" : "this is the second message",
                    "client" : "client 1"
                },"tests-uds","W");

console.dir(response)
                //
console.log("closing client")
                messngr.closeAll();
console.log("closing server")
                epoint.closeAll();
                resolve(true)
                //
            })
        })
    })

    try {
        await p;
        t.pass("handlers ran")
    } catch (e) {
        t.fail("handler promeise error caught")
    }

})