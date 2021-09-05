const RelayClass = require('./message_relay_client')
const {EventEmitter} = require('events')

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
        for ( let path_cl of path_list ) {
            this.add_relay_path(conf,path_cl)
        }
        //
    }

    add_relay_path(conf,path_peer) {
        let path = path_peer.path
        if ( (this.connections[path] !== undefined) && this.connections[path].going ) return false // one connection per path..
        //
        let address = !(path_peer.address) ? conf.address : path_peer.address
        let port = (!path_peer.port) ? conf.port : path_peer.port
        let path_peer_conf = Object.assign(conf,path_peer)
        path_peer_conf.address = address
        path_peer_conf.port = port
        let RC = this.RelayClass_impl
        let connection = new RC(path_peer_conf)
        this.track_index++
        this.current_index = path    // starts on last address 
        this.connections[path] = {
            "connect" : connection,
            "going" : false
        }
        this.subscriptions[path] = {}
        connection.on('client-ready',(addr,port) => {
            this.emit('path-ready',{
                'path' : path,
                'port' : port,
                'address' : addr,
                'configured-address' : address
            })
        })
        return true
    }


    remove_relay_path(path_cl) {
        let path = path_cl.path
        let con = this.connections[path]
        if ( con ) con.going = false
        if ( con ) con = con.connect
        if ( con ) con.closeAll()
        delete this.subscriptions[path]

    }

    async publish(topic,path,message) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        if ( con ) con.publish(topic,path,message)
    }

    async publish_all(topic,message) {
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) con.publish(topic,path,message)
        }
    }

    async subscribe(topic,path,message,handler) {        // use just one... might check at times for breakage...
        let con = this.connections[path]
        if ( con ) con = con.connect
        this.subscriptions[path][topic] = [handler,message]
        return con.subscribe(topic,path,message,handler)
    }

    async subscribe_all(topic) {
        let ps = []
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) con.subscribe(topic,path,message,handler)
        }
    }

    async unsubscribe(topic,path) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        await con.unsubscribe(topic,path)
    }

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
    send_on_path(message,path) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        if ( con ) {
            return con.send_on_path(message,path)
        }
        return false
    }

    send_op_on_path(message,path,op) {
        message._tx_op = op
        return this.send_on_path(message,path)
    }

    get_on_path(message,path) {
        message._tx_op = 'G'
        return this.send_on_path(message,path)
    }

    set_on_path(message,path) {
        message._tx_op = 'S'
        return this.send_on_path(message,path)
    }

    del_on_path(message,path) {
        message._tx_op = 'D'
        return this.send_on_path(message,path)
    }

    publication_on_path(message,path) {
        message._tx_op = 'P'
        return this.send_on_path(message,path)
    }

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

    closeAll() {
        for ( let connection in this.connections ) {
            let con = this.connections[connection]
            if ( con ) con = con.connect
            if ( con ) con.closeAll()
        }
    }

}



module.exports = MultiPathRelayClient