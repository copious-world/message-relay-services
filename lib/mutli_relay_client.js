const RelayClass = require('./message_relay_client')
const {EventEmitter} = require('events')

class MultiRelayClient extends EventEmitter {

    constructor(conf,relay_class) {
        super()
        //
        let peer_list = conf.peers
        this.connections = {}
        this.current_con_key = false
        this.track_index = -1
        this.balance_strategy = conf.balance_strategy ? conf.balance_strategy : "random"
        this.subscriptions = {}
        //
        this.RelayClass_impl = RelayClass
        if ( relay_class ) {
            this.RelayClass_impl = relay_class
        }
        //
        if ( peer_list ) {
            for ( let peer of peer_list ) {
                this.add_relay_peer(conf,peer)
            }
            } else {
            console.warn("no peer list in multi-relay-client")
        }

        //
    }

    add_relay_peer(conf,peer) {
        let address = !(peer.address) ? conf.address : peer.address
        let port = (!peer.port) ? conf.port : peer.port
        let peer_conf = Object.assign({},conf,peer)
        peer_conf.address = address
        peer_conf.port = port
        let RC = this.RelayClass_impl
        let connection = new RC(peer_conf)
        this.track_index++
        this.current_index = address    // starts on last address 
        this.connections[address] = {
            "connect" : connection,
            "going" : false
        }
        this.subscriptions[address] = {}
        connection.on('client-ready',(addr) => {
            this.emit('peer-ready',{
                'port' : port,
                'address' : addr,
                'configured-address' : address
            })
        })
    }

    remove_relay_peer(peer) {
        let address = peer.address
        let con = this.connections[address]
        if ( con ) con.going = false
        if ( con ) con = con.connect
        if ( con ) con.closeAll()
        delete this.subscriptions[address]

    }

    commission(address) {
        this.connections[address].going = true
    }

    decommission(address) {
        this.connections[address].going = false
        for ( let topic in this.subscriptions[address] ) {  // if an error, connection broke and subscription has been canceled
            let [handler,message] = this.subscriptions[address][topic]
            delete this.subscriptions[address][topic]
            this.subscribe(topic,message,handler)
        }
        delete this.subscriptions[address]
    }

    update_index() {
        let keys = Object.keys(this.connections)
        switch ( this.balance_strategy ) {
            case "random" : {
                let n = keys.length
                let r = Math.floor(Math.random()*(n+1))
                let i = (r) % n
                while ( i !== this.track_index ) {
                    address = keys[i]
                    let address = keys[this.track_index]
                    if ( this.connections[address].going ) {
                        this.current_con_key = address
                        this.track_index = i
                        return
                    }
                    i++
                }
                break
            }
            case "sequence" : {
                let n = keys.length
                let i = (this.track_index + 1) % n
                while ( i !== this.track_index ) {
                    address = keys[i]
                    let address = keys[this.track_index]
                    if ( this.connections[address].going ) {
                        this.current_con_key = address
                        this.track_index = i
                        return
                    }
                    i++
                }
                break
            }
        }
    }

    async publish(topic,path,message) {
        for ( let connection in this.connections ) {
            let con = this.connections[connection].connect            
            con.publish(topic,path,message)
        }
    }

    async subscribe(topic,path,message,handler) {        // use just one... might check at times for breakage...
        this.update_index()
        let con = this.connections[this.current_con_key].connect
        this.subscriptions[this.current_con_key][topic] = [handler,message]
        return con.subscribe(topic,path,message,handler)
    }


    async unsubscribe(topic,path) {
        let ps = []
        for ( let connection in this.connections ) {
            let con = this.connections[connection].connect            
            ps.push(con.unsubscribe(topic,path))
        }
        await Promise.all(ps)
    }

    //
    send(message) {     // sometimes synonyms help
        this.update_index()
        let con = this.connections[this.current_con_key].connect
        return con.send(message)
    }

    //      returns a promise
    send_on_path(message,path) {
        this.update_index()
        let con = this.connections[this.current_con_key].connect
        return con.send_on_path(message,path)
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
        this.update_index()
        let con = this.connections[this.current_con_key].connect
        await con.sendMail(mail)
    }

    closeAll() {
        for ( let connection in this.connections ) {
            let con = this.connections[connection].connect
            con.closeAll()
        }
    }

}



module.exports = MultiRelayClient