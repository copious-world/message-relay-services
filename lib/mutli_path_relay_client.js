const RelayClass = require('./message_relay_client')
const {EventEmitter} = require('events')

/**
 * 
 */
class MultiPathRelayClient extends EventEmitter {

    constructor(conf,relay_class) {
        super()
        //
        let path_list = conf.paths
        this.connections = {}
        this.current_index = false
        this.track_index = -1
        this.subscriptions = {}
        //
        this.RelayClass_impl = RelayClass
        if ( relay_class ) {
            this.RelayClass_impl = relay_class
        }
        //
        if ( path_list ) {
            for ( let path_cl of path_list ) {
                this.add_relay_path(conf,path_cl)
            }    
        } else {
            console.warn("no path list in multi-path-relay-client")
        }
        //
    }

    // add_relay_path
    /**
     * 
     * @param {object} conf 
     * @param {object} path_peer 
     * @returns 
     */
    add_relay_path(conf,path_peer) {
        if ( path_peer === undefined ) {
            path_peer = conf
        }
        let path = path_peer.path
        if ( (path === undefined) || (typeof path !== "string") || (path.length === 0) ) return false
        if ( (this.connections[path] !== undefined) && this.connections[path].going ) return false // one connection per path..
        //
        let address = !(path_peer.address) ? conf.address : path_peer.address
        let port = (!path_peer.port) ? conf.port : path_peer.port

        let path_peer_conf = Object.assign({},conf,path_peer)
        if ( path_peer.UDS === undefined ) {
            path_peer_conf.address = address
            path_peer_conf.port = port    
        } else {
            if ( path_peer_conf.UDS_dir !== undefined ) {
                path_peer_conf.path = `${path_peer_conf.UDS_dir}/${path}`
            } else {
                path_peer_conf.path = `./${path}`
            }
        }

        let RC = this.RelayClass_impl
        let connection = new RC(path_peer_conf)

        this.track_index++
        this.current_index = path    // starts on last address 
        this.connections[path] = {
            "connect" : connection,
            "going" : false
        }
        this.subscriptions[path] = {}
        if ( path_peer.UDS === undefined ) {
            connection.on('client-ready',(addr,port) => {
                this.emit(`path-ready-${path}`,{
                    'path' : path,
                    'port' : port,
                    'address' : addr,
                    'configured-address' : address
                })
            })
        } else {
            connection.on('client-ready',(UDS_path) => {
                this.emit(`path-ready-${path}`,{
                    'path' : path,
                    'configured-address' : UDS_path
                })
            })
        }
        return true
    }

    // await_ready
    /**
     * 
     * @param {*} path 
     */
    async await_ready(path) {
        let p = new Promise((resolve,rejects) => {
            this.on(`path-ready-${path}`,(info) => {
                if ( info && info.path && (info.path === path) ) {
                    resolve(true)
                }
            })
        })
        await p
    }

    // remove_relay_path
    /**
     * 
     * @param {object} path_cl 
     */
    remove_relay_path(path_cl) {
        let path = path_cl.path
        let con = this.connections[path]
        if ( con ) con.going = false
        if ( con ) con = con.connect
        if ( con ) con.closeAll()
        delete this.subscriptions[path]

    }

    /**
     * 
     * @param {string} topic 
     * @param {string} path 
     * @param {object} message 
     */
    async publish(topic,path,message) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        if ( con ) con.publish(topic,path,message)
    }

    /**
     * 
     * @param {string} topic 
     * @param {object} message 
     */
    async publish_all(topic,message) {
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) con.publish(topic,path,message)
        }
    }

    /**
     * 
     * @param {string} topic 
     * @param {string} path 
     * @param {object} message 
     * @param {Function} handler 
     * @returns 
     */
    async subscribe(topic,path,message,handler) {        // use just one... might check at times for breakage...
        let con = this.connections[path]
        if ( con ) con = con.connect
        this.subscriptions[path][topic] = [handler,message]
        return con.subscribe(topic,path,message,handler)
    }

    /**
     * 
     * @param {*} topic 
     */
    async subscribe_all(topic) {
        let ps = []
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) con.subscribe(topic,path,message,handler)
        }
    }

    /**
     * 
     * @param {*} topic 
     * @param {*} path 
     */
    async unsubscribe(topic,path) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        await con.unsubscribe(topic,path)
    }

    /**
     * 
     * @param {*} topic 
     */
    async unsubscribe_all(topic) {
        let ps = []
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) ps.push(con.unsubscribe(topic,path))
        }
        await Promise.all(ps)
    }

    //      returns a promise
    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    send_on_path(message,path) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        if ( con ) {
            return con.send_on_path(message,path)
        }
        return false
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @param {*} op 
     * @returns 
     */
    send_op_on_path(message,path,op) {
        message._tx_op = op
        return this.send_on_path(message,path)
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    get_on_path(message,path) {
        message._tx_op = 'G'
        return this.send_on_path(message,path)
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    set_on_path(message,path) {
        message._tx_op = 'S'
        return this.send_on_path(message,path)
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    del_on_path(message,path) {
        message._tx_op = 'D'
        return this.send_on_path(message,path)
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    publication_on_path(message,path) {
        message._tx_op = 'P'
        return this.send_on_path(message,path)
    }

    /**
     * 
     * @param {*} message 
     * @param {*} path 
     * @returns 
     */
    unpublish_on_path(message,path) {
        message._tx_op = 'U'
        return this.send_on_path(message,path)
    }

    //
    async sendMail(mail) {
        let con = this.connections['mail']
        if ( con ) con = con.connect
        if ( con ) await con.connect.sendMail(mail)
    }

    /**
     * 
     */
    closeAll() {
        for ( let connection in this.connections ) {
            let con = this.connections[connection]
            if ( con ) con = con.connect
            if ( con ) con.closeAll()
        }
    }

}



module.exports = MultiPathRelayClient