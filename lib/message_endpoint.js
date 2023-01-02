'use strict';
 
// load the Node.js TCP library
const net = require('net');
const tls = require('tls');
const fs = require('fs');

const PORT = 1234;
const HOST = 'localhost';


const NOISY = true
const JSONMessageQueue = require('../json-message-queue')

// For pub/sub, this is an endpoint server. So, there is no forwarding, as with a relayer. Any path semantics ends here.
// If this were an MQTT server, this would be enough to be a server (except for omitted parts of the standard)
// When a sub message comes in, it means that a client somewhere upstream sent a request to receive publication.
// When a publish message comes in, it mean that a client somewhere upstream sent a request for the message to go out 
// to all the subscribers to the topic.

class Replier extends JSONMessageQueue {

    //
    constructor(pars) {
        super(false,false)
        this.writer = pars.writer
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
                    let response_id = msg_obj._response_id      // send back what came in (if it is keep track of replies)
                    // _ps_op a pub/sub operation
                    switch ( msg_obj._ps_op ) {
                        case 'sub' : {      // this client will receive 
                            this.server.add_to_topic(topic,this.client_name,this)  // this.writer... keep track 
                            break;
                        }
                        case 'pub' : {  // came in on this client and will fan out to others
                            let ignore = this.writer
                            delete msg_obj._response_id
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
                    let response = { "_response_id" : response_id, "state" : state }
                    let return_msg = this.encode_message(response)
                    this.writer.write(return_msg)     // actual reply
                } else {
                    let response_id = msg_obj._response_id
                    let response = await this.server.app_message_handler(msg_obj)
                    response._response_id = response_id
                    let return_msg = this.encode_message(response)
                    this.writer.write(return_msg)
                }
            }
        }
    }
}


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// Communicator
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

class Communicator {
    //
    constructor(conf) {
        //
        this.app_handles_subscriptions = conf ? conf.app_handles_subscriptions || false : false
        this.app_can_block_and_respond = conf ? conf.app_can_block_and_respond || false : false
        this.all_topics = {}                // pub/sub topics
        this.messenger_connections = {}
        //
        if ( conf.EndpointReplierClass ) {
            let mqClass = require(conf.EndpointReplierClass)
            this.replierClass = new mqClass(false)
        } else {
            this.replierClass = Replier
        }
        //
        this._init(conf);
    }

