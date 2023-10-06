


const UDPEndpoint = require('../lib/message_endpoint_udp')

// constructor(conf,wrapper) -- MessageRelayer  -- message relay client
// constructor(conf,wrapper) -- IPCClient -- message relay ipc
// constructor(conf,wrapper) -- IPCChildClient
// constructor(conf,wrapper) -- UDPClient
// constructor(conf,relay_class) -- MultiRelayClient
// constructor(conf,relay_class) -- MultiPathRelayClient



/**
 * This class turns itself into the class it creates on behalf of a DUP Service...
 * When this class receives a UDP message indicating that a server is available,
 * this class creates a message relay to the new server and then turns itself into 
 * the relay class. 
 * 
 * Applications using it may replace the creation of the wrapped class instance with this class instance and then 
 * use it as the class instance of the wrapped class after receiving the 'ready' signal.
 * 
 * After this 
 */
class MessageRelayContainer extends UDPEndpoint {

    constructor(conf,par2,RelayClass) {
        super(conf)
        this.wrapper_or_class = par2
        this._RelayClass = RelayClass
        this.conf = conf /// if not already set
    }

    //
    /**
     * 
     * @param {object} msg_obj 
     * @returns 
     */
    app_message_handler(msg_obj) {
        let op = msg_obj._op
        switch ( op ) {
            case 'S' : {
                //
                let conf = Object.assign({},this.conf)
                //
                let addr = msg_obj.address
                let port = msg_obj.port
                let paths = msg_obj.paths
                //
                if ( paths ) {
                    conf.paths = paths
                } else {
                    conf.address = addr
                    conf.port = port
                }
                //
                conf.tls = msg_obj.tls   // set to use locally configured tls with the requirement that the remove works with permitted keys
                // no extended tls options
                // requester cannot send overrides to local client certs
                if ( conf.tls && conf.tls.preloaded && conf.tls.preloaded.client_key ) {
                    delete conf.tls.preloaded.client_key
                }
                if ( conf.tls && conf.tls.preloaded && preloaded.client_cert.client_cert ) {
                    delete conf.tls.preloaded.client_cert
                }
                // if tls is configured locally, then use the local def (not the remote)
                if ( conf.tls && conf.tls.preloaded && this.conf.tls && this.conf.tls.preloaded && this.conf.tls.preloaded.client_key ) {
                    conf.tls.preloaded.client_key = this.conf.tls.preloaded.client_key
                }
                if ( conf.tls && conf.tls.preloaded && this.conf.tls && this.conf.tls.preloaded && this.conf.tls.preloaded.client_cert ) {
                    conf.tls.preloaded.client_cert = this.conf.tls.preloaded.client_cert
                }
                //
                let ref = new  this._RelayClass(conf,this.wrapper_or_class)
                ref.on('client-ready',() => {       // detroy the use of this instance as a server, turn into the class it wraps.
                    //
                    this.this.connection.close()
                    //
                    let aclass = this._RelayClass
                    //
                    const {name,length,prototype,...statics} = Object.getOwnPropertyDescriptors(aclass);
                    Object.defineProperties(this, statics);
                    //
                    const {constructor,...proto} = Object.getOwnPropertyDescriptors(aclass.prototype);
                    Object.defineProperties(this, proto);
    
                    for ( let ky in ref ) {
                        this[ky] = ref[ky]
                    }
                    //
                })
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


module.exports = MessageRelayContainer