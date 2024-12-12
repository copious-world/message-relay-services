
//const test = require('ava');


const {MessageRelayer} = require('../index')
const EndpointForTest = require('./helpers/test_relay_endpoint')
const MessageRelayServer = require('../lib/message_relay')

const {
    Worker,
    isMainThread,
    setEnvironmentData,
    getEnvironmentData,
    parentPort
} = require('node:worker_threads');


//
async function testf() {
    //test('starter relay talks to more than one endpoint', t => {
    let startup_list = []

    if (isMainThread) {
        setEnvironmentData('Hello', 'World!');
        const worker1 = new Worker(__filename);
        setEnvironmentData('HelloAgain', 'World-2!');
        const worker2 = new Worker(__filename);

        let p1 = new Promise((resolve,reject) => {
            worker1.once('message', (message) => {
                console.dir(message);  // Prints 'Hello, world!'.
                startup_list.push(message)
                resolve(true)
            });
        })
        let p2 = new Promise((resolve,reject) => {
            worker2.once('message', (message) => {
                console.dir(message);  // Prints 'Hello, world!'.
                startup_list.push(message)
                resolve(true)
            });
        })

        await Promise.all([p1,p2])

        let starter_conf = {
            "port" : 9997,
            "address" : "localhost",

            "path_types" : {
                "test-endpoint-1" : {
                    "relay" : {
                        "files_only" : false,
                        "port" : 9999,
                        "address" : "localhost",
                        "max_pending_messages" : false,
                        "file_shunting" : false,
                        "max_reconnect" : 24,
                        "reconnect_wait" : 5,
                        "attempt_reconnect" : true
                    }
                },
                "test-endpoint-2" : {
                    "relay" : {
                        "files_only" : false,
                        "port" : 9998,
                        "address" : "localhost",
                        "max_pending_messages" : false,
                        "file_shunting" : false,
                        "max_reconnect" : 24,
                        "reconnect_wait" : 5,
                        "attempt_reconnect" : true
                    }
                }
            }
        }

        let starter = new MessageRelayServer(starter_conf,MessageRelayer)

        setTimeout(async () => {
            let resp = await starter.forward_message_promise({ "message" : "this is the message"}, "test-endpoint-1")
            console.log(resp)
    
    
            resp = await starter.forward_message_promise({ "message" : "this is the second message"}, "test-endpoint-2")
            console.log(resp)    
        },2000)





    } else {
        //
        console.log(getEnvironmentData('Hello'));  // Prints 'World!'.
        console.log(getEnvironmentData('HelloAgain'));  // Prints 'World!'.
        //
        let endpoint_conf = {
            "port" : 9999,
            "address" : 'localhost'
        }
        if ( getEnvironmentData('HelloAgain') !== undefined ) {
            endpoint_conf.port = 9998
        }
        //
        let e_point = new EndpointForTest(endpoint_conf)

        parentPort.postMessage({
            "port" : endpoint_conf.port,
            "address" : 'localhost'
        })
        //
    } 

}

testf()

//     t.fail("no class instance")
// })
