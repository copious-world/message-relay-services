


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
 * 
 * Updating code to use this class requires adding a few lines before the call to the relay client.
 * The lines will be to add coniguration parameters.
 * 
 * For example:
 * 
 * ```
 *  conf._connection_manager = new MessageRelayManager(rm_conf)
 *  conf._connect_label = "ISEEKSERVICE"
 * 
 *  let new_connection = new MessageRelay(conf)
 * ```
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
     * This version (MessageRelayManager::UDPEndpoint) of `app_message_handler` provides just the handler for 
     * `set_on_path`. The program that uses this creates the MessageRelay client as usual, but configures it to wait 
     * on this server to call back to it when the server makes itself known and available for connection.
     * 
     * The call to the handler in the `_waiting_connections` table is taken of by the MessageRelay class.  So, most
     * application should not be concerned with writing a version of it.
     * 
     * In order to make a message relay client use this class, these fields have to be set in its configuration.
     * 
     * `conf._connection_manager && conf._connect_label`
     * 
     * Here, `_connection_manager` is an instance of this class.
     * The `_connect_label` configuration parameter is a public identifier (where public might be 
     * behind a firewall but may be external depending on the application). The `_connect_label` serves to 
     * identify the client that waits to connect to a particular server. Both the server and the client make this 
     * identifier known to utilities that signal the instances of this class via its UDP server. And, this method `app_message_handler` 
     * responds to `set` messages from the utility by taking the following action:
     * 
     * > The connection (communicator) class instance indicated by the label is accessed via the map `_waiting_connections` and then 
     * the its connection operation is performed. 
     * 
     * The result of performing the connection operation should be that the message relay client will be connected to the 
     * the server identified in the `set` message from the utilities previously mentioned.
     * 
     * Configuration parameters for connection appear in the message. If tls information is provided, it is deleted and local defaults 
     * associated with the configuration of the message_relay_class are used in its place.
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
                    let _conf = Object.assign({},conf)
                    //
                    let addr = msg_obj.address;
                    let port = msg_obj.port
                    //
                    _conf.address = addr
                    _conf.port = port
                    //
                    _conf.tls = msg_obj.tls   // set to use locally configured tls with the requirement that the remove works with permitted keys
                    // no extended tls options
                    // requester cannot send overrides to local client certs
                    if ( _conf.tls && _conf.tls.preloaded && _conf.tls.preloaded.client_key ) {
                        delete _conf.tls.preloaded.client_key
                    }
                    if ( _conf.tls && _conf.tls.preloaded && _conf.tls.preloaded.client_cert ) {
                        delete _conf.tls.preloaded.client_cert
                    }
                    // if tls is configured locally, then use the local def (not the remote)
                    if ( _conf.tls && _conf.tls.preloaded && conf.tls && conf.tls.preloaded && conf.tls.preloaded.client_key ) {
                        _conf.tls.preloaded.client_key = conf.tls.preloaded.client_key
                    }
                    if ( _conf.tls && _conf.tls.preloaded && conf.tls && conf.tls.preloaded && conf.tls.preloaded.client_cert ) {
                        _conf.tls.preloaded.client_cert = conf.tls.preloaded.client_cert
                    }
                    // the connection object is used externally, so this is all the scope that is needed for `connection`
                    let connection = connection_op(_conf) // finish the creation of the connection object
                    if ( connection ) {
                        connection.on('client-ready',() => {   // add another listener for `client ready` and do housekeeping.
                            delete this._waiting_connections[label] // remove from the table
                        })
                    }
                }
                //
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