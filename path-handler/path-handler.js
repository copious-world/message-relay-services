'use strict';
const {EventEmitter} = require('events')
//
// ---- ---- ---- ---- ---- ---- ---- ----
const USER_PATH = 'user'                // to a user endpoint
const PERSISTENCE_PATH = 'persistence'  // most things take this path (data object are used to discern sub categories)
//
const EMAIL_PATH = 'outgo_email'        // app email -- likely to a spool file or mailbox file
const CONTACT_PATH = 'contact'          // intake spool similar to email or same with proper interface
const NOTIFICATION_PATH = 'notify'      // admin or user to user (should be a special endpoint)
// ---- ---- ---- ---- ---- ---- ---- ----
const g_path_impls = {
    'outgo_email' : null,
    'user' : null,
    'contact' : null,
    'persistence' : null,
    'notify' : null
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
        let response = await this.message_relayer.sendMessage(message)
        return response
    }

    async get(message) {
        let op_message = Object.assign({},message)
        if ( op_message._tx_op !== 'G' ) op_message._tx_op = 'G'
        let response = await this.message_relayer.sendMessage(op_message)
        return response
    }

    async del(message) {
        let op_message = Object.assign({},message)
        if ( op_message._tx_op !== 'D' ) op_message._tx_op = 'D'
        let response = await this.message_relayer.sendMessage(op_message)
        return response
    }


    subscribe(topic,msg,handler) {
        msg.topic = topic     // just a double check on making sure that required fields are present
        msg.ps_op = 'sub'
        this.message_relayer.on('update',handler)       // add another event listener
        this.send(msg)
    }

    request_cleanup(handler) {
        this.message_relayer.removeListener('update',handler)
    }
}


class OutgoingEmailHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(EMAIL_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
    }

    del(message) { return("none") }
    get(message) { return("none") }
}


class ContactHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(CONTACT_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
    }

    del(message) {return("none")  }
    get(message) { return("none") }

}


class UserHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(USER_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
    }

    del(message) { return("none") }
}




class PersistenceHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(PERSISTENCE_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
        if ( conf.listeners ) {
            conf.listeners.forEach(listener => {
                // most likely stick things in the local database
                this.message_relayer.on('update_string',listener.strings)
                this.message_relayer.on('update',listener.objects)
            })
        }
    }
}


class NotificationHandler extends PathHandler {
    constructor(conf,FanoutRelayerClass) {
        super(NOTIFICATION_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
        if ( conf.listeners ) {
            conf.listeners.forEach(listener => {
                // most likely stick things in the local database
                this.message_relayer.on('update_string',listener.strings)
                this.message_relayer.on('update',listener.objects)
            })
        }
    }
}


const g_path_classes = {}
g_path_classes[USER_PATH] = UserHandler
g_path_classes[PERSISTENCE_PATH] = PersistenceHandler
g_path_classes[EMAIL_PATH] = OutgoingEmailHandler
g_path_classes[CONTACT_PATH] = ContactHandler
g_path_classes[NOTIFICATION_PATH] = NotificationHandler


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


module.exports = Path_handler_factory;
//
module.exports.USER_PATH = USER_PATH
module.exports.PERSISTENCE_PATH = PERSISTENCE_PATH
module.exports.EMAIL_PATH = EMAIL_PATH
module.exports.CONTACT_PATH = CONTACT_PATH
module.exports.NOTIFICATION_PATH = NOTIFICATION_PATH
