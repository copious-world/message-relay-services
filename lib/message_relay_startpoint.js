'use strict';


const {Communicator} = require('message_relay')


/// message relay startpoint is more useful in the web server side of a message path,
/// while a message relayer sevice with a path handler for local ops is more useful in the 
/// cluster master headless operation.


class AppWriter extends EventEmitter {

    constructor(app_path_name) {
        super()
        // this is a child process sending generically to the parent the process.send
        this.app_name = app_path_name
    }

    //
    write(message) {
        let msg = {
            "caller" : this.app_name,
            "msg" : message
        }
        this.emit('message-ready',msg)
    }

}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

// ~60 lines
class MessageRelayStartingPoint extends Communicator {
    //
    constructor(conf,fanoutRelayer) {
        super(conf,fanoutRelayer)
    }

    _init(conf) { }  // do nothing for now.
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    add_main_message_handler(handler) {
        this.writer.on('message-ready',handler)
    }

    add_message_handler(path_name,handler) {
        let writer = this.get_connection_writer(path_name)
        if ( writer !== false ) {
            writer.on('message-ready',handler)
        }
    }


    async forward_message_promise(obj,path_name) {
        let writer = this.get_connection_writer(path_name)
        if ( writer !== false ) {
            let resolver = false
            let handler = (response) => {
                writer.removeEventListener('message-ready',handler)
                if ( resolver !== false ) resolver(response)
            }
            let p = new Promise((resolve,reject) => {
                resolver = resolve
                let writer = this.get_connection_writer(path_name)
                if ( writer !== false ) {
                    writer.on('message-ready',handler)
                } else {
                    reject(false)
                }
            })
        
            this.forward_object_data(path_name,obj)
            try {
                let result = await p
                return result    
            } catch (e) {
                console.log("could not form a promise within forward_message_promise")
            }
        }
        return false
    }


    add_mod_connection_path(path_name) {
        let writer = new AppWriter(path_name)
        this.add_connection(path_name,writer)
    }

    forward_object_data(path_name,obj) {
        this.add_data_and_react(path_name,obj)
    }


}


/*
    example: SP.add_mod_connection_path("support-ops")
    SP.add_message_handler("support-ops",(message) => {
        // work on a response that was requested 
    })

    let p = new Promise((resolve,reject) => {
        SP.add_message_handler("support-ops",(message) => {
            let result = ""// work on a response that was requested 
            resolve(result)
        })
    })

    SP.forward_object_data("support-ops",obj)
    let result = await p
    
*/


module.exports = MessageRelayStartingPoint
