'use strict';

const fs = require('fs')
const Communicator = require('./common_communicator')


const net = require('net');
const tls = require('tls');

const PORT = 1234;
const HOST = 'localhost';


const DEFAULT_MAX_RECONNECT = 20
const DEFAULT_RECONNECT_WAIT = 5


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

/**
 * Exposes the communicator class to standard TCP or TLS connections.
 * Useful for connection to an ServerUDP instance
 */
class Client extends Communicator {

    constructor(conf,wrapper) {
        super(conf,wrapper)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * 
     * @param {object} conf 
     */
    _init_members(conf) {
        this.socket = null
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        //
        this.use_tls = ((conf.tls !== undefined) && (conf.tls !== false)) || ((conf.default_tls !== undefined) && (conf.default_tls !== false))
        this.tls_conf = conf.tls
        this.default_tls = conf.default_tls
        this.extended_tls_options = ((conf.extended_tls_options !== undefined) && (conf.extended_tls_options !== false)) ? conf.extended_tls_options : false

        //
        this.send_on_reconnect = conf ? conf.send_on_reconnect || false : false
        //
        this.attempt_reconnect = false
        this.reconnect_wait = DEFAULT_RECONNECT_WAIT
        this.max_reconnect = DEFAULT_MAX_RECONNECT
        this.reconnect_count = 0
        //
        if ( this.use_tls ) {
            this.preloaded_tls_keys = this._load_tls_keys()
        }
    }


    /**
     * 
     * @returns {object} - tls options use in the call to `connect`
     */
    _load_tls_keys() {
        //
        let base = process.cwd()
        //
        // allow exceptions to be thrown
        if ( this.tls_conf ) {
            //
            let client_key = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_key ) {
                client_key = this.tls_conf.preloaded.client_key
            } else {
                client_key = fs.readFileSync(`${base}/${this.tls_conf.client_key}`)
            }
            //
            let client_cert = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.client_cert ) {
                client_cert = this.tls_conf.preloaded.client_cert
            } else {
                client_cert = fs.readFileSync(`${base}/${this.tls_conf.client_cert}`)
            }
            //
            let server_cert = false
            if ( this.tls_conf.preloaded && this.tls_conf.preloaded.server_cert ) {
                server_cert = this.tls_conf.preloaded.server_cert
            } else {
                if ( Array.isArray(this.tls_conf.server_cert) ) {
                    server_cert = []
                    for ( let cert_file of this.tls_conf.server_cert ) {
                        let one_cert = fs.readFileSync(`${base}/${cert_file}`)
                        server_cert.push(one_cert)
                    }
                } else {
                    server_cert = fs.readFileSync(`${base}/${this.tls_conf.server_cert}`)
                }
            }

            let tls_options = {
                // Necessary only if the server requires client certificate authentication.
                key: client_key,
                cert: client_cert,
                // Necessary only if the server uses a self-signed certificate.
                ca: Array.isArray(server_cert) ? server_cert :  [ server_cert ],
                // Necessary only if the server's cert isn't for "localhost".
                checkServerIdentity: () => { return null; },
            };
    
            return tls_options
        }
        //
        return false
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
            if ( conf._connection_manager && conf._connect_label ) {
                let c_manager = conf._connection_manager
                c_manager.add_waiting_connection(conf._connect_label,conf,(conf) => {  // bind this to the lambda
                    this._connect()
                    this._setup_connection_handlers(this,conf)     
                })
            } else {
                this._connect()
                this._setup_connection_handlers(this,conf) 
            }
        }
    }


    //
    /**
     * 
     * @param {object} conf 
     * @returns 
     */
    _init(conf) {
        //
        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }

        this._init_members(conf)
        this._create_connection(conf)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // // // // // // 

    /**
     * This is the connect method's response to a connection being made.
     */
    _connection_handler() {
        this.writer = this.socket
        this.wrap_event(this.address)
        this.reconnect_count = 0
        console.log(`Client connected to: ${this.address} :  ${this.port}`);
        if ( this.files_going ) {  // then shunting had to be set to true.. file_only has to be false
            super.restore_send(this.send_on_reconnect)
        }
        this.emit('client-ready',this.address,this.port)
    }

    // CONNECTION
    /**
     * Makes the actual connection using TPC or TLS. In node.js, this is the distinction between new Socket().connect() and tls.connect()
     */
    _connect() {
        // PUBLIC
        if ( this.use_tls === false  ) {
            this.socket = new net.Socket();
            this.socket.connect(this.port, this.address,() => { this._connection_handler() });
        } else {
            // ENCRYPTED TLS
            if ( this.default_tls ) {
                this.socket = tls.connect(this.port, this.address,() => {
                    if ( this.socket.authorized ) {
                        this._connection_handler()
                    } else {
                        this.socket.end()
                    }
                    this.writer = this.socket
                });
            } else {
                const tls_options = this.preloaded_tls_keys;
                if ( this.extended_tls_options !== false ) {
                    tls_options = Object.assign({},tls_options,this.extended_tls_options)
                }
                this.socket = tls.connect(this.port, this.address, tls_options, () => {
                    if ( this.socket.authorized ) {
                        this._connection_handler()
                    } else {
                        this.socket.end()
                    }
                    this.writer = this.socket
                });
            }
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
        client.socket.on('data',(data) => { this.client_add_data_and_react(data) });
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

    // RECONNECTION ATTEMPTS
    /**
     * 
     * @param {object} conf 
     */
    _configure_reconnect(conf) {
        this.max_reconnect = (conf.max_reconnect !== undefined) ? conf.max_reconnect : this.max_reconnect
        this.reconnect_wait = (conf.reconnect_wait !== undefined) ? conf.reconnect_wait : this.reconnect_wait
        if ( typeof this.reconnect_wait === "string" ) {
            this.reconnect_wait = parseInt(this.reconnect_wait)
        }
        this.reconnect_wait = this.reconnect_wait*1000
        this.reconnect_count = 0
    }

    /**
     * 
     * @param {object} conf 
     */
    _attempt_reconnect(conf) {
        this.reconnect_count++
        if ( this.reconnect_count < this.max_reconnect ) {
            setTimeout(() => { 
                this._setup_connection_handlers(this,conf)
            },this.reconnect_wait)
        }
    }

    closeAll() {
        this.socket.destroy();
    }

}

//
module.exports = Client;
module.exports.Communicator = Communicator
