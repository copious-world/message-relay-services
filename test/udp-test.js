let MessageRelayUDP = require('../lib/message_relay_udp');
let ServerUDP = require('../lib/message_endpoint_udp')
let {MessageRelayer,ServeMessageEndpoint} = require('../index')

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
    mru.on('client-ready',async () => {
        let response = await mru.set_on_path({ "command" : "this is a test" })
        console.log("TEST 1",response)
    })

    let mru2 = new MessageRelayUDP(conf)
    mru2.on('client-ready',async () => {
        let response = await mru2.set_on_path({ "command" : "this is the SECOND test" })
        let response2 = await mru.set_on_path({ "command" : "this is THIRD test" })
        console.log("TEST 2",response)
        console.log("TEST 3",response2)
    })
    //
}



class AppUdpEndpoint extends ServerUDP {
    //
    constructor(conf) {
        super(conf)
    }
    //
    app_message_handler(msg_obj) {
        console.dir(msg_obj)
        return { "status" : "OK" }
    }
    //
}


async function test2() {
    //
    let conf = {
        "address" : "localhost",
        "port" : 5555
    }
    //
    let sudp = new AppUdpEndpoint(conf)

    await test1()
}





class AppEndpoint extends ServeMessageEndpoint {
    //
    constructor(conf) {
        super(conf)
    }
    //
    app_message_handler(msg_obj) {
        console.dir(msg_obj)
        return { "status" : "OK" }
    }
    //
}



async function cprod_test() {

    let conf = {
        "address" : "localhost",
        "port" : 5556
    }

    let uconf = {
        "address" : "localhost",
        "port" : 4545
    }

    let endpoint = new AppEndpoint(conf)  // This is the perm service the relay client wants to connect to.

    let relay_proxy = new MessageRelayContainer(uconf,false,MessageRelayer)  // this would replace the declaration of MessageRelayer in current operations

    relay_proxy.on('client-ready',async (relayc) => {  // this is the response for connecting to the perm server
        let result = await relayc.set_on_path({ "command" : "this is a test CPROD" },'big-test')
        console.log(result)
    })

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // The THIRD PARTY -- 
    // Now provide a utility that tells the waiting client UDP server that there is a perm server (endpoint)
    //

    // the utility calls out to the MessageRelayContainer in UDP mode
    let mru = new MessageRelayUDP(uconf)    // connect to the proxy server with a UDP client
    // inform the MessageRelayContainer that there is a server (endpoint) for connection
    //
    mru.on('client-ready',() => {  // this is the response for connecting to the perm server
        //
        let msg_obj = {
            "address" : "localhost",
            "port" : 5556
        }
        //
        mru.set_on_path(msg_obj,'big-test')     // send IP::PORT to endpoint  ===  relay_proxy.app_message_handler(msg_obj)
    })
    //
    //
    // after this, 'client-ready' should report...
    //
}



async function cmanager_test() {   // this is a test of the connection manager.

    let conf = {
        "address" : "localhost",
        "port" : 5557
    }

    let uconf = {
        "address" : "localhost",
        "port" : 4546
    }

    let endpoint = new AppEndpoint(conf)  // This is the perm service the relay client wants to connect to.

    // this would be declared globably in the program as a resource for many clients to use
    //
    let relay_manager = new MessageRelayManager(uconf)

    //  Use the config to tell th relay client that it will use a manager to field a server to connect to.
    //
    conf._connection_manager = relay_manager
    conf._connect_label = "TEST-CONNECT"            // A utility will tell the manager to use this label to identify the client *relay*
    //
    let relay = new MessageRelayer(conf)   // the relay is fine, it is not connected yet
    // this won't fire until the relay_manager receives a messag from the utility.
    relay.on('client-ready',async () => {  // this is the response for connecting to the perm server
        let result = await relay.set_on_path({ "command" : "this is a test MPROD -- manager" },'big-test')
        console.log(result)
    })

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // Now provide a utility that tells the waiting client UDP server that there is a perm server (endpoint)
    // the utility calls out to the MessageRelayManager in UDP mode
    let mru = new MessageRelayUDP(uconf)    // connect to the proxy server with a UDP client
    //
    mru.on('client-ready',() => {  // this is the response for connecting to the perm server
        //
        let msg_obj = {
            "address" : "localhost",
            "port" : 5557,
            "label" : "TEST-CONNECT"
        }
        //
        // inform the MessageRelayContainer that there is a server (endpoint) for connection
        mru.set_on_path(msg_obj,'big-test')     // send IP::PORT to endpoint  ===  relay_proxy.app_message_handler(msg_obj)
    })
    //
    // after this, 'client-ready' should report...
    //
}



async function mcast_test() {   // this is a test of the connection manager.

    let conf = {
        "address" : "localhost",
        "port" : 5558,
        "multicast_port_map" : { "topic0" : 5559, "topic1" : 5560, "topic2" : 5561 }
    }

    let endpoint = new MulticastEndpoint(conf)  // This is the perm service the relay client wants to connect to.
    let p = new Promise((resolve,reject) => {
        endpoint.on('server-ready',() => {
            console.log("SERVER READY")
            resolve(true)
        })    
    })

    await p;

    // this would be declared globably in the program as a resource for many clients to use
    //
    let promises = []
    let relays = []
    for ( let i = 0; i < 3; i++ ) {
        //
        promises.push(new Promise((resolve,reject)=> {
            //
            let mrelay = new MulticastClient(conf)
            relays.push(mrelay)
            //
            let handler = (message) => {
                console.log(`got publication @ node ${i}`)
                console.dir(message)
            }
            mrelay.on('client-ready',async () => {  // this is the response for connecting to the perm ...
                //
                let message = {}
                //
                if ( i === 0 ) {            // note that you can't use the ports over for local clients
                    console.log(`${i} is subscribing to topic1 and topic2`)
                    await mrelay.subscribe(`topic1`,"ALL-TESTS",message,handler)    
                    await mrelay.subscribe(`topic2`,"ALL-TESTS",message,handler)    
                } else if ( i == 1 ) {
                    console.log(`${i} is subscribing to topic0`)
                    await mrelay.subscribe(`topic0`,"ALL-TESTS",message,handler)
                }
                //
            })

            setTimeout(() => {
                resolve(true)
            }, 1000)
        }))

    }

    console.log("awaiting all promises.")
    await Promise.all(promises)
    console.log("continuing after resolution")
    for ( let i = 0; i < 3; i++ ) {
        let relay = relays[i]
        console.log(`PUBLISHING :: this is a test ${i} -- `)
        relay.publish(`topic${i}`,"ALL-TESTS",{ "msg" : `this is a test ${i}` })
    }

}




async function run_tests() {
    //await test2()
    //await cprod_test()
    //await cmanager_test()
    await mcast_test()
}



run_tests()

