'use strict';
 
// load the Node.js TCP library
const net = require('net');
const PORT = 1234;
const HOST = 'localhost';


const NOISY = true

let g_messenger_connections = {}


class Replier {
    constructor(pars) {
        this.sock = pars.sock
        this.last_message = ''
        this.message_queue = []
        this.server = pars.server
        this.client_name = pars.client_name
    }
    //

    dequeue_messages() {
        if ( this.message_queue.length ) {
            let msg_obj = this.message_queue.shift()
            if (  msg_obj ) {
                if ( msg_obj.ps_op === 'sub' ) {            // ps_op a pub/sub operation
                    let topic = msg_obj.topic
                    this.server.add_to_topic(topic,this.client_name,this)
                    let response_id = msg_obj._response_id
                    let response = { "_response_id" : response_id, "state" : "OK" }
                    this.sock.write(JSON.stringify(response))
                } else if ( msg_obj.ps_op === 'pub' ) {     // ps_op a pub/sub operation
                    let topic = msg_obj.topic
                    let ignore = this.sock
                    this.server.send_to_all(topic,msg_obj,ignore)
                    let response_id = msg_obj._response_id
                    let response = { "_response_id" : response_id, "state" : "OK" }
                    this.sock.write(JSON.stringify(response))
                } else {
                    let response_id = msg_obj._response_id
                    let response = this.server.app_message_handler(msg_obj)
                    response._response_id = response_id
                    this.sock.write(JSON.stringify(response))
                }
            }
        }
    }

}

//
class Server {
    //
    constructor(conf) {
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        //
        this.all_topics = {}
        //
        this.init();
    }

    message_complete(mescon) {
        let msg = mescon.last_message
        msg = msg.trim()
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

    //
    add_to_topic(topic,client_name,relayer) {
        let tset = this.all_topics[topic]
        if ( tset == undefined ) {
            tset = {}
            this.all_topics[topic] = tset
        }
        tset[client_name] = relayer
    }

    //
    send_to_all(topic,msg_obj,ignore) {
        let tset = this.all_topics[topic]
        if ( tset ) {
            for ( let t in tset ) {
                let relayer = tset[t]
                if ( (relayer.sock !== ignore) && (relayer.sock.readyState === 'open') ) {
                    let str_msg = JSON.stringify(msg_obj)
                    relayer.sock.write(str_msg)
                }
            }
        }
    }

    remove_from_all_topics(client_name) {
        for ( let topic in this.all_topics ) {
            let tset = this.all_topics[topic]
            if ( tset ) {
                delete tset[client_name]
            }
        }
    }


    init() {
        //
        let server = this;

        let onClientConnected_func = (sock) => {
            // // // 
            let client_name = `${sock.remoteAddress}:${sock.remotePort}`;
            if ( NOISY ) console.log(`new client connected: ${client_name}`);
            //
            g_messenger_connections[client_name] = new Replier({
                'sock' : sock,
                'server' : server,
                'client_name' : client_name
            })
            //
            sock.on('data', (data) => {
                let mescon = g_messenger_connections[client_name]
                mescon.last_message += data.toString()
                //
                mescon.last_message = server.message_complete(mescon)
                if ( mescon.message_queue.length ) {
                    mescon.dequeue_messages()
                }
            });
            //
            sock.on('close', () => {
                let mescon = g_messenger_connections[client_name]
                mescon.sock.end()
                delete g_messenger_connections[client_name]
                server.remove_from_all_topics(client_name)
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
    }

    //
    app_message_handler(msg_obj) {
        console.log("Descendent must implement app_message_handler")
        return("OK")
    }

}
module.exports = Server;
