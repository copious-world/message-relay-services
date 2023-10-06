




let MessageRelayUDP = require('../lib/message_relay_udp');
let ServerUDP = require('../lib/message_endpoint_udp')
let {MessageRelay,ServeMessageEndpoint} = require('../index')

let MessageRelayContainer = require('../client-producer/cprod')
let MessageRelayManager = require('../client-producer/cmanager')

let MulticastClient = require('../lib/message_relay_multicast')
let MulticastEndpoint = require('../lib/message_endpoint_multicast')


async function test1() {
    //
    let conf = {
        "address" : "localhost",
        "port" : 5555
    }
    //
    let mru = new MessageRelayUDP(conf)
    mru.set_on_path({ "command" : "this is a test" })
}


async function test2() {
    //
    let conf = {
        "address" : "localhost",
        "port" : 5555
    }
    //
    let sudp = new ServerUDP(conf)

    await test1()
}


async function cprod_test() {

    let conf = {
        "address" : "localhost",
        "port" : 5555
    }


    let uconf = {
        "address" : "localhost",
        "port" : 4545
    }

    let endpoint = new ServeMessageEndpoint(conf)  // This is the perm service the relay client wants to connect to.

    let relay_proxy = new MessageRelayContainer(uconf,false,MessageRelay)  // this would replace the declaration of MessageRelay in current operations

    relay_proxy.on('client-ready',() => {  // this is the response for connecting to the perm server
        relay_proxy.set_on_path({ "command" : "this is a test CPROD" },'big-test')
    })

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // Now provide a utility that tells the waiting client UDP server that there is a perm server (endpoint)
    //
    let msg_obj = {
        "address" : "localhost",
        "port" : 5555
    }

    // the utility calls out to the MessageRelayContainer in UDP mode
    let mru = new MessageRelayUDP(uconf)    // connect to the proxy server with a UDP client
    // inform the MessageRelayContainer that there is a server (endpoint) for connection
    mru.set_on_path(msg_obj,'big-test')     // send IP::PORT to endpoint  ===  relay_proxy.app_message_handler(msg_obj)
    //
    // after this, 'client-ready' should report...
    //
}



async function mprod_test() {   // this is a test of the connection manager.

    let conf = {
        "address" : "localhost",
        "port" : 5555
    }

    let uconf = {
        "address" : "localhost",
        "port" : 4545
    }

    let endpoint = new ServeMessageEndpoint(conf)  // This is the perm service the relay client wants to connect to.

    // this would be declared globably in the program as a resource for many clients to use
    //
    let relay_manager = new MessageRelayManager(uconf)

    // 
    conf._connection_manager = relay_manager
    conf._connect_label = "TEST-CONNECT"
    let relay = new MessageRelay(conf)   // the relay is fine, it is not connected yet
    // this won't fire until the relay_manager receives a messag from the utility.
    relay.on('client-ready',() => {  // this is the response for connecting to the perm server
        relay.set_on_path({ "command" : "this is a test MPROD -- manager" },'big-test')
    })

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // Now provide a utility that tells the waiting client UDP server that there is a perm server (endpoint)
    //
    let msg_obj = {
        "address" : "localhost",
        "port" : 5555
    }

    // the utility calls out to the MessageRelayManager in UDP mode
    let mru = new MessageRelayUDP(uconf)    // connect to the proxy server with a UDP client
    // inform the MessageRelayContainer that there is a server (endpoint) for connection
    mru.set_on_path(msg_obj,'big-test')     // send IP::PORT to endpoint  ===  relay_manager.app_message_handler(msg_obj)
    //
    // after this, 'client-ready' should report...
    //
}





/*
let MulticastClient = require('../lib/message_relay_multicast')
let MulticastEndpoint = require('../lib/message_endpoint_multicast')
*/


async function mcast_test() {   // this is a test of the connection manager.

    let conf = {
        "address" : "localhost",
        "port" : 5555,
        "multicast_port_map" : { "topic0" : 5556, "topic1" : 5557, "topic2" : 5558 }
    }

    let endpoint = new MulticastEndpoint(conf)  // This is the perm service the relay client wants to connect to.

    // this would be declared globably in the program as a resource for many clients to use
    //
    let promises = []
    let relays = []
    for ( let i = 0; i < 3; i++ ) {
        //
        let mrelay = new MulticastClient(conf)
        relays.push(mrelay)
        //
        let handler = (msg) => {
            console.dir(msg)
        }
        mrelay.on('client-ready',() => {  // this is the response for connecting to the perm 
            let message = {}
            mrelay.subscribe(`topic${(t+1)%3}`,"ALL-TESTS",message,handler)
            mrelay.subscribe(`topic${(t+2)%3}`,"ALL-TESTS",message,handler)
            promises.push(new Promise((resolve,reject)=> {
                setTimeout(() => {
                    resolve(true)
                }, 1000)
            }))
        })
    }

    await Promise.all(promises)
    for ( let i = 0; i < 3; i++ ) {
        let relay = relays[i]
        relay.publish(`topic${t}`,"ALL-TESTS",{ "msg" : `this is a test ${i}` })
    }

}







//test1()
test2()

