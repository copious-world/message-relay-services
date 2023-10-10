'use strict';

const MRUDP = require('./message_relay_udp')
const dgram = require('dgram');

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


const DEFAULT_MULTICAST_ADDR = '224.0.0.1'


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

    // // // // // // 

    // ---- ---- ---- ---- ---- ---- ----
    /**
     * 
     * @param {string} topic 
     * @param {string} path 
     * @param {object} message 
     * @param {Function} handler 
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

        if ( this.subcriptions[`update-${topic}-${path}`] !== undefined ) {
            return false
        }

        let p = new Promise((resolve,reject) => {

            let client = dgram.createSocket(this.udp_type);   // listen on a different port

            client.on('listening',  () => {
                //
                let address = client.address();
                console.log('UDP Client listening on ' + address.address + ":" + address.port);
                client.setBroadcast(true)
                client.setMulticastTTL(128); 
                client.addMembership(this.multicast_addr);
                //
                this.subcriptions[`update-${topic}-${path}`] = client
                resolve(true)
            });

            client.on('message', (mbuffer, remote) => { 
                // This service port is set aside for just this topic, so message handling will be different
                // than for the typical client as there is no need to discern if the message is a response or not.
                // in the message relay client, `this._handle_unsolicited(message)` takes in the parsed message and emits
                // an event handled by the communicator in order to identify the callback, here called `handler`.
                // Also, since the message is on TCP or similar, the partial messages are queued and popped after earlier messages if
                // they are on the queue. 
                // This handler takes the messages immediatelly from the port and assumes the message is parseable JSON.
                // The parsed object is passed to th handler without any tick for the JS queue.
                let message = mbuffer.toString()
                try {
                    let mobj = JSON.parse(message)
                    handler(mobj, remote)
                } catch (e) {
                    console.log(e)
                }
            });
    
            client.on('error',(err) => {
                console.log("SUBSCRIBER",err)
                reject(false)
            })
            
            client.bind(this.multicast_port_map[topic]);
        
        })
        //
        message._ps_op = "sub"
        message.topic = topic
        message._m_path = path
        //
        try {
            let promises = []
            promises.push(p)
            promises.push(this.sendMessage(message))
            return await Promise.all(promises)         
        } catch (e) {
            console.log(e)
            return false
        }
    }


    /**
     * 
     * @param {string} topic 
     * @param {string} path 
     * @returns 
     */
    async unsubscribe(topic,path) {
        if ( !(topic) || !(path) ) return false
        let client = this.subcriptions[`update-${topic}-${path}`]
        if ( client ) {
            client.dropMembership(this.multicast_addr)
            client.close()
        }
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


}

//
module.exports = Client;
module.exports.Communicator = MRUDP.Communicator
