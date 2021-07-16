'use strict';
const {EventEmitter} = require('events')
//
// ---- ---- ---- ---- ---- ---- ---- ----
const USER_PATH = 'winding'                // to a user endpoint
// ---- ---- ---- ---- ---- ---- ---- ----
const g_path_impls = {
    'winding' : null
}
// g_path_classes gathered below
// ---- ---- ---- ---- ---- ---- ---- ----


class PathHandler extends EventEmitter {

    constructor(path,conf,FanoutRelayerClass) {
        super()
        this.path = path
        this.conf = conf
        this.message_relayer = false
        this.RelayerClass = FanoutRelayerClass
        this.init(conf)
    }

    init(conf) {
        this.message_relayer = new this.RelayerClass(conf.relay)
    }

    async send(message) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        let response = await this.message_relayer.send_on_path(message,this.path)
        return response
    }

    async get(message) {
        let op_message = Object.assign({},message)
        let response = await this.message_relayer.send_op_on_path(op_message,this.path,'G')
        return response
    }

    async del(message) {
        let op_message = Object.assign({},message)
        let response = await this.message_relayer.send_op_on_path(op_message,this.path,'D')
        return response
    }

    async subscribe(topic,msg,handler) {
        await this.message_relayer.subscribe(topic,this.path,msg,handler)       // add another event listener
    }

    async unsubscribe(topic) {
        return await this.message_relayer.unsubscribe(topic,this.path)
    }

    request_cleanup(handler) {
        this.message_relayer.removeListener('update',handler)
    }
}


class UserHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(USER_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
    }
    //
    //del(message) { return("none") }
}


const g_path_classes = {}
g_path_classes[USER_PATH] = UserHandler

function Path_handler_factory(path,path_conf,FanoutRelayerClass) {
    let PathClass = g_path_classes[path]
    if ( PathClass !== undefined ) {
        let pc = new PathClass(path_conf,FanoutRelayerClass)
        g_path_impls[path] = pc
        return(pc)
    }
    let pc = new PathHandler(path,path_conf,FanoutRelayerClass)
    g_path_impls[path] = pc
    return pc
}

// // //
module.exports = Path_handler_factory;  // most applications will be OK with this factory. 
//