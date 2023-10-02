'use strict';

const MRUDP = require('./message_relay_udp')
const dgram = require('dgram');

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


const DEFAULT_MULTICAST_ADDR = '224.1.1.1'

/**
 * Provides and interface for the genralized communicator to use.
 * The `write` method will take in buffer data 
 * The dgram socket does not implement `write`; so, this provides an alias for `send`.
 */
class UPDWriter {

    constructor(socket) {
        this.socket = socket
    }

    write(data) {       // this will be buffer data (the dgram socket does not implement `write`)
        this.socket.send(data)
    }
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

/**
 * This class constructs instances with connected UDP Sockets.
 * The API methods that send objects expect responses from the UDP servers. 
 */
class Client extends MRUDP {

    constructor(conf,wrapper) {
        super(conf,wrapper)   // setup client message to a server in order to request subscription, etc.
        this.multicast_addr = conf.multicast_addr ? conf.multicast_addr : DEFAULT_MULTICAST_ADDR
        this.multicast_port_map = conf.multicast_port_map
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // // // // // // 

    // ---- ---- ---- ---- ---- ---- ----
    /**
     * 
     * @param {*} topic 
     * @param {*} path 
     * @param {*} message 
     * @param {*} handler 
     * @returns 
     */
    async subscribe(topic,path,message,handler) {
        if ( !(topic) || !(path) ) return false
        if ( (typeof message === 'function') && (handler === undefined) ) {
            handler = message
            message = {}
        } else if ( handler === undefined ) {
            return false
        } 

        let client = dgram.createSocket(this.udp_type);   // listen on a different port

        client.on('listening',  () => {
            var address = client.address();
            console.log('UDP Client listening on ' + address.address + ":" + address.port);
            client.setBroadcast(true)
            client.setMulticastTTL(128); 
            client.addMembership(this.multicast_addr);

            this.subcriptions[`update-${topic}-${path}`] = client
        });
        
        client.on('message', (message, remote) => {   
            handler(message, remote)
        });
        
        client.bind(this.multicast_port_map[topic]);

        message._ps_op = "sub"
        message.topic = topic
        message._m_path = path
        try {
            return await this.sendMessage(message)            
        } catch (e) {
            console.log(e)
            return false
        }
    }


    /**
     * 
     * @param {*} topic 
     * @param {*} path 
     * @returns 
     */
    async unsubscribe(topic,path) {
        if ( !(topic) || !(path) ) return false
        let client = this.subcriptions[`update-${topic}-${path}`]
        client.dropMembership(this.multicast_addr)
        let message = {
            "_ps_op" : "unsub",
            "topic" : topic
        }
        message._m_path = path
        try {
            return await this.sendMessage(message)            
        } catch (e) {
            console.log(e)
            return false
        }
    }
    


    // SET UP CONNECTION AND HANDLERS  on('close'...) on('data'...) on('error'...)
    // _setup_connection_handlers
    //
    /**
     * 
     * @param {object} client 
     * @param {object} conf 
     */
    _setup_connection_handlers(client,conf) {
        //
        // HANDLERS

        client.socket.on('connect',() => {
            this._connection_handler()          // connection handler
        })

        //
        client.socket.on('close', (onErr) => {
            if ( onErr ) {
                console.log(`got a closing error on ${client.address} :  ${client.port}`)
            }
            this.unwrap_event(this.address)
            console.log('Client closed');
            if ( client.attempt_reconnect ) {
                client._attempt_reconnect(conf)
            }
        })
        //
        client.socket.on('message',(message, rinfo) => {   // rinfo is ignore because this class instance connects to a particular address
            this.client_add_data_and_react(message)
        });
        //
        client.socket.on('error',async (err) => {
            this.unwrap_event(this.address)
            console.log(__filename)
            console.log(err);
            if ( client.attempt_reconnect ) {
                if ( client.reconnect_count < client.max_reconnect ) {
                    return;
                }
            }
            if ( client.file_shunting ) {
                await client._start_file_shunting(conf)
            }
        })
        //
    }

    closeAll() {
        this.socket.disconnect();
    }

}

//
module.exports = Client;
module.exports.Communicator = MRC.Communicator
