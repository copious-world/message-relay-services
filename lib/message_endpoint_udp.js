'use strict';
 
// an intermediate endpoint implementation
//
const Server = require('./message_endpoint')
const EventEmitter = require('events')
const dgram = require('dgram')

const UDP_TYPE = 'udp4'
const NOISY = false

const BIG_TIMEOUT_INTERVAL = 1000*60*30


class NOOPWriter extends EventEmitter {
    constructor() {
        super()
    }
    write(message) {}
}


/**
 * 
 */
class UDPWriter extends EventEmitter {

    constructor(address,port,connection) {
        super()
        // this is a child process sending generically to the parent the process.send
        this.readyState = (typeof process.send === "function") ? 'open' : 'closed'
        this.con = connection
        this.address = address
        this.port = port
    }

    //
    write(message) {  // passed in as a buffer
        if ( !this.con ) return
        this.con.send(message,0,message.length,this.port,this.address) // send back to this one
    }

}



//
/**
 * Creates an endpoint server for connected sockets. 
 * This differs from other servers in that it can be configured to respond or not respond to messages.
 * Also, instances can be configured to keep client information or disgard it.
 * The storage of the client information for such things as handling publications and subscriptions is under the 
 * control of the client by setting `_no_resp` and `no_keeps`. When `_no_resp` the server will not respond to messages.
 * If `no_keeps` is false, the default, then this will store connections by keys made from the port and address of the remote in a 
 * timeout map.
 */
class ServerUDP extends Server {
    //
    constructor(conf) {
        super(conf)
        this.time_out_table = {}
        this.no_op_writer = new NOOPWriter()
        this.no_keeps = conf.no_keeps ? true : false
        this.use_broadcast = false
        this.broadcast_address = conf.broadcast_address
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    /**
     * 
     * @param {boolean} bval 
     */
    set_use_broadcast(bval) {
        if ( this.connection !== undefined ) {
            this.use_broadcast = bval
            this.connection.setBroadcast(bval)
        } else {
            this.use_broadcast = false
        }
    }

    /**
     * 
     * @returns {boolean} - if the broadcast option is in use
     */
    get_use_broadcast() {
        return this.use_broadcast
    }


    // send_to_all
    //  send to all connections on the topic except the one that published
    /**
     * Adds to the parent implementation and uses some of its code for the default case.
     * 
     * @param {*} topic 
     * @param {*} msg_obj 
     * @param {*} ignore 
     * @returns 
     */
    async send_to_all(topic,msg_obj,ignore) {     // publish to all conncetions (fan out)
        if ( this.app_can_block_and_respond ) {
            let blocked = await this.app_publication_pre_fan_response(topic,msg_obj,ignore)
            if ( blocked ) return
        }
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        if ( tset ) {
            // USE BROADCAST
            if ( this.use_broadcast && this.connection ) {
                let str_msg = relayer.encode_message(msg_obj)           // BROADCAST ADDRESS
                this.connection.send(str_msg,0,str_msg.length,this.port,this.broadcast_address)
            } else {
                // USE INDIVIDUAL KEPT CONNECTIONS
                for ( let client_name in tset ) {     // all clients
                    let relayer = tset[client_name] 
                    this.send_to_one(relayer,msg_obj)
                    if ( relayer && (relayer.writer !== ignore) ) {
                        this.send_to_one(relayer,msg_obj)
                    }
                }
                //
            }
            if ( this.app_handles_subscriptions ) {     // (override) this application acts as an endpoint to the topic
                this.app_subscription_handler(topic,msg_obj)
            }
        }
    }



    /**
     * 
     * @param {object} conf 
     */
    _init_members(conf) {
        super._init_members(conf)
        this.udp_type = conf ? conf.udp4or6 || UDP_TYPE : UDP_TYPE
        this.time_out_interval = setInterval(() => {
            let t = Date.now()
            let removals = []
            for ( let [client_name,access_time] of Object.entries(this.time_out_table) ) {
                if ( t - access_time > BIG_TIMEOUT_INTERVAL*3 ) {
                    this.remove_connection(client_name)
                    removals.push(client_name)
                }
            }
            for ( let cname of removals ) {
                this.remove_connection(cname)
            }
        },BIG_TIMEOUT_INTERVAL)
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * 
     * @param {object} sock - the expected UDP socket returned by node.js dgram.createSocket
     */
    onListenting_func(sock) {
        // // 
        //
        sock.on('message', async (data, rinfo) => {
            //
            let client_name = `${rinfo.address}:${rinfo.port}`;
            if ( NOISY ) console.log(`new client connected: ${client_name}`);
            //
            try {
                let dstr = data.toString()
                let mobj = JSON.parse(dstr)
                //
                let prev_writer = this.has_connection(client_name)  // returns a wrapper of the UDPWriter 
                if ( prev_writer === false ) {
                    let a_writer = mobj._no_resp ? this.no_op_writer : new UDPWriter(rinfo.address,rinfo.port,sock);
                    this.add_connection(client_name,a_writer)
                }
                //
                await this.add_object_and_react(client_name,mobj)   // this is usually supposed to be a response to a previous send
                if ( !this.no_keeps && (mobj._ps_op && ( mobj._ps_op == 'sub' || mobj._ps_op == 'pub' )) ) {
                    this.time_out_table[client_name] = Date.now()
                } else {
                    this.remove_connection(client_name)
                }
            } catch (e) {}
        });
        //
        sock.on('close', () => {
            //sock.disconnect()
        });
        //
        sock.on('error', (err) => {
            console.error(`Connection ${client_name} error: ${err.message}`);
        });
        //
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    /**
     * 
     */
    _create_connection() {
        //
        this.connection = dgram.createSocket(this.udp_type)

        this.connection.on('listening',() => {
            const address =  this.connection.address();
            console.log(`server listening ${address.address}:${address.port}`);
            this.onListenting_func(this.connection)
            this.emit('server-ready')
        })

        if ( this.address !== undefined ) {
            this.connection.bind(this.port,this.address)
        } else {
            this.connection.bind(this.port)   // listen on all interface
        }
        //
    }

}

//
module.exports = ServerUDP;
