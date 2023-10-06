'use strict';

const MRC = require('./message_relay_client')

const EventEmitter = require('events')
const dgram = require('dgram');

const UDP_TYPE = 'udp4'



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


/**
 * Provides and interface for the genralized communicator to use.
 * The `write` method will take in buffer data 
 * The dgram socket does not implement `write`; so, this provides an alias for `send`.
 */
class UPDWriter extends EventEmitter {

    constructor(socket) {
        super()
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
class Client extends MRC {

    constructor(conf,wrapper) {
        super(conf,wrapper)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * 
     * @param {object} conf 
     */
    _init_members(conf) {
        this.udp_type = conf ? conf.udp4or6 || UDP_TYPE : UDP_TYPE
        super._init_members(conf)
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * 
     * @param {object} conf 
     */
    _create_connection(conf) {
        if ( this.files_only ) {
            (async () => { await this._setup_file_output(conf) })()
        } else {
            this.attempt_reconnect = (conf.attempt_reconnect !== undefined) ? conf.attempt_reconnect : false
            if ( this.attempt_reconnect ) {
                this._configure_reconnect(conf)
            }
            this._connect()
            this._setup_connection_handlers(this,conf) 
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // // // // // // 

    // CONNECTION
    /**
     * 
     */
    _connect() {
        // PUBLIC   // but expect packet level encryption
        this.socket = dgram.createSocket(this.udp_type);
        // port and address of the remote
        this.socket.connect(this.port, this.address);    // makes a UDP connection 
    }


    //
    /**
     * 
     */
    _connection_handler() {
        super._connection_handler(true)
        this.writer = new UPDWriter(this.socket)
        this.emit('client-ready',this.address,this.port)
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
