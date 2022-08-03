'use strict';

const fs = require('fs')
const fsPromise = require('fs/promises')
const {EventEmitter} = require('events')
const JSONMessageQueue = require('../json-message-queue')


const MAX_UNANSWERED_MESSAGES = 100
const DEFAULT_CONF_WRAP_LIMIT = 100


const EMAIL_PATH = 'outgo_email'        // app email -- likely to a spool file or mailbox file



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


async function ensure_directories(front) {
    let top_dir = ''
    if ( front[0] === '.' ) {
        top_dir = process.cwd()
        front = front.substr(1)
    }
    let dirs = front.split('/')
    for ( let dir of dirs ) {
        let check_dir = top_dir + '/' + dir
        try {
            await fsPromise.mkdir(check_dir)
        } catch (e) {
        }
        top_dir = check_dir
    }
}


async function make_path(output_dir,output_file,ensure_dir) {
    let front = output_dir
    if ( (front[front.length -1] !== '/') && (output_file[0] !== '/') ) {
        front += '/'
    }
    if ( ensure_dir ) {
        await ensure_directories(front)
    }
    let path = front + output_file
    return path
}



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//

class ResponseVector {

    constructor(conf) {
        this.max_unanswered =  conf ? conf.max_pending_messages || MAX_UNANSWERED_MESSAGES : MAX_UNANSWERED_MESSAGES  
        this.setup_response_vector()
    }

    //
    // get_response_id
    //      looks for a free position in the waiting_for_response array.
    //      Elements in use always contain resolver functions for relaying responses to waiting callers (await ...)
    //      usually found within 'async' functions.
    //
    get_response_id() {
        let first_try = Math.floor(Math.random()*this.max_unanswered)
        let try_index = first_try
        while ( try_index < this.max_unanswered ) {
            if ( this.waiting_for_response[try_index] === false ) {
                return(try_index)
            }
            try_index++
        }
        try_index = 0
        while ( try_index < first_try ) {
            if ( this.waiting_for_response[try_index] === false ) {
                return(try_index)
            }
            try_index++
        }
        return(-1) // server might be down
    }

    setup_response_vector() {
        this.waiting_for_response = new Array(this.max_unanswered)
        this.waiting_for_response.fill(false,0,this.max_unanswered)
    }

    unlock_response_id(id) {
        this.waiting_for_response[id] = false
    }

    lock_response_id(id,fn) {
        this.waiting_for_response[id] = fn
    }
    
    get_response_resolver(id) {
        return this.waiting_for_response[id]
    }  

}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- 
// // 
class Communicator extends EventEmitter {
    //
    constructor(conf,wrapper) {
        //
        super()
        //
        this.subcriptions = {}
        if ( conf.JSONMessageQueueClass ) {
            let mqClass = require(conf.JSONMessageQueueClass)
            this.messages = new mqClass(false)
        } else {
            this.messages = new JSONMessageQueue(false)
        }
        //
        try {
            this.resp_vector = !(conf.response_vector) ? new ResponseVector(conf) : new (require(conf.response_vector))
        } catch (e) {
            this.resp_vector = new ResponseVector(conf)
        }
        //
        //
        this.writer = false
        this.event_wrapper = false
        if ( wrapper ) {
             this.event_wrapper = wrapper
        }
        //
        this.files_going = false
        //
        this.shunt_file = conf ? (conf.shunt_file || '/message_relay.txt' ) : '/message_relay.txt'   
        this.file_shunting = conf ? conf.file_shunting || false : false
        this.files_only = false
        this.file_per_message = false
        this.ensure_directories = conf ? conf.ensure_directories || false : false
        this.going_to_file_path = false
        //
        if ( conf.files_only ) {
            this.files_only = true
            this.file_shunting = true
            this.files_going = true
        }
        //
        if ( conf ) this._init(conf);
    }

