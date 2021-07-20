'use strict';
 
// load the Node.js TCP library
const net = require('net');
const tls = require('tls');
const fs = require('fs');

const PORT = 1234;
const HOST = 'localhost';

//
const NOISY = true

const Path_handler_factory = require('../path-handler/path-handler')
const JSONMessageQueue = require('../json-message-queue');
const { on } = require('events');


class JsonMessageHandler extends JSONMessageQueue {
    //
    constructor(initObj) {
        super(false,false)
        this.set_decoder(this.decode_message)
        this.sock = initObj.sock
        this.server = initObj.server
        this.client_name = initObj.client_name
        this.handlers_by_path = {}
        this.message_paths = initObj.message_paths ? initObj.message_paths : false 
    }


    async data_handler(data) {
        this.add_data(data)
        this.message_complete()
        if ( this.message_queue.length ) {
            await this.dequeue_and_forward()
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    async dequeue_and_forward() {
        //
        while ( this.message_queue.length !== 0 )  {
            //
            this.dequeue()
            //
            if ( this.message_paths === false ) continue;
            //
            let path = (this.current_message ? this.current_message._m_path : undefined)
            if ( path ) {
                let path_handler = this.message_paths[path]
                if ( path_handler === undefined ) {
                    this.sock.write("ERROR: paths improperly loaded in service")
                    return
                }
                if ( path_handler && (typeof path_handler.send === 'function') ) {
                    // defer to the path handler how to take care of operations...
                    let op = this.current_message._tx_op
                    switch ( op ) {
                        case "G" : {
                            let old_response_id = this.current_message._response_id
                            let result = await path_handler.get(this.current_message)
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.sock.write(JSON.stringify(response))
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
                            if (  (this.current_message._ps_op !== undefined ) && (this.current_message._ps_op !== 'pub') ) {
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
                                    path_handler.unsubscribe(topic)
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
        if ( path_handler ) {   // does nothing to the path handler except remove the listener
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
            ph_factory = require.main.require(conf.path_handler_factory)            // for application requiring more than the included factory.
        }
        //
        this.messenger_connections = {}
        this.message_paths = {}
        for ( let a_path in path_types ) {
            let mpath = ph_factory(a_path,path_types[a_path],fanoutRelayer)
            this.message_paths[a_path] = mpath
        }
        this.init();
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // add_message_handler
    //  -- set up the message queue for this socket connection
    add_message_handler(sock) {
        let client_name = `${sock.remoteAddress}:${sock.remotePort}`;
        if ( NOISY ) console.log(`new client connected: ${client_name}`);
        //
        // CREATE A MESSAGE HANDLER OBJECT
        this.messenger_connections[client_name] = new JsonMessageHandler({
            'sock' : sock,
            'server' : this,
            'client_name' : client_name,
            'message_paths' : this.message_paths
        })
        //
        return client_name
    }

    // onClientConnected_func
    //  -- handle a connection 
    onClientConnected_func(sock) {
        //
        //                  // add_message_handler
        let client_name = this.add_message_handler(sock)
        //
        // 1. data
        let handler = (data) => {   //... when ready, use the data handler object to determine the fate of the message.
            let mescon = this.messenger_connections[client_name]
            if ( mescon ) mescon.data_handler(data) // RESPOND TO DATA 
        }
        
        sock.on('data',handler)
        //
        //  2. close
        sock.on('close', () => {
            let mescon = this.messenger_connections[client_name]
            if ( mescon ) {
                mescon.cleanup()
                delete this.messenger_connections[client_name]
            }
        });
        //
        // 3. error
        sock.on('error', (err) => {
            console.error(`Connection ${client_name} error: ${err.message}`);
        });
    }

    init() {
        if ( !(this.use_tls) ) {
            this.net_con = net.createServer(this.onClientConnected_func);
        } else {
            const options = {
                key: fs.readFileSync(this.tls_conf.server_key),
                cert: fs.readFileSync(this.tls_conf.server_cert),
                requestCert: true,  // using client certificate authentication
                ca: [ fs.readFileSync(this.tls_conf.client_cert) ] //client uses a self-signed certificate
            };
            this.net_con = tls.createServer(options,this.onClientConnected_func);    
        }
        //
        if ( this.net_con ) {
            this.net_con.listen(this.port, this.address, () => {
                console.log(`Server started at: ${this.address}:${this.port}`);
            });    
        }
        //
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
}
module.exports = Server;
