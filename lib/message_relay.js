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


// For pub/sub, this is a relay server. So, there is forwarding, whereas there is no forwarding from an endpoint.
// All pub/sub message go along a path. With the path semantics, pub/sub is broken down into subnets in some sense.
// An MQTT may correspond more to a built out endpoint server. If this were used for MQTT, it would pass messages through.
// When a sub message comes in, it means that a client somewhere upstream sent a request to receive publication from an 
// endpoint server at the end of a path. As such the path handler is given the job of handling the subscription relay.
// When a publish message comes in, it mean that a client somewhere upstream sent a request for thes messages to go out 
// to all the subscribers to the topic at an endpoint. The path handler forwards the publication to the endpoint.

// Regular messages are sent along paths. So, the relay server acts as a multiplexer/demux for messages along paths. Many clients can 
// be connected to a path, and the path handler will send the messages to endpoint on the path. If that path handler is customsized
// for an application, it might send a message out to more than one endpoint, or it might mutate that path, etc. It is left up 
// to the application do determine the nature of the path hanlders. The default path handler connects to a single endpoint.

// There is just one JsonMessageHandler per socket. So, if a subscription comes into the socket, the topic_handlers_by_path field may map
// a subscription handler for a path for the socket. When the unusb message is received, the handler in topic_handlers_by_path will be 
// recalled to remove the event lister from the PathHandler.
//

// ~140 lines
class JsonMessageHandler extends JSONMessageQueue {
    //
    constructor(initObj) {
        super(false,false)
        this.writer = initObj.writer
        this.server = initObj.server
        this.client_name = initObj.client_name
        this.topic_handlers_by_path = {}
        this.message_paths = initObj.message_paths ? initObj.message_paths : false 
        for ( let p_ky in this.message_paths ) {
            this.topic_handlers_by_path[p_ky] = {}
        }
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
                let shared_path_handler = this.message_paths[path]
                if ( shared_path_handler === undefined ) {
                    this.writer.write("ERROR: paths improperly loaded in service")
                    return
                }
                if ( shared_path_handler && (typeof shared_path_handler.send === 'function') ) {
                    // defer to the path handler how to take care of operations...
                    let op = this.current_message._tx_op
                    switch ( op ) {
                        case "G" : {
                            let old_response_id = this.current_message._response_id
                            let result = await shared_path_handler.get(this.current_message)
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.writer.write(JSON.stringify(response))
                            break;
                        }
                        case "D" : {
                            let old_response_id = this.current_message._response_id
                            let result = await shared_path_handler.del(this.current_message)
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.writer.write(JSON.stringify(response))
                            break;
                        }
                        case "S" :
                        default : {  // sending forward op message or any other message. May be a subscription..
                            let result = false
                            let old_response_id = this.current_message._response_id
                            if (  (this.current_message._ps_op !== undefined ) && (this.current_message._ps_op !== 'pub') ) {
                                // take care of handlers 
                                if (  this.current_message._ps_op === 'sub'  ) {   // sub from pub/sub on this path.
                                    // topic on path
                                    let topic = this.current_message.topic
                                    if ( topic ) {
                                        let listener = ((wrtr,tt) => {      // forward publication to the client (this socket)
                                            return (msg) => {
                                                    msg.topic = tt
                                                    let forwarded = this.encode_message(msg)
                                                    wrtr.write(forwarded)
                                                }
                                            }
                                        )(this.writer,topic)
                                        // listener is the intenral thunk 
                                        let topics = this.topic_handlers_by_path[path]                        
                                        topics[topic] = listener  // for a generic cleanup
                                        await shared_path_handler.subscribe(topic,this.current_message,listener,this)
                                        result = "OK"
                                    }
                                } else if (  this.current_message._ps_op === 'unsub'  ) {
                                    let topic = this.current_message.topic
                                    if ( topic ) {
                                        let topics = this.topic_handlers_by_path[path]                        
                                        let listener = topics[topic]
                                        await shared_path_handler.unsubscribe(topic,listener,this)   // remove this socket's handler
                                        delete topics[topic]
                                        result = "OK"    
                                    }
                                }
                            } else {  // just send the message through on this path.
                                if (  (this.current_message._ps_op !== undefined ) && (this.current_message._ps_op === 'pub') ) {
                                    result = await shared_path_handler.send_pub(this.current_message,this)
                                } else {
                                    result = await shared_path_handler.send(this.current_message)
                                }
                            }
                            // return results to sender -- message went or was copied out for publication. 
                            // Tell the sender/publisher how well the process went
                            result = result !== false ? result : "ERROR"
                            let response = {
                                "_response_id" : old_response_id,
                                "msg" : result
                            }
                            this.writer.write(JSON.stringify(response))
                            break;
                        }
                    }
                } else {
                    this.writer.write("ERROR")
                }
            }
        }
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    cleanup() {
        let path = this.current_message._m_path
        let shared_path_handler = this.message_paths[path]
        if ( shared_path_handler ) {   // does nothing to the path handler except remove the listener
            let topics = this.topic_handlers_by_path[path]
            for ( let topic in topics ) {
                let listener = topics[topic]
                shared_path_handler.unsubscribe(topic,listener,this)
                delete topics[topic]
            }
            shared_path_handler.request_cleanup()
        }
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
}

