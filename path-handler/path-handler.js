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
const PEER_PUBLISHER = 'peer_publish'
const APPLICATION_ENDPOINT = 'app_endpoint'
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
        this.update_listeners = false
        this.topic_listeners = {}
        this.init(conf)
    }

    init(conf) {
        this.message_relayer = new this.RelayerClass(conf.relay)
    }

    async send(message) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        let response = await this.message_relayer.send_on_path(message,this.path)
        return response
    }

    async send_pub(message,json_writer) {
        return this.send(message) // -- this is a default behavior
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

    async subscribe(topic,msg,handler) { // the hanlder is for a particular topic and handler (listener)
        if ( (this.topic_listeners[topic] === undefined) || !(Array.isArray(this.topic_listeners[topic])) ) {
            this.topic_listeners[topic] = [handler]
            let group_handler =  ((tt,self) => {        // this will drop down into the handler in the relay client class
                return (msg_obj) => {
                    let all_listeners = self.topic_listeners[tt]
                    for ( let listener of all_listeners ) {
                        listener(msg_obj)                   // everybody on this path will get the message going through
                    }
                }
            })(topic,this)
            // att the group handler to the handler response on the message_relayer -->
            await this.message_relayer.subscribe(topic,this.path,msg,group_handler)       // add another event listener
        } else if ( Array.isArray(this.topic_listeners[topic]) ) { // be overly cautious
            this.topic_listeners[topic].push(handler)
        }
    }


    async subscribe_with_insert(topic,msg,handler,insert_group_action) { // the hanlder is for a particular topic and handler (listener)
        if ( (this.topic_listeners[topic] === undefined) || !(Array.isArray(this.topic_listeners[topic])) ) {
            this.topic_listeners[topic] = [handler]
            let group_handler =  ((tt,self,one_time_action) => {        // this will drop down into the handler in the relay client class
                return (msg_obj) => {
                    one_time_action(msg_obj)
                    let all_listeners = self.topic_listeners[tt]
                    for ( let listener of all_listeners ) {
                        listener(msg_obj)                   // everybody on this path will get the message going through
                    }
                }
            })(topic,this,insert_group_action)
            // att the group handler to the handler response on the message_relayer -->
            await this.message_relayer.subscribe(topic,this.path,msg,group_handler)       // add another event listener
        } else if ( Array.isArray(this.topic_listeners[topic]) ) { // be overly cautious
            this.topic_listeners[topic].push(handler)
        }
    }


    async unsubscribe(topic,handler) {
        if ( this.topic_listeners[topic] !== undefined ) {
            let all_listeners = this.topic_listeners[topic]
            let ii = all_listeners.indexOf(handler)
            all_listeners.splice(ii,1)
            if ( all_listeners.length === 0 ) {
                // when no more listers are left tell the endpoint connection to stop subsribing
                delete this.topic_listeners[topic]  // make it undefined
                return await this.message_relayer.unsubscribe(topic,this.path)
            }
        }
    }

    request_cleanup() {
        if ( this.update_listeners ) {
            for ( let listener of this.update_listeners ) {
                this.message_relayer.removeListener('update',listener)                
            }
        }
    }
}




class PeerPublishingHandler extends PathHandler {
    constructor(path,conf,FanoutRelayerClass) {
        path = ((typeof path === 'string') ? path : PEER_PUBLISHER)
        super(path,conf,FanoutRelayerClass)
        this.all_topic_subscribers = {}
    }

    //
    /*
    init(conf) {
        super.init(conf)
    }
    */
   
    async send_pub(message,json_writer) {
        //
        let topic = message.topic
        let msg_str = JSON.stringify(message)
        let all_subscribers = this.all_topic_subscribers[topic]
        for ( let jw of all_subscribers ) {     // back to client sibling, clients of relay
            if ( jw !== json_writer ) {
                let writer = json_writer.writer
                if ( writer ) {
                    writer.write(msg_str)
                }
            }
        }
        //  further into backend -- including ipc sibling  
        //  -- (all the necessary fields for publication should be here already)
        return await this.send(message)  // the message continues on 
    }

