


const UDPEndpoint = require('../lib/message_endpoint_udp')

// constructor(conf,wrapper) -- MessageRelayer  -- message relay client
// constructor(conf,wrapper) -- IPCClient -- message relay ipc
// constructor(conf,wrapper) -- IPCChildClient
// constructor(conf,wrapper) -- UDPClient
// constructor(conf,relay_class) -- MultiRelayClient
// constructor(conf,relay_class) -- MultiPathRelayClient


/**
 * This is a manager of clients. It sets up a UDP server waiting for a message that can tell the 
 * processes if there is a server to which the client may connect. Clients that have been entered into 
 * the table of waiting connections will be accessed in order to call the the methods that finally connect
 * to the newely introduced server and setup up the connection management in the object that faces the application code.
 */
class MessageRelayManager extends UDPEndpoint {

    constructor(conf) {
        super(conf)
        this._waiting_connections = {}
    }


    /**
     * The remote prompting the connection must know the label for the client that will connect to a server.
     * 
     * @param {string} connect_label 
     * @param {object} connection -  a message relay class object
     * @param {object} conf - the configuration of the message realy being passe to the connection op
     * @param {Function} connection_op - the final steps require for establishing a connection
     */
    add_waiting_connection(connect_label,conf,connection_op) {  // connection_op takes conf as a parameter
        this._waiting_connections[connect_label] = {conf,connection_op}
    }


    /**
     * The application implementation of app_message_handler
     * 
     * @param {object} msg_obj 
     * @returns 
     */
    app_message_handler(msg_obj) {
        let op = msg_obj._op
        switch ( op ) {
            case 'S' : {
                let label = msg_obj.label
                let connect_info = this._waiting_connections[label]
                if ( connect_info ) {
                    let {conf,connection_op} = connect_info
                    //
                    let addr = msg_obj.address;
                    let port = msg_obj.port
                    //
                    conf.address = addr
                    conf.port = port
                    //
                    conf.tls = msg_obj.tls   // set to use locally configured tls with the requirement that the remove works with permitted keys
                    // no extended tls options
                    // requester cannot send overrides to local client certs
                    if ( conf.tls.preloaded.client_key ) {
                        delete conf.tls.preloaded.client_key
                    }
                    if ( preloaded.client_cert.client_cert ) {
                        delete conf.tls.preloaded.client_cert
                    }
                    // if tls is configured locally, then use the local def (not the remote)
                    if ( conf.tls.preloaded.client_key ) {
                        conf.tls.preloaded.client_key = conf.tls.preloaded.client_key
                    }
                    if ( conf.tls.preloaded.client_cert ) {
                        conf.tls.preloaded.client_cert = conf.tls.preloaded.client_cert
                    }
                    //
                    connection_op(conf)             // finish the creation of the connection object
                }

                break;
            }
            default: {
                break;
            }
        }

        return("OK")
    }
    

}


module.exports.MessageRelayManager = MessageRelayManager