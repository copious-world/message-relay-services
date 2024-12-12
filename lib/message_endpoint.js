'use strict';
 
// load the Node.js TCP library
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const EventEmitter = require('events')

const PORT = 1234;
const HOST = 'localhost';


const NOISY = true
const JSONMessageQueue = require('../json-message-queue');

// For pub/sub, this is an endpoint server. So, there is no forwarding, as with a relayer. Any path semantics ends here.
// If this were an MQTT server, this would be enough to be a server (except for omitted parts of the standard)
// When a sub message comes in, it means that a client somewhere upstream sent a request to receive publication.
// When a publish message comes in, it mean that a client somewhere upstream sent a request for the message to go out 
// to all the subscribers to the topic.

/**
 * 
 */
class Replier extends JSONMessageQueue {

    //
    constructor(pars) {
        super(false,false)
        this.writer = pars.writer
        this.server = pars.server
        this.client_name = pars.client_name
    }

    //
    /**
     * Takes objects off the message queue and then uses their required messages fields to select
     * the operation that will be performed. 
     * Those messages with `_ps_op` values will work a pub/sub operations.
     * Otherwise, the server `app_message_handler` will be invoked for application specific operations.
     * All types of message will call upon the writer to send responses back to the server...
     */
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
                            await this.server.send_to_all(topic,msg_obj,ignore,this)
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

/**
 * The Communicator for an endpoint server is a base class providing 
 * connection management, pub/sub subscription management, and a framework
 * of methods that an application should override.
 * 
 * This class managers a map of `messenger_connections`. The map maps client names 
 * to repliers. The default replier is the Replier class defined in this module.
 * (if reading the code, see above.)
 * 
 * How client names are constructed is up to the extending application class implementations.
 * The immediate descendant of this class is uses the information about the remote host to create a client name.
 * `client_name` = `${sock.remoteAddress}:${sock.remotePort}`.
 * 
 * 
 * The constructor for this class looks for three configuration fields:
 * 
 * * app_can_block_and_respond - if true, app_publication_pre_fan_response will be called prior to publication. (pub/sub)
 * * app_handles_subscriptions - if true, app_subscription_handler will be called after publication. (pub/sub)
 * * EndpointReplierClass - an application defined class that take the place of the Replier class defined in and exported by this module.
 * 
 */
class Communicator extends EventEmitter {
    //
    constructor(conf) {
        super()
        //
        this.app_handles_subscriptions = conf ? conf.app_handles_subscriptions || false : false
        this.app_can_block_and_respond = conf ? conf.app_can_block_and_respond || false : false
        this.all_topics = {}                // pub/sub topics
        this.messenger_connections = {}     // all connections wrappers (repliers) are kept here.
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

    /**
     * Subsclass must override this method.  A few classes exported from this module override this method. And, it is more likely those
     * classes will be extended. However, some applications may want to begin with the communicator.
     * 
     * @param {object} conf 
     */

    _init(conf) {
        throw new Error("Application must write an init method of a descendant of class Communicator - Message Endpoint")
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    //
    /**
     * Adds a new replier object to the `messenger_connections` table, keyed by `client_name`.
     * 
     * The parameter `writer` is passed to the constructor of the replier class instance.
     * 
     * @param {string} client_name 
     * @param {object} writer 
     */
    add_connection(client_name,writer) {
        this.messenger_connections[client_name] = new this.replierClass({
            'writer' : writer,
            'server' : this,
            'client_name' : client_name
        })       
    }

    /**
     * Returns the replier if the `client_name` is in the table, false otherwise.
     * 
     * @param {string} client_name 
     * @returns {object|boolean}
     */
    has_connection(client_name) {
        let con = this.messenger_connections[client_name]
        if ( con === undefined ) return false
        return con
    }


    /**
     * If the `client_name` is in the table, this deletes the entry.
     * Upon successful remove of the entry, this returns the writer uses in constructing the replier.
     * It returns false otherwise.
     * 
     * This is typically called on close with the return value being ignored. 
     * Some applications may have use for returned values.
     * 
     * @param {string} client_name 
     * @returns {object|false} 
     */
    remove_connection(client_name) {
        let mescon = this.messenger_connections[client_name]
        if ( mescon ) {
            delete this.messenger_connections[client_name]
            this.remove_from_all_topics(client_name)
            return mescon.writer    
        }
        return false
    }

    //
    /**
     * Upon receipt of a message for a paticular client, the replier is found and data is added to it. 
     * For reference of how data might be added to the replier see documentation about JSONMessageQueue.
     * This method then checks to see if data can be dequeued for the client. If it can, the messages are
     * dequeued and passed on to their handlers.
     * 
     * The data is added and checked for completion immediately. The dequeue operation is handled asynchronously.
     * 
     * @param {string} client_name 
     * @param {Buffer} data 
     */
    async add_data_and_react(client_name,data) {
        let mescon = this.messenger_connections[client_name]
        mescon.add_data(data)
        mescon.message_complete()
        if ( mescon.message_queue.length ) {
            await mescon.dequeue_messages()
        }
    }

    /**
     * This method acts in a manner similar to `add_data_and_react`.  But, the object is already parsed. 
     * So, `add_object` is called instead of `add_data`. 
     * 
     * @param {string} client_name 
     * @param {object} m_obj 
     */
    async add_object_and_react(client_name,m_obj) {
        let mescon = this.messenger_connections[client_name]
        mescon.add_object(m_obj)
        if ( mescon.message_queue.length ) {
            await mescon.dequeue_messages()
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * Any connection that sends a subscription message to this endpoint will be included for possible publication.
     * 
     * This method calls `app_post_start_subscription` for application extensions that perform operations once a 
     * client has been placed in the topic tables (maps)
     * 
     * @param {string} topic - the pub/sub topic.
     * @param {string} client_name - the key used by `messenger_connections` and will be used to set its topic set membership.
     * @param {object} relayer - the replier to be used later to send a publication to a subscriber.
     */
    add_to_topic(topic,client_name,relayer) {
        let tset = this.all_topics[topic]
        if ( tset == undefined ) {
            tset = {}
            this.all_topics[topic] = tset
        }
        tset[client_name] = relayer   // this is the Replier that called this method. This means a client somehwere asked for a subscription
        this.app_post_start_subscription(topic,client_name,relayer)
    }

    /**
     * Send a message to a particular client. This method can be used at any time.
     * However, it is used in `send_to_all`. 
     * 
     * @param {object} relayer 
     * @param {object} msg_obj 
     */
    send_to_one(relayer,msg_obj) {
        if ( relayer.writer.readyState === 'open' ) {
            let str_msg = relayer.encode_message(msg_obj)
            relayer.writer.write(str_msg)     // sock made by this server managed by relayer ... pass on message
        }
    }

    /**
     * Send a pub/sub message to subscribers.
     * Send to all connections on the topic except the one that published
     * 
     * @param {string} topic - the topic of the publication going to subscribers
     * @param {object} msg_obj - the message subscribers will receive from the publisher
     * @param {object} ignore - the writer (socket in the simplest case) which will not have data written to it for this operation
     * @param {object} replier - this parameter is available for an override
     */
    async send_to_all(topic,msg_obj,ignore,replier) {     // publish to all conncetions (fan out)  // replier ignored in generic case
        if ( this.app_can_block_and_respond ) {
            let blocked = await this.app_publication_pre_fan_response(topic,msg_obj,ignore)
            if ( blocked ) return
        }
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        if ( tset ) {
            for ( let client_name in tset ) {     // all clients
                let relayer = tset[client_name]
                this.send_to_one(relayer,msg_obj)
                if ( relayer && (relayer.writer !== ignore) ) {
                    this.send_to_one(relayer,msg_obj)
                }
            }
            if ( this.app_handles_subscriptions ) {     // (override) this application acts as an endpoint to the topic
                this.app_subscription_handler(topic,msg_obj)
            }
        }
    }



    /**
     * Send to a subset of connections on the topic except the one that published the messsage.
     * 
     * This method uses a characteristic function to decide on sending the message. The characteristic function 
     * takes a `client_name` and a count of subscribers to a topic. The characteristic function must return true
     * for the message to be sent to the client.
     * 
     * @param {string} topic - the topic of the publication going to subscribers
     * @param {object} msg_obj - the message subscribers will receive from the publisher
     * @param {object} ignore - a writer to be ignored (usually the sender)
     * @param {Function} characteristic - a test that if passed, the message will be sent to the subscriber
     */
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
    /**
     * 
     * @param {string} topic 
     * @param {string} client_name 
     */
    remove_from_topics(topic,client_name) {
        let tset = this.all_topics[topic]   // topic map
        if ( tset ) {
            delete tset[client_name]
        }
    }

    /**
     * A useful check for a number of applications.
     * 
     * @param {string} topic 
     * @returns {boolean}
     */
    unkown_topic(topic) {
        return (this.all_topics[topic] === undefined)
    }

    // remove_from_all_topics
    //  
    /**
     * 
     * Search through all topics and remove the client.
     * 
     * Usually used for closing a connection...
     * 
     * @param {string} client_name 
     */
    remove_from_all_topics(client_name) {
        for ( let topic in this.all_topics ) {
            this.remove_from_topics(topic,client_name)
        }
    }

    //
    /**
     * Applications extend this class by overriding this method. 
     * This method is the endpoint message handler for messages coming form relay clients 
     * that expect responses.
     * 
     * See the implementation of the Relay class above. It calls this method.
     * 
     * @param {object} msg_obj 
     * @returns {object} 
     */
    app_message_handler(msg_obj) {
        console.log("Endpoint descendent must implement app_message_handler")
        return({ "status" : "OK" })
    }

    // app_publication_pre_fan_response
    //  -- 
    /**
     * Runs before writing publications.
     * 
     * This runs if `app_can_block_and_respond`. A true value returned means that the application has blocked the publication.
     * 
     * Gives the application the chance to refuse a publication or to pass it based on criterea.
     * 
     * The application may take care of any operation it requires for publication prior to publishing 
     * with the intention of returning false to pass this on to publication. (One might imagine a situation
     * where the application will read a measurement from sensor and publish the message if the sensor has actually changed. The application version of this 
     * method would return false indicating that the update publication will not be blocked. The method can be used to write the new value onto 
     * the message object.)
     * 
     * The pulication method, `send_to_all` awaits the return of this method.
     * 
     * @param {string} topic 
     * @param {object} msg_obj 
     * @returns {boolean} True if this appliction will return without publishing to subscribers. False if going on to publication.
     */
     async app_publication_pre_fan_response(topic,msg_obj) {
        console.log("Descendent must implement app_publication_pre_fan_response")
        return false
    }


    //  app_subscription_handler
    // -- runs post fanout of publication
    /**
     * 
     * Applications override this method if `app_handles_subscriptions` has been set via configuration.
     * This method is called after publication of a topic message to subscribers.
     * This method gives applications the chance to handle internal publication or to make database updates (say)
     * or any other action required to manage the pub/sub process.
     * 
     * 
     * @param {string} topic 
     * @param {object} msg_obj 
     */
    app_subscription_handler(topic,msg_obj) {
        console.log("Descendent must implement app_subscription_handler")
    }

    

    /**
     * This method is always called by the `add_to_topic` method.
     * The application has the chance to perform any operation it needs to mark the beginning of a subscription 
     * and to set aside whatever resources or needed to manage the subscription.
     * 
     * @param {string} topic 
     * @param {string} client_name 
     * @param {object} relayer 
     */
    app_post_start_subscription(topic,client_name,relayer) {
        console.log("Descendent must implement app_post_start_subscription")
    }


    //
    /**
     * This method does not have to be overridden to function.
     * However, the method is available to be called by the descending application.
     * 
     * This method allows the application to publish to subscribing clients any time without sending a publication message to a server.
     * This message goes to all subscribers, external clients. (that is nothing is ignored)
     * 
     * The `_repsonse_id` of the message is deleted. This is useful when a client sends a message to the endpoint and the endpoint server
     * decides to publish the message (for whatever reason).
     * 
     * @param {string} topic 
     * @param {object} msg_obj 
     */
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
    /**
     * This method is almost the same as `app_publish`. But, it also takes a path for those
     * applications that are using message relay servers or at least the path concept. 
     * 
     * This method is also convenient for use at the application level in message relay servers.
     * 
     * @param {string} topic 
     * @param {string} path 
     * @param {object} msg_obj 
     */
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
/**
 * 
 */
class Server extends Communicator {
    //
    constructor(conf) {
        super(conf)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * 
     * @param {object} conf 
     */
    _init_members(conf) {
        let uds_path = conf.UDS_path || conf.uds_path
        if ( uds_path === undefined ) {
            this.port = conf ? conf.port || PORT : PORT
            this.address = conf ? conf.address || HOST : HOST
        } else {
            this.UDS_path = uds_path
            this.uds_path_count = 0
            if ( (conf.uds_path_count !== undefined) && !(isNaN(conf.uds_path_count)) && (conf.uds_path_count > 0) ) {
                this.uds_path_count = parseInt(conf.uds_path_count)
            }
            this.uds_server_list = {}
        }
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

    /**
     * 
     * @returns {object}
     */
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

    /**
     * 
     * @param {object} sock 
     */
    onClientConnected_func(sock,uds_path = undefined) {
        //
        if ( this.use_tls ) {
            if ( !(sock.authorized) ) {
                sock.end()
                return
            }
        }
        // 
        let client_name = ((uds_path === undefined) && (sock.remoteAddress !== undefined)) ? `${sock.remoteAddress}:${sock.remotePort}` : uds_path;
        if ( client_name === undefined ) client_name = "UDS"
        
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

    /**
     * 
     */
    _create_connection() {
        if ( (this.UDS_path === undefined) || (this.uds_path_count == 0) ) {
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
        } else {
            for ( let i = 0; i < this.uds_path_count; i++ ) {
                let uds_path = `${this.UDS_path}-$[i]`
                if ( !(this.use_tls) ) {
                    this.connection = net.createServer((sock) => { this.onClientConnected_func(sock,uds_path) })
                } else {
                    if ( this.default_tls ) {
                        this.connection = tls.createServer((sock) => { this.onClientConnected_func(sock,uds_path) });
                    } else {
                        const options = this.preloaded_tls_keys;
                        if ( this.extended_tls_options !== false ) {
                            options = Object.assign({},options,this.extended_tls_options)
                        }
                        this.connection = tls.createServer(options,((sock) => { this.onClientConnected_func(sock,uds_path) }));    
                    }
                }
                this.uds_server_list[uds_path] = this.connection
                this.connection = false
            }
        }
        //   UDS 
        if ( this.UDS_path !== undefined ) {
            if ( this.uds_path_count == 0 ) {
                let srv_runner = this
                this.connection.listen({ 'path' : this.UDS_path }, () => {
                    console.log(`Singler Server started at: ${this.UDS_path}`);
                    if ( NOISY ) srv_runner.emit('SERVER-READY_test')
                });
            } else {
                for ( let i = 0; i < this.uds_path_count; i++ ) {
                    let uds_path = `${this.UDS_path}-$[i]`
                    let connection = this.uds_server_list[uds_path]
                    connection.listen({ 'path' : uds_path }, () => {
                        console.log(`Server started at: ${uds_path}`);
                        if ( NOISY && ((i + 1) == this.uds_path_count) ) srv_runner.emit('SERVER-READY_test')
                    });
                }
            }
        } else {

console.log("LISTENING")
            this.connection.listen(this.port, this.address, () => {
                console.log(`Server started at: ${this.address}:${this.port}`);
            });    
        }

    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    /**
     * 
     * @param {object} conf 
     */
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

    closeAll() {
        if ( this.connection ) {
            this.connection.close();
        } else {
            for ( let srvr of Object.values(this.uds_server_list) ) {
                srvr.close()
            }
        }
    }
  
}

//
module.exports = Server;
module.exports.Communicator = Communicator
module.exports.EndpointReplier = Replier
