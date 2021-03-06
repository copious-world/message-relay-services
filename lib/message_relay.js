'use strict';
 
// load the Node.js TCP library
const net = require('net');
const PORT = 1234;
const HOST = 'localhost';

//
const NOISY = true

const Path_handler_factory = require('../path-handler')

let g_messenger_connections = {}
let g_message_paths = {}


class JsonMessage {
    //
    constructor(initObj) {
        this.sock = initObj.sock
        this.message_queue = []
        this.server = initObj.server
        this.client_name = initObj.client_name

        this.last_message = ''
        this.current_message = {}
        this.handlers_by_path = {}
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    add_data(data) {
        this.last_message += data.toString()
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //

    message_complete(mescon) {
        let msg = mescon.last_message
        msg = msg.trim()
        console.log(msg)
        if ( !(msg.length) ) return ""
        //
        msg = msg.replace(/\}\s+\{/g,'}{')
        let raw_m_list = msg.split('}{')
        let rest = ""
        let n = raw_m_list.length
        for ( let i = 0; i < n; i++ ) {
            rest = raw_m_list[i]
            let str = rest
            if ( i < (n-1) ) str += '}'
            if ( i > 0 ) str = '{' + str
            try {
                let m_obj = JSON.parse(str)
                mescon.message_queue.push(m_obj)
            } catch (e) {
                console.log(e)
                return(rest)
            }
        }
        return("")
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    async forward_op() {
        while ( this.message_queue.length !== 0 )  {
            this.current_message = this.message_queue.shift()
            let path = (this.current_message ? this.current_message.m_path : undefined)
            if ( path ) {
                let path_handler = g_message_paths[path]
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
                            if (  this.current_message.ps_op === 'sub'  ) {
                                // path
                                let topic = this.current_message.topic
                                let listener = ((sock,tt) => {
                                                    return (msg) => {
                                                            msg.topic = tt
                                                            sock.write(JSON.stringify(msg))
                                                        }
                                                    }
                                                )(this.sock,topic)
                                this.handlers_by_path[path] = listener
                                result = path_handler.subscribe(topic,this.current_message,listener)
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
        let path = this.current_message.m_path
        let path_handler = g_message_paths[path]
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
      
        let path_types = conf.path_types
        for ( let a_path in path_types ) {
            let mpath = Path_handler_factory(a_path,path_types[a_path],fanoutRelayer)
            g_message_paths[a_path] = mpath
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
            g_messenger_connections[client_name] = new JsonMessage({
                'sock' : sock,
                'server' : server,
                'client_name' : client_name
            })
            //
            //
            // RESPOND TO DATA ... when ready, use the data handler object to determine the fate of the message.
            sock.on('data', (data) => {
                let mescon = g_messenger_connections[client_name]
                mescon.add_data(data)

                mescon.last_message = mescon.message_complete(mescon)
                if (  mescon.message_queue.length  ) {
                    (async () => { await mescon.forward_op() })();
                }
            });
            //
            sock.on('close', () => {
                let mescon = g_messenger_connections[client_name]
                mescon.cleanup()
                delete g_messenger_connections[client_name]
            });
            //
            sock.on('error', (err) => {
                console.error(`Connection ${client_name} error: ${err.message}`);
            });
            //
        }

        server.connection = net.createServer(onClientConnected_func);

        server.connection.listen(this.port, this.address, () => {
            console.log(`Server started at: ${this.address}:${this.port}`);
        });
        //
        //
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
}
module.exports = Server;
