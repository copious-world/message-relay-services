'use strict';

const fs = require('fs')
const MRC = require('./message_relay_client')


const dgram = require('dgram');

const PORT = 1234;
const HOST = 'localhost';
const UDP_TYPE = 'udp4'


const DEFAULT_MAX_RECONNECT = 20
const DEFAULT_RECONNECT_WAIT = 5


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

/**
 * 
 */
class Client extends MRC {

    constructor(conf,wrapper) {
        super(conf,wrapper)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _init_members(conf) {
        this.udp_type = conf ? conf.udp4or6 || UDP_TYPE : UDP_TYPE
        super._init_members(conf)

    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

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
    _connect() {
        // PUBLIC   // but expect packet level encryption
        this.socket = dgram.createSocket(this.udp_type);
        // port and address of the remote
        this.socket.connect(this.port, this.address);
    }

    // SET UP CONNECTION AND HANDLERS  on('close'...) on('data'...) on('error'...)
    // _setup_connection_handlers
    //
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
        client.socket.on('message',(message, rinfo) => {
            message._x_rinfo = rinfo 
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
module.exports.Communicator = Communicator