    _init(conf) {
        throw new Error("Application must write an init method of a descendant of class Communicator - Message Endpoint")
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    //
    add_connection(client_name,writer) {
        this.messenger_connections[client_name] = new this.replierClass({
            'writer' : writer,
            'server' : this,
            'client_name' : client_name
        })       
    }

    //
    remove_connection(client_name) {
        let mescon = this.messenger_connections[client_name]
        delete this.messenger_connections[client_name]
        this.remove_from_all_topics(client_name)
        return mescon.writer
    }

    //
    async add_data_and_react(client_name,data) {
        let mescon = this.messenger_connections[client_name]
        mescon.add_data(data)
        mescon.message_complete()
        if ( mescon.message_queue.length ) {
            await mescon.dequeue_messages()
        }
    }

    async add_object_and_react(client_name,m_obj) {
        let mescon = this.messenger_connections[client_name]
        mescon.add_object(m_obj)
        if ( mescon.message_queue.length ) {
            await mescon.dequeue_messages()
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // add_to_topic
    //  any connection that sends a subscription message to this endpoint will be included for possible publication
    add_to_topic(topic,client_name,relayer) {
        let tset = this.all_topics[topic]
        if ( tset == undefined ) {
            tset = {}
            this.all_topics[topic] = tset
        }
        tset[client_name] = relayer   // this is the Replier that called this method. This means a client somehwere asked for a subscription
        this.app_post_start_subscription(topic,client_name,relayer)
    }

    send_to_one(relayer,msg_obj) {
        if ( relayer.writer.readyState === 'open' ) {
            let str_msg = relayer.encode_message(msg_obj)
            relayer.writer.write(str_msg)     // sock made by this server managed by relayer ... pass on message
        }
    }

    // send_to_all
    //  send to all connections on the topic except the one that published
    send_to_all(topic,msg_obj,ignore) {     // publish to all conncetions (fan out)
        if ( this.app_can_block_and_respond ) {
            if ( this.app_publication_pre_fan_response(topic,msg_obj,ignore) ) return
        }
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        if ( tset ) {
            for ( let client_name in tset ) {     // all clients
                let relayer = tset[client_name] 
                this. send_to_one(relayer,msg_obj)
                if ( relayer && (relayer.writer !== ignore) ) {
                    this.send_to_one(relayer,msg_obj)
                }
            }
            if ( this.app_handles_subscriptions ) {     // (override) this application acts as an endpoint to the topic
                this.app_subscription_handler(topic,msg_obj)
            }
        }
    }


    // send_to_subset
    //  send to a subset of connections on the topic except the one that published
    //  use a characteristic function to decide to send
    send_to_subset(topic,msg_obj,ignore,characteristic) {     // publish to all conncetions (fan out)
        if ( this.app_can_block_and_respond ) {
            if ( this.app_publication_pre_fan_response(topic,msg_obj,ignore) ) return
        }
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        if ( tset ) {
            let t_count = Object.keys(test).length - 1
            for ( let client_name in tset ) {     // all clients       
                let relayer = tset[relayer]
                if ( relayer && (relayer.writer !== ignore) && (relayer.writer.readyState === 'open') && characteristic(client_name,t_count) ) {
                    let str_msg = relayer.encode_message(msg_obj)
                    relayer.writer.write(str_msg)     // sock made by this server managed by relayer ... pass on message
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

    unkown_topic(topic) {
        return (this.all_topics[topic] === undefined)
    }

    // remove_from_all_topics
    //  Usually for closing a connection... search through all topics and remove the client
    remove_from_all_topics(client_name) {
        for ( let topic in this.all_topics ) {
            this.remove_from_topics(topic,client_name)
        }
    }

    //
    app_message_handler(msg_obj) {
        console.log("Descendent must implement app_message_handler")
        return("OK")
    }

    //  app_subscription_handler
    // -- runs post fanout of publication
    app_subscription_handler(topic,msg_obj) {
        console.log("Descendent must implement app_subscription_handler")
    }

    // app_publication_pre_fan_response
    //  -- runs before writing publications
    app_publication_pre_fan_response(topic,msg_obj) {
        console.log("Descendent must implement app_publication_pre_fan_response")
        return false
    }

    //
    app_publish(topic,msg_obj) {
        let m_topic = msg_obj.topic
        if ( m_topic === undefined ) {
            msg_obj.topic = topic
        }
        if ( msg_obj._response_id !== undefined || msg_obj._response_id !== false ) {
            delete msg_obj._response_id
        }
        this.send_to_all(topic,msg_obj,false)
    }

    //
    app_publish_on_path(topic,path,msg_obj) {
        let m_topic = msg_obj.topic
        let m_path = msg_obj._m_path
        if ( m_topic === undefined ) {
            msg_obj.topic = topic
        }
        if ( m_path === undefined ) {
            msg_obj._m_path = path
        }
        if ( msg_obj._response_id !== undefined || msg_obj._response_id !== false ) {
            delete msg_obj._response_id
        }
        this.send_to_all(topic,msg_obj,false)
    }

}


//
class Server extends Communicator {
    //
    constructor(conf) {
        super(conf)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _init_members(conf) {
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        //
        this.use_tls = ((conf.tls !== undefined) && (conf.tls !== false)) || ((conf.default_tls !== undefined) && (conf.default_tls !== false))
        this.tls_conf = conf.tls
        this.default_tls = conf.default_tls
        this.extended_tls_options = ((conf.extended_tls_options !== undefined) && (conf.extended_tls_options !== false)) ? conf.extended_tls_options : false
        //
        if ( this.use_tls ) {
            this.preloaded_tls_keys = this._load_tls_keys()
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _load_tls_keys() {
        //
        let base = process.cwd()
        //
        // allow exceptions to be thrown
        if ( this.tls_conf ) {
            //
            let server_key = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_key ) {
                server_key = this.tls_conf.preloaded.server_key
            } else {
                server_key = fs.readFileSync(`${base}/${this.tls_conf.server_key}`)
            }
            //
            let server_cert = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_cert ) {
                server_cert = this.tls_conf.preloaded.server_cert
            } else {
                server_cert = fs.readFileSync(`${base}/${this.tls_conf.server_cert}`)
            }
            //
            let client_cert = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_cert ) {
                client_cert = this.tls_conf.preloaded.client_cert
            } else {
                client_cert = fs.readFileSync(`${base}/${this.tls_conf.client_cert}`)
            }

            let tls_options = {
                key: server_key,
                cert: client_cert,
                requestCert: true,
                ca: [ client_cert ]
            };

            return tls_options
        }
        //
        return false
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    onClientConnected_func(sock) {
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
        this.add_connection(client_name,sock)
        //
        sock.on('data', async (data) => {
            await this.add_data_and_react(client_name,data)
        });
        //
        sock.on('close', () => {
            this.remove_connection(client_name)
            sock.end()
        });
        //
        sock.on('error', (err) => {
            console.error(`Connection ${client_name} error: ${err.message}`);
        });
        //
    }

    _create_connection() {
        if ( !(this.use_tls) ) {
            this.connection = net.createServer((sock) => { this.onClientConnected_func(sock) })
        } else {
            if ( this.default_tls ) {
                this.connection = tls.createServer((sock) => { this.onClientConnected_func(sock) });
            } else {
                const options = this.preloaded_tls_keys;
                if ( this.extended_tls_options !== false ) {
                    options = Object.assign({},options,this.extended_tls_options)
                }
                this.connection = tls.createServer(options,((sock) => { this.onClientConnected_func(sock) }));    
            }
        }
        this.connection.listen(this.port, this.address, () => {
            console.log(`Server started at: ${this.address}:${this.port}`);
        });
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

//
module.exports = Server;
module.exports.Communicator = Communicator
module.exports.EndpointReplier = Replier
