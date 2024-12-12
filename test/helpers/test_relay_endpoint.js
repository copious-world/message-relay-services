'use strict';
const {EventEmitter} = require('events')
//
const {ServeMessageEndpoint} = require('../../index')


class EndpointForTest extends ServeMessageEndpoint {

    //
    constructor (conf) {
        super(conf)
        //this.fos = new FileOperations(conf)  // initialize file operations
    }
    
    // ---- ---- ---

    make_path(msg_obj) {  // descendants have special cases
        return "./" + msg_obj._id
    }
    //
    user_manage_date(op,msg_obj) {
        // do nothing ... the application implements.... the application should know of the kind of date fields that would be used by search services.
    }

    user_action_keyfile(op,msg_obj) {}

    //
    async app_message_handler(msg_obj) {
        let op = msg_obj._tx_op
        let result = "OK"
        //
        switch ( op ) {
            case 'G' : {        // get user information
                let stat = "OK"
                let data = "TEST GET" // returned as string (not altered)
                return({ "status" : stat, "data" : data,  "explain" : "get", "when" : Date.now() })
            }
            case 'D' : {
                let stat = "OK"
                let data = "TEST DELETE" // returned as string (not altered)
                return({ "status" : stat, "data" : data,  "explain" : "del", "when" : Date.now() })
            }
            case 'S' : {  // or send
                let stat = "OK"
                let data = "TEST SET" // returned as string (not altered)
                return({ "status" : stat, "data" : data,  "explain" : "set", "when" : Date.now() })
            }
            default : {
                break
            }
        }
        //
        return({ "status" : result, "explain" : "op performed", "when" : Date.now() })
    }

    //
    async app_generate_tracking(msg_obj) {
        console.log("the application class should implement app_generate_tracking")
        return uuid4()
    }

    //
    app_asset_generator(u_obj,gen_targets) {
        console.log("the application class should implement app_generate_tracking")
        return false
    }

}


module.exports = EndpointForTest
