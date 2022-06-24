'use strict';
 
// load the Node.js TCP library
const Server = require('./message_endpoint')
const EventEmitter = require('events')


class ProcWriter extends EventEmitter {

    constructor() {
        super()
        // this is a child process sending generically to the parent the process.send
    }

    //
    write(message) {
        let msg = {
            "pid" : process.pid,
            "msg" : message
        }
        process.send(msg)
    }

}



//
class ServerWithIPC extends Server {
    //
    constructor(conf) {
        super(conf)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _init(conf) {
        //
        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }
        super._init(conf)
        //
        let identify_parent = "parent:" + process.ppid
        //
        this.p_proc_writer = new ProcWriter()
        this.add_connection(identify_parent,this.p_proc_writer)

        process.on('message', async (msg) => {
            let parent =  "parent:" + msg.pid
            let message = msg.msg
            if ( typeof message === "string" ) {  // converting
               await this.add_data_and_react(parent,message)
            } else if ( typeof message === "object" ) {
                await this.add_object_and_react(parent,message)
            }
        });
        //
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

  
}

//
module.exports = ServerWithIPC;
