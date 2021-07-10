'use strict';
 
// load the Node.js TCP library
const net = require('net');
const tls = require('tls');
const fs = require('fs');

const PORT = 1234;
const HOST = 'localhost';

//
const NOISY = true

const Path_handler_factory = require('../path-handler')
const JSONMessageQueue = require('../json-message-queue')


class JsonMessageHandler extends JSONMessageQueue {
    //
    constructor(initObj) {
        super(false)
        this.set_decoder(this.decode_message)
        this.sock = initObj.sock
        this.server = initObj.server
        this.client_name = initObj.client_name
        this.handlers_by_path = {}
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    async dequeue_and_forward() {
        while ( this.message_queue.length !== 0 )  {
            //
            this.dequeue()
            //
            let path = (this.current_message ? this.current_message._m_path : undefined)
            if ( path ) {
                let path_handler = this.message_paths[path]
                if ( path_handler === undefined ) {
                    this.sock.write("ERROR: paths improperly loaded in service")
                }
                if ( path_handler && (typeof path_handler.send === 'function') ) {
                    // defer to the path handler how to take care of operations...
                    let op = this.current_message._tx_op
                    switch ( op ) {
                        case "G" : {
                            let old_response_id = this.current_message._response_id
                            let result = await path_handler.get(this.current_message)
                            result = result !== false ? result : "ERROR"
                            if ( typeof result === "string" ) {
                                let response = {
                                    "_response_id" : old_response_id,
                                    "msg" : result
                                }
                                this.sock.write(JSON.stringify(response))    
                            } else {
                                result._response_id = old_response_id
                                this.sock.write(JSON.stringify(result)) 
                            }
                            break;
                        }
                        case "D" : {
                            let old_response_id = this.current_message._response_id
                            let result = await path_handler.del(this.current_message)
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.sock.write(JSON.stringify(response))
                            break;
                        }
                        case "S" :
                        default : {  // sending forward op message or any other message. May be a subscription..
                            let result = false
                            let old_response_id = this.current_message._response_id
                            if (  (typeof this.current_message._ps_op !== undefined ) && (this.current_message._ps_op !== 'pub') ) {
                                // take care of handlers 
                                if (  this.current_message._ps_op === 'sub'  ) {
                                    // path
                                    let topic = this.current_message.topic
                                    let listener = ((sock,tt) => {
                                                        return (msg) => {
                                                                msg.topic = tt
                                                                let forwarded = this.encode_message(msg)
                                                                sock.write(forwarded)
                                                            }
                                                        }
                                                    )(this.sock,topic)
                                    this.handlers_by_path[path] = listener  // for a generic cleanup
                                    path_handler.subscribe(topic,this.current_message,listener)
                                    result = "OK"
                                } else if (  this.current_message._ps_op === 'unsub'  ) {
                                    let topic = this.current_message.topic
                                    path_handler.unsubscribe(topic,this.current_message,listener)
                                    result = "OK"
                                }
                            } else {
                                result = await path_handler.send(this.current_message)
                            }
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.sock.write(JSON.stringify(response))
                            break;
                        }
    
                    }
                } else {
                    this.sock.write("ERROR")
                }
            }
        }
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    cleanup() {
        let path = this.current_message._m_path
        let path_handler = this.message_paths[path]
        if ( path_handler ) {
            let listener = this.handlers_by_path[path]
            if ( listener ) path_handler.request_cleanup(listener)
        }
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
}


class Server {
    //
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    constructor(conf,fanoutRelayer) {
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        //
        this.use_tls = conf.tls !== undefined
        this.tls_conf = conf.tls
        //
        let path_types = conf.path_types
        let ph_factory = Path_handler_factory
        if ( conf.path_handler_factory && (typeof conf.path_handler_factory === 'string') ) {
            ph_factory = require(conf.path_handler_factory )            // for application requiring more than the included factory.
        }
        for ( let a_path in path_types ) {
            let mpath = ph_factory(a_path,path_types[a_path],fanoutRelayer)
            this.message_paths[a_path] = mpath
        }

        this.init();
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    init() {
        //
        let server = this;

        let onClientConnected_func = (sock) => {
            // // // 
            let client_name = `${sock.remoteAddress}:${sock.remotePort}`;
            if ( NOISY ) console.log(`new client connected: ${client_name}`);
            //
            // CREATE A MESSAGE HANDLER OBJECT
            this.messenger_connections[client_name] = new JsonMessageHandler({
                'sock' : sock,
                'server' : server,
                'client_name' : client_name
            })
            //
            //
            // RESPOND TO DATA ... when ready, use the data handler object to determine the fate of the message.
            sock.on('data', (data) => {
                let mescon = this.messenger_connections[client_name]
                mescon.add_data(data)
                mescon.message_complete()
                if (  mescon.message_queue.length  ) {
                    (async () => { await mescon.dequeue_and_forward() })();
                }
            });
            //
            sock.on('close', () => {
                let mescon = this.messenger_connections[client_name]
                mescon.cleanup()
                delete this.messenger_connections[client_name]
            });
            //
            sock.on('error', (err) => {
                console.error(`Connection ${client_name} error: ${err.message}`);
            });
            //
        }

        // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
        if ( !(this.use_tls) ) {
            server.connection = net.createServer(onClientConnected_func);
        } else {
            const options = {
                key: fs.readFileSync(this.tls_conf.server_key),
                cert: fs.readFileSync(this.tls_conf.server_cert),
                requestCert: true,  // using client certificate authentication
                ca: [ fs.readFileSync(this.tls_conf.client_cert) ] //client uses a self-signed certificate
            };
            server.connection = tls.createServer(options,onClientConnected_func);    
        }

        server.connection.listen(this.port, this.address, () => {
            console.log(`Server started at: ${this.address}:${this.port}`);
        });
        //
        //
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
}
module.exports = Server;