// ~60 lines 
class Communicator {
    //
    constructor(conf,fanoutRelayer) {
        // PATHWAY HANDLER CLASS DEFINITION
        let path_types = conf.path_types
        let ph_factory = Path_handler_factory
        if ( conf.path_handler_factory && (typeof conf.path_handler_factory === 'string') ) {
            ph_factory = require.main.require(conf.path_handler_factory)            // for application requiring more than the included factory.
        } else if ( conf.path_handler_factory && (typeof conf.path_handler_factory === 'function') ) {
            ph_factory = conf.path_handler_factory
        }

        if ( conf.MessageHandlerClass ) {
            let mqClass = require(conf.MessageHandlerClass)
            this.jsonMHandler = new mqClass(false)
        } else {
            this.jsonMHandler = JsonMessageHandler
        }


        this.replierClass
        //
        // PATHWAY HANDLER CONSTRUCTION
        this.messenger_connections = {}
        this.message_paths = {}
        for ( let a_path in path_types ) {
            let mpath = ph_factory(a_path,path_types[a_path],fanoutRelayer)
            this.message_paths[a_path] = mpath
        }
        // note: no pub/sub mechanism in the server proper...
        // start serving
        this._init(conf);
    }

    _init(conf) {
        throw new Error("Application must write an init method of a descendant of class Communicator - Message Relay")
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // add_connection
    //  -- set up the message queue for this socket connection
    add_connection(client_name,writer) {
        //
        if ( NOISY ) console.log(`new client connected: ${client_name}`);
        //
        // CREATE A MESSAGE HANDLER OBJECT
        this.messenger_connections[client_name] = new this.jsonMHandler({
            'writer' : writer,
            'server' : this,
            'client_name' : client_name,
            'message_paths' : this.message_paths
        })
        //
        return client_name
    }

    add_data_and_react(client_name,data) {
         //... when ready, use the data handler object to determine the fate of the message.
        let mescon = this.messenger_connections[client_name]
        if ( mescon ) mescon.data_handler(data) // RESPOND TO DATA 
    }

    close(client_name) {
        let mescon = this.messenger_connections[client_name]
        if ( mescon ) {
            mescon.cleanup()
            delete this.messenger_connections[client_name]
        }
    }
}


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

// ~60 lines
class Server extends Communicator {
    //
    constructor(conf,fanoutRelayer) {
        super(conf,fanoutRelayer)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _init_members(conf) {
        // PORT and ADDRESS
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        //
        // TLS 
        this.use_tls = ((conf.tls !== undefined) && (conf.tls !== false)) || ((conf.default_tls !== undefined) && (conf.default_tls !== false))
        this.tls_conf = conf.tls
        this.default_tls = conf.default_tls
        this.extended_tls_options = ((conf.extended_tls_options !== undefined) && (conf.extended_tls_options !== false)) ? conf.extended_tls_options : false
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // onClientConnected_func
    //  -- handle a connection 
    onClientConnected_func(sock) {
        //                  // add_connection
        let client_name = `${sock.remoteAddress}:${sock.remotePort}`;
        this.add_connection(client_name,sock)
        //
        // 1. data
        sock.on('data',((com) => { return (data) => {
            com.add_data_and_react(client_name,data)
        }})(this))
        //
        //  2. close
        sock.on('close', ((com) => { return () => {
            com.close(client_name)
        }})(this));
        //
        // 3. error
        sock.on('error', (err) => {
            console.error(`Connection ${client_name} error: ${err.message}`);
        });
    }

    //
    _create_connection() {
        if ( !(this.use_tls) ) {
            this.net_con = net.createServer((sock) => { this.onClientConnected_func(sock) });
        } else {
            if ( this.default_tls ) {
                this.net_con = tls.createServer((sock) => { this.onClientConnected_func(sock) });
            } else {
                let base = process.cwd()
                const options = {
                    key: fs.readFileSync(`${base}/${this.tls_conf.server_key}`),
                    cert: fs.readFileSync(`${base}/${this.tls_conf.server_cert}`),
                    requestCert: true,  // using client certificate authentication
                    ca: [ fs.readFileSync(`${base}/${this.tls_conf.client_cert}`) ] //client uses a self-signed certificate
                };
                if ( this.extended_tls_options !== false ) {
                    options = Object.assign({},options,this.extended_tls_options)
                }
                this.net_con = tls.createServer(options,((sock) => { this.onClientConnected_func(sock) }));    
            }
        }
        //
        if ( this.net_con ) {
            this.net_con.listen(this.port, this.address, () => {
                console.log(`Server started at: ${this.address}:${this.port}`);
            });    
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    _init(conf) {
        //
        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }
        //
        this._init_members(conf)
        this._create_connection()
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    
}


module.exports = Server;
module.exports.Communicator = Communicator
module.exports.JsonMessageHandlerRelay = JsonMessageHandler