    _init(conf) { 
        throw new Error("Descedant of class Messenger must implement _init.")
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // INBOUND MESSAGE DATA
    // The inbound message handlers (responses and unsolicited on this client socket)
    client_add_data_and_react(data) {
        let mqueue = this.messages
        mqueue.add_data(data)
        mqueue.message_complete()
        let message = undefined
        while ( mqueue.message_queue.length ) {
            message = mqueue.dequeue()
            if ( message._response_id !== undefined ) {
                let resolver = this.resp_vector.get_response_resolver(message._response_id)
                if ( typeof resolver === "function" ) {
                    resolver(message)
                } else {
                    /*
                    let e = new Error("did not have resolver on record")
                    //console.log(e)
                    console.dir(message)
                    let mmm = ""
                    for ( let i = 0; i < this.resp_vector.waiting_for_response.length; i++ ) {
                        let pp = this.resp_vector.waiting_for_response[i]
                        mmm += '(' + i + "," + pp.toString() + "), "
                    }
                    console.log(mmm)
                    */
                }
            } else {
                this._handle_unsolicited(message)
            }
        }
    }


    // OUTBOUND MESSAGE DATA
    _message_and_response(message,resolve,reject) {
        let id = this.resp_vector.get_response_id()
        if ( id < 0 ) {
            reject(new Error("send message max out... is server up?"))
        }
        message._response_id = id   // overwrites this if sender copied a forwarded object...
        let message_handler = (msg) => { 
            this.resp_vector.unlock_response_id(id);
            resolve(msg) 
        }
        this.resp_vector.lock_response_id(id,message_handler)
        //
        // write message
        let flat_message = this.messages.encode_message(message)

        if ( this.writer ) {
            //
            let err_handler = (err) => {
                this.writer.removeListener('error',err_handler)
                reject(err);
            }
            this.writer.on('error',err_handler);
            try {
                this.writer.write(flat_message);            // write message here....
            } catch (e) {
                this.resp_vector.unlock_response_id(id)
                console.log(e)
            } finally {
                // might reserve this until the response is received
                this.writer.removeListener('error',err_handler)
            }            //
        }
    }

    //
    // sendMessage
    // ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    // This sends messages to IP endpoints. But, it may also write to a file if that has been setup through configuration 
    // with files_only. Another reason data may be place in files is that the socket may close or be broken in some way.
    //
    // If sending through on the sockets, this method will only ever add _response_id to the object being sent. 
    // This class expects the server to send _response_id back so that it can find callers without thunking too much. 
    // _response_id finds the requeting socket and relays the results back. 
    //
    // _response_id is specifically generated by _get_response_id(). _get_response_id returns an index for a space in 
    //  waiting_for_response array.
    //
    sendMessage(message) {   // secondary queuing is possible
        return new Promise((resolve, reject) => {
            if ( this.files_only && this.files_going && (this.file_output !== undefined) ) {
                this._sendMessage_to_file(message)
                resolve("OK")  // can't ask the file to deliver a response
            } else {
                if ( this.files_going && (this.file_output !== undefined) ) {       // default to this when connections fail..
                    this._send_to_counted_stream(message)
                    resolve("OK")  // can't ask the file to deliver a response
                } else {
                    this._message_and_response(message,resolve,reject)
                }
            }
        });
    }


    // external event wrapper 
    wrap_event(wrapper_key) {
        if ( this.event_wrapper && this.event_wrapper.commission ) {
            this.event_wrapper.commission(wrapper_key)
        }
    }

    unwrap_event(wrapper_key) {
        if ( this.event_wrapper && this.event_wrapper.decommission  ) {
            this.event_wrapper.decommission(wrapper_key)
        }
    }

    // FILE SHUNTING ON DISCCONNECT
    // _start_file_shunting
    // make a stream ouput -- files_going = true
    async _start_file_shunting(conf) {
        let output_dir = process.cwd() + '/'
        if ( conf.output_dir !== undefined ) {
            output_dir = conf.output_dir
        }
        let output_file = this.shunt_file
        if ( conf.output_file !== undefined ) {
            output_file = conf.output_file
        }
        console.log(`falling back to ${output_dir + output_file}`)
        let fpath = await make_path(output_dir,output_file,this.ensure_directories)
        this.going_to_file_path = fpath
        this.file_output = fs.createWriteStream(fpath)
        this.files_going = true
    }

    // _shutdown_files_going --- connection reestablished
    // --- so stop writing to files
    // --- if configured, send message from files to connection
    async _shutdown_files_going(promise_buffer,send_on_reconnect) {
        this.files_going = false
        if ( send_on_reconnect ) {
            try {
                this.file_output.close()
                if ( typeof this.going_to_file_path === "string" ) {
                    let fpath = this.going_to_file_path
                    let messages = await fsPromise.readFile(fpath)
                    messages = messages.toString()
                    messages = '[' + messages.substr(0,messages.length-1) + ']'
                    try {
                        messages = this.messages.decode_message(messages)
                        if ( Array.isArray(messages) ) {
                            for ( let msg of messages ) {
                                let p = this.sendMessage(msg)
                                if ( promise_buffer && Array.isArray(promise_buffer) ) {
                                    promise_buffer.push(p)
                                }
                            }    
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }

            } catch (e){}
        }
    }


    restore_send(send_on_reconnect) {
        (async () => {
            let p_list = []
            await this._shutdown_files_going(p_list,send_on_reconnect)
            await Promise.all(p_list)
        })()
    }


    // FILE OUTPUT SELECTED
    async _setup_file_output(conf) {
        let output_dir = process.cwd()
        if ( conf.output_dir !== undefined ) {
            output_dir = conf.output_dir
        }
        let output_file = this.shunt_file
        if ( conf.output_file !== undefined ) {
            output_file = conf.output_file
        }
        console.log(`setting file output to ${output_dir + '/' + output_file}`)
        let fpath = await make_path(output_dir,output_file,this.ensure_directories)
        //
        if ( conf.file_per_message  ) {
            this.file_per_message = conf.file_per_message
        }
        //
        if ( this.file_per_message ) {
            this.file_count = 0;  // count file in dir
            this.file_date = Date.now()
            this.file_output = fpath
        } else {
            this.message_count = 0
            this.message_wrap_limit = conf.wrap_limit ? conf.wrap_limit : DEFAULT_CONF_WRAP_LIMIT
            this.save_fpath = fpath
            this.file_output = fs.createWriteStream(fpath)
        }
        this.files_going = true
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    _reset_file_stream() {
        this.message_count = 0
        this.file_output.close()
        let file_tag = Math.floor(Math.random()*100)
        fs.renameSync(this.save_fpath,this.save_fpath + '_' + Date.now() + '_' + file_tag)
        this.file_output = fs.createWriteStream(this.save_fpath)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    _handle_unsolicited(message) {
        if ( message !== undefined ) {
            let topic = message.topic
            let path = message._m_path
            this.emit(`update-${topic}-${path}`,message)
        } 
    }

    _send_to_counted_stream(message) {
        let string = this.messages.encode_message(message)
        this.message_count++
        if ( this.message_count >= this.message_wrap_limit ) {
            this._reset_file_stream()
        }
        this.file_output.write(string + ',','ascii')
    }

    _sendMessage_to_file(message) {
        if ( this.file_per_message ) {
            this.file_count++
            let fname = (this.file_output + '_' + this.file_date + '_' + this.file_count)
            let flat_message = this.messages.encode_message(message)
            fs.writeFile(fname,flat_message,(err) => {
                if ( err ) {
                    console.log(err)
                }
            })
        } else {
            this._send_to_counted_stream(message)
        }
    }


    // ---- ---- ---- ---- ---- ---- ----
    async publish(topic,path,message) {
        if ( !(topic) || !(path) ) return false
        if ( !(message) ) return false
        message._ps_op = "pub"
        message.topic = topic
        message._m_path = path
        try {
            return await this.sendMessage(message)            
        } catch (e) {
            console.log(e)
            return false
        }
    }

    // ---- ---- ---- ---- ---- ---- ----
    async subscribe(topic,path,message,handler) {
        if ( !(topic) || !(path) ) return false
        if ( !(message) ) return false
        if ( handler !== undefined && (typeof handler === "function") ) {
            this.on(`update-${topic}-${path}`,handler)
            this.subcriptions[`update-${topic}-${path}`] = handler
        }
        message._ps_op = "sub"
        message.topic = topic
        message._m_path = path
        try {
            return await this.sendMessage(message)            
        } catch (e) {
            console.log(e)
            return false
        }
    }

    // ---- ---- ---- ---- ---- ---- ----
    async unsubscribe(topic,path) {
        if ( !(topic) || !(path) ) return false
        let handler = this.subcriptions[`update-${topic}-${path}`]
        if ( handler ) {
            this.removeListener(`update-${topic}-${path}`,handler)
            delete this.subcriptions[`update-${topic}-${path}`]
        }
        let message = {
            "_ps_op" : "unsub",
            "topic" : topic
        }
        message._m_path = path
        try {
            return await this.sendMessage(message)            
        } catch (e) {
            console.log(e)
            return false
        }
    }


    //
    send(message) {     // sometimes synonyms help
        if ( !(message) ) return false
        return this.sendMessage(message)
    }

    //      returns a promise
    send_on_path(message,path) {
        try {
            let msg = Object.assign({},message)
            msg['_m_path'] = path
            return this.sendMessage(msg)
        } catch (e) {
            console.error(e)
            return false
        }
    }

    send_op_on_path(message,path,op) {
        if ( !(message) ) return false
        message._tx_op = op
        return this.send_on_path(message,path)
    }

    get_on_path(message,path) {
        if ( !(message) ) return false
        message._tx_op = 'G'
        return this.send_on_path(message,path)
    }

    set_on_path(message,path) {
        if ( !(message) ) return false
        message._tx_op = 'S'
        return this.send_on_path(message,path)
    }

    del_on_path(message,path) {
        if ( !(message) ) return false
        message._tx_op = 'D'
        return this.send_on_path(message,path)
    }

    publication_on_path(message,path) {
        if ( !(message) ) return false
        message._tx_op = 'P'
        return this.send_on_path(message,path)
    }

    unpublish_on_path(message,path) {
        if ( !(message) ) return false
        message._tx_op = 'U'
        return this.send_on_path(message,path)
    }


    //
    async sendMail(mail) {
        try {
            let msg = {}
            for ( let ky in mail ) {
                msg[ky] = encodeURIComponent(mail[ky])
            }
            msg['_m_path'] = EMAIL_PATH
            let response = await this.sendMessage(msg)
            if ( ((typeof response === 'string') && (response.trim() === "OK")) || (response.msg.trim() === "OK")  ) {
                return(true)
            } else {
                return(false)
            }
        } catch (e) {
            console.error(e)
        }
    }
}



module.exports = Communicator
module.exports.ResponseVector = ResponseVector