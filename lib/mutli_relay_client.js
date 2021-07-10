const RelayClass = require('./message_relay_client')
const {EventEmitter} = require('events')

class MultiRelayClient extends EventEmitter {

    constructor(conf) {
        //
        let peer_list = conf.peers
        this.connections = {}
        this.current_index = false
        this.track_index = -1
        this.balance_strategy = conf.balance_strategy ? conf.balance_strategy : "random"
        this.subscriptions = {}
        //
        for ( let peer of peer_list ) {
            let address = peer.address
            this.current_index = address    // starts on last address 
            this.track_index++
            let port = peer.port
            let peer_conf = Object.assign(conf)
            peer_conf.address = address
            peer_conf.port = port
            let connection = new RelayClass(peer_conf)
            this.connections[address] = {
                "connect" : connection,
                "going" : false
            }
            this.subscriptions[address] = {}
        }
        //
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
                        this.current_index = address
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
                        this.current_index = address
                        this.track_index = i
                        return
                    }
                    i++
                }
                break
            }
        }
    }

    async publish(topic,message) {
        for ( let connection of this.connections ) {
            connection.publish(topic,message)
        }
    }

    async subscribe(topic,message,handler) {        // use just one... might check at times for breakage...
        this.update_index()
        let connection = this.connections[this.current_index]
        connection.subscribe(topic,message,handler)
        this.subscriptions[this.current_index][topic] = [handler,message]
    }


    unsubscribe(topic) {
        for ( let connection of this.connections ) {
            connection.unsubscribe(topic)
        }
    }

    //
    send(message) {     // sometimes synonyms help
        this.update_index()
        let connection = this.connections[this.current_index]
        connection.send(message)
    }

    //      returns a promise
    send_on_path(message,path) {
        this.update_index()
        let connection = this.connections[this.current_index]
        connection.send_on_path(message,path)
    }

    //
    async sendMail(mail) {
        this.update_index()
        let connection = this.connections[this.current_index]
        connection.sendMail(mail)
    }

    closeAll() {
        for ( let connection of this.connections ) {
            connection.closeAll()
        }
    }

}



module.exports = MultiRelayClient