    #insert_subscriber(topic,json_writer) { // the hanlder is for a particular topic and handler (listener)
        let t_list = this.all_topic_subscribers[topic]
        if ( t_list === undefined ) {
            t_list = []
            this.all_topic_subscribers[topic] = t_list
        }
        if ( t_list.indexOf(json_writer) < 0 ) {
            t_list.push(json_writer)
        }
    }

    #remove_subscriber(topic,json_writer) {
        let t_list = this.all_topic_subscribers[topic]
        if ( t_list !== undefined ) {
            this.all_topic_subscribers[topic]
            let all_subscibers = this.all_topic_subscribers[topic]
            let ii = all_subscibers.indexOf(json_writer)
            all_subscibers.splice(ii,1)
        }
    }

    async subscribe(topic,msg,handler,json_writer,group_insert_action) { // the hanlder is for a particular topic and handler (listener)
        // handle membership
        this.#insert_subscriber(topic,json_writer)
        // setup publication forwarding from downstream servers
        await super.subscribe_with_insert(topic,msg,handler,group_insert_action)
    }


    async unsubscribe(topic,handler,json_writer) {
        if ( json_writer ) {
            this.#remove_subscriber(topic,json_writer)
        }
        await super.unsubscribe(topic,handler)
    }

}


class ApplicationEndpointHandler extends PeerPublishingHandler {

    constructor(path,conf,FanoutRelayerClass) {
        path = ((typeof path === 'string') ? path : APPLICATION_ENDPOINT)
        super(path,conf,FanoutRelayerClass)
        this.all_topic_subscribers = {}
    }

    // ----  ---- ---- ---- ---- ---- ----

    async send(message) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        let op_message = Object.assign({},message)
        let response = await this.app_message_handler('S',op_message)
        return response
    }

    async get(message) {
        let op_message = Object.assign({},message)
        let response = await this.app_message_handler('G',op_message)
        return response
    }

    async del(message) {
        let op_message = Object.assign({},message)
        let response = await this.app_message_handler('D',op_message)
        return response
    }


    //
    async app_message_handler(op,msg_obj) {
        this.id_augmentation(msg_obj)
        return { "status" : "OK", "explain" : `${op} performed`, "when" : Date.now() }
    }

}


class OutgoingEmailHandler extends PathHandler {
    constructor(path,conf,FanoutRelayerClass) {
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
    constructor(path,conf,FanoutRelayerClass) {
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
    constructor(path,conf,FanoutRelayerClass) {
        super(USER_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
    }

    del(message) { return("none") }
}




class PersistenceHandler extends PathHandler {
    constructor(path,conf,FanoutRelayerClass) {
        super(PERSISTENCE_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
        if ( conf.listeners ) {
            this.update_listeners = conf.listeners
            conf.listeners.forEach(listener => {
                // most likely stick things in the local database
                this.message_relayer.on('update',listener)
            })
        }
    }
}


class NotificationHandler extends PathHandler {
    constructor(path,conf,FanoutRelayerClass) {
        super(NOTIFICATION_PATH,conf,FanoutRelayerClass)
    }
    //
    init(conf) {
        super.init(conf)
        if ( conf.listeners ) {
            this.update_listeners = conf.listeners
            conf.listeners.forEach(listener => {
                // most likely stick things in the local database
                this.message_relayer.on('update',listener)
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
g_path_classes[PEER_PUBLISHER] = PeerPublishingHandler
g_path_classes[APPLICATION_ENDPOINT] = ApplicationEndpointHandler

function Path_handler_factory(path,path_conf,FanoutRelayerClass) {
    let PathClass = g_path_classes[path]
    if ( PathClass !== undefined ) {
        let pc = new PathClass(path,path_conf,FanoutRelayerClass)
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
// // More detail is attached to the function export for classes wanting to override classes or use symbols.
// // // SYMBOLS
module.exports.USER_PATH = USER_PATH
module.exports.PERSISTENCE_PATH = PERSISTENCE_PATH
module.exports.EMAIL_PATH = EMAIL_PATH
module.exports.CONTACT_PATH = CONTACT_PATH
module.exports.NOTIFICATION_PATH = NOTIFICATION_PATH
// // // CLASSES
module.exports.classes = g_path_classes     // applications may want to override the class implementations given here.
module.exports.PathHandler = PathHandler
module.exports.PeerPublishingHandler = PeerPublishingHandler
module.exports.ApplicationEndpointHandler = ApplicationEndpointHandler

