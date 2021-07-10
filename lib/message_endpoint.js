'use strict';
 
// load the Node.js TCP library
const net = require('net');
const tls = require('tls');
const fs = require('fs');

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

    //
    async dequeue_messages() {
        if ( this.message_queue.length ) {
            let msg_obj = this.dequeue()
            if (  msg_obj ) {  // pub/sub message category
                if ( (typeof msg_obj._ps_op !== undefined) && msg_obj._ps_op ) {
                    let topic = msg_obj.topic
                    let state = "OK"
                    // _ps_op a pub/sub operation
                    switch ( msg_obj._ps_op ) {
                        case 'sub' : {      // this client will receive 
                            this.server.add_to_topic(topic,this.client_name,this)  // this.sock... keep track 
                            break;
                        }
                        case 'pub' : {  // came in on this client and will fan out to others
                            let ignore = this.sock
                            this.server.send_to_all(topic,msg_obj,ignore)
                            break;
                        }
                        case 'unsub' : {        // remove from possible subscriptions
                            this.server.remove_from_topics(topic,this.client_name)
                            break;
                        }
                        default: {  // not in pub/sub vocab
                            state = "ERR"
                        }
                    }
                    let response_id = msg_obj._response_id      // send back what came in (if it is keep track of replies)
                    let response = { "_response_id" : response_id, "state" : state }
                    let return_msg = this.encode_message(response)
                    this.sock.write(return_msg)     // actual reply
                } else {
                    let response_id = msg_obj._response_id
                    let response = await this.server.app_message_handler(msg_obj)
                    response._response_id = response_id
                    let return_msg = this.encode_message(response)
                    this.sock.write(return_msg)
                }
            }
        }
    }

}

//
class Server {
    //
    constructor(conf) {
        //
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        this.app_handles_subscriptions = conf ? conf.app_handles_subscriptions || false : false
        //
        this.use_tls = conf.tls !== undefined
        this.tls_conf = conf.tls
        //
        this.all_topics = {}
        this.messenger_connections = {}
        //
        this.init();
    }

    // add_to_topic
    //  any connection that sends a subscription message to this endpoint will be included for possible publication
    add_to_topic(topic,client_name,relayer) {
        let tset = this.all_topics[topic]
        if ( tset == undefined ) {
            tset = {}
            this.all_topics[topic] = tset
        }
        tset[client_name] = relayer
    }

    // send_to_all
    //  send to all connections on the topic except the one that published
    send_to_all(topic,msg_obj,ignore) {     // publish to all conncetions (fan out)
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        if ( tset ) {
            for ( let client_name in tset ) {     // all clients
                let relayer = tset[client_name] 
                if ( relayer && (relayer.sock !== ignore) && (relayer.sock.readyState === 'open') ) {
                    let str_msg = relayer.encode_message(msg_obj)
                    relayer.sock.write(str_msg)     // sock made by this server managed by relayer ... pass on message
                }
            }
            if ( this.app_handles_subscriptions ) {     // (override) this application acts as an endpoint to the topic
                this.app_subscription_handler(topic,msg_obj)
            }
        }
    }

    // remove_from_topics
    //  this client has requested to stop receiving publications (just take it out of the list)
    remove_from_topics(topic,client_name) {
        let tset = this.all_topics[topic]   // topic map
        if ( tset ) {
            delete tset[client_name]
        }
    }

    // remove_from_all_topics
    //  Usually for closing a connection... search through all topics and remove the client
    remove_from_all_topics(client_name) {
        for ( let topic in this.all_topics ) {
            this.remove_from_topics(topic,client_name)
        }
    }


    init() {
        //
        let server = this;

        let onClientConnected_func = (sock) => {
            //
            //
            if ( this.use_tls ) {
                if ( !(sock.authorized) ) {
                    sock.end()
                    return
                }
            }
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
