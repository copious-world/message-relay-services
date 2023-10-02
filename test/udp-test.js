




let MessageRelayUDP = require('../lib/message_relay_udp');
let ServerUDP = require('../lib/message_endpoint_udp')



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
}


//test1()
test2()

