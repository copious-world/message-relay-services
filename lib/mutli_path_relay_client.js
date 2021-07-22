const RelayClass = require('./message_relay_client')
const {EventEmitter} = require('events')

class MultiPathRelayClient extends EventEmitter {

    constructor(conf) {
        super()
        //
        let path_list = conf.paths
        this.connections = {}
        this.current_index = false
        this.track_index = -1
        this.subscriptions = {}
        //
        for ( let path_cl of path_list ) {
            let address = path_cl.address
            this.current_index = address    // starts on last address 
            this.track_index++
            let port = path_cl.port
            let peer_conf = Object.assign(conf)
            peer_conf.address = address
            peer_conf.port = port
            let connection = new RelayClass(peer_conf)
            this.connections[path_cl.path] = {
                "connect" : connection,
                "going" : false
            }
            this.subscriptions[path_cl.path] = {}
        }
        //
    }

    async publish(topic,path,message) {
        let con = this.connections[path]
        if ( con ) con = con.connect
        if ( con ) con.publish(topic,message)
    }

    async subscribe(topic,path,message,handler) {        // use just one... might check at times for breakage...
        let con = this.connections[path]
        if ( con ) con = con.connect
        this.subscriptions[path][topic] = [handler,message]
        return con.subscribe(topic,message,handler)
    }

    async unsubscribe(topic) {
        let ps = []
        for ( let path in this.connections ) {
            let con = this.connections[path]
            if ( con ) con = con.connect
            if ( con ) ps.push(con.unsubscribe(topic))
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