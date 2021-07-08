'use strict';
 
// load the Node.js TCP library
const net = require('net');
const PORT = 1234;
const HOST = 'localhost';


const NOISY = true
const JSONMessageQueue = require('../json-message-queue')


class Replier extends JSONMessageQueue {

    //
    constructor(pars) {
        super(false)
        this.set_decoder(this.decode_message)
        this.sock = pars.sock
        this.server = pars.server
        this.client_name = pars.client_name
    }

    encode_message(message) {
        return JSON.stringify(message)
    }

    decode_message(message_str) {
        try {
            let message = JSON.parse(message_str)
            return message
        } catch (e) {
            return false
        }
    }

    //
    async dequeue_messages() {
        if ( this.message_queue.length ) {
            let msg_obj = this.dequeue()
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
                    let response = await this.server.app_message_handler(msg_obj)
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
        this.app_subscriptions_ok = conf ? conf.app_subscriptions_ok || false : false
        //
        this.all_topics = {}
        this.messenger_connections = {}
        //
        this.init();
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
                if ( relayer && (relayer.sock !== ignore) && (relayer.sock.readyState === 'open') ) {
                    let str_msg = JSON.stringify(msg_obj)
                    relayer.sock.write(str_msg)
                }
            }
            if ( this.app_subscriptions_ok ) {
                this.app_subscription_handler(topic,msg_obj)
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
            this.messenger_connections[client_name] = new Replier({
                'sock' : sock,
                'server' : server,
                'client_name' : client_name
            })
            //
            sock.on('data', (data) => {
                let mescon = this.messenger_connections[client_name]
                mescon.add(data)
                mescon.message_complete()
                if ( mescon.message_queue.length ) {
                    mescon.dequeue_messages()
                }
            });
            //
            sock.on('close', () => {
                let mescon = this.messenger_connections[client_name]
                mescon.sock.end()
                delete this.messenger_connections[client_name]
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

    //
    app_subscription_handler(topic,msg_obj) {
        console.log("Descendent must implement app_subscription_handler")
    }

    //
    app_publish(topic,msg_obj) {
        this.send_to_all(topic,msg_obj,false)
    }

}
module.exports = Server;
