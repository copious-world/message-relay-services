'use strict';

const fs = require('fs')
const fsPromise = require('fs/promises')
const {EventEmitter} = require('events')
const JSONMessageQueue = require('../json-message-queue')

const net = require('net');
const tls = require('tls');

const PORT = 1234;
const HOST = 'localhost';
const MAX_UNANSWERED_MESSAGES = 100
const DEFAULT_CONF_WRAP_LIMIT = 100
const DEFAULT_MAX_RECONNECT = 20
const DEFAULT_RECONNECT_WAIT = 5


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
    return front + output_file
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//
const EMAIL_PATH = 'outgo_email'        // app email -- likely to a spool file or mailbox file

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
// // 
class Client extends EventEmitter {
    //
    constructor(conf,wrapper) {
        //
        super()
        //
        this.subcriptions = {}
        this.messages = new JSONMessageQueue(false)
        //
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST

        this.resp_vector = new ResponseVector(conf)
        //
        this.socket = null
        //
        this.attempt_reconnect = false
        this.send_on_reconnect = conf ? conf.send_on_reconnect || false : false
        //
        this.use_tls = (conf.tls !== undefined)  && (conf.tls !== false)
        this.tls_conf = conf.tls
        //
        this.reconnect_wait = DEFAULT_RECONNECT_WAIT
        this.max_reconnect = DEFAULT_MAX_RECONNECT
        this.reconnect_count = 0
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

    //
    _init(conf) {
        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }
        if ( this.files_only ) {
            (async () => { await this._setup_file_output(conf) })()
        } else {
            this.attempt_reconnect = (conf.attempt_reconnect !== undefined) ? conf.attempt_reconnect : false
            if ( this.attempt_reconnect ) {
                this._configure_reconnect(conf)
            }
            this._connect()
            this._setup_connection_handlers(this,conf) 
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // INBOUND MESSAGE DATA
    // The inbound message handlers (responses and unsolicited on this client socket)
    _handle_message_data(data) {
        let mqueue = this.messages
        mqueue.add_data(data)
        mqueue.message_complete()
        let message = undefined
        if ( mqueue.message_queue.length ) {
            message = mqueue.dequeue()
            if ( message._response_id !== undefined ) {
                let resolver = this.resp_vector.get_response_resolver(message._response_id)
                resolver(message)
                return;
            } else {
                this._handle_unsolicited(message)
            }
        }
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // // // // // // 
    _connection_handler() {
        if ( this.event_wrapper ) {
            this.event_wrapper.commission(this.address)
        }
        this.reconnect_count = 0
        console.log(`Client connected to: ${this.address} :  ${this.port}`);
        if ( this.files_going ) {  // then shunting had to be set to true.. file_only has to be false
            this._shutdown_files_going()
        }
    }

    // CONNECTION
    _connect() {
        // PUBLIC
        if ( this.use_tls === false  ) {
            this.socket = new net.Socket();
            this.socket.connect(this.port, this.address,this._connection_handler);    
        } else {
            //
            // ENCRYPTED TLS
            const tls_options = {
                // Necessary only if the server requires client certificate authentication.
                key: fs.readFileSync(this.tls_conf.client_key),
                cert: fs.readFileSync(this.tls_conf.client_cert),
                // Necessary only if the server uses a self-signed certificate.
                ca: [ fs.readFileSync(this.tls_conf.server_cert) ],
                // Necessary only if the server's cert isn't for "localhost".
                checkServerIdentity: () => { return null; },
            };

            this.socket = tls.connect(this.port, this.address, tls_options, () => {
                if ( this.socket.authorized ) {
                    this._connection_handler()
                } else {
                    this.socket.end()
                }
            });
        }
    }

    // SET UP CONNECTION AND HANDLERS  on('close'...) on('data'...) on('error'...)
    // _setup_connection_handlers
    //
    _setup_connection_handlers(client,conf) {
        //
        // HANDLERS
        client.socket.on('close', (onErr) => {
            if ( onErr ) {
                console.log(`got a closing error on ${client.address} :  ${client.port}`)
            }
            if ( this.event_wrapper ) {
                this.event_wrapper.decommission(this.address)
            }
            console.log('Client closed');
            if ( client.attempt_reconnect ) {
                client._attempt_reconnect(conf)
            }
        })
        //
        client.socket.on('data',(data) => { this._handle_message_data(data) });
        //
        client.socket.on('error',async (err) => {
            if ( this.event_wrapper ) {
                this.event_wrapper.decommission(this.address)
            }
            console.log(__filename)
            console.log(err);
            if ( client.attempt_reconnect ) {
                if ( client.reconnect_count < client.max_reconnect ) {
                    return;
                }
            }
            if ( client.file_shunting ) {
                await client._start_file_shunting(conf)
            }
        })
        //
    }

    // RECONNECTION ATTEMPTS
    _configure_reconnect(conf) {
        this.max_reconnect = (conf.max_reconnect !== undefined) ? conf.max_reconnect : this.max_reconnect
        this.reconnect_wait = (conf.reconnect_wait !== undefined) ? conf.reconnect_wait : this.reconnect_wait
        if ( typeof this.reconnect_wait === "string" ) {
            this.reconnect_wait = parseInt(this.reconnect_wait)
        }
        this.reconnect_wait = this.reconnect_wait*1000
        this.reconnect_count = 0
    }

    //
    _attempt_reconnect(conf) {
        this.reconnect_count++
        if ( this.reconnect_count < this.max_reconnect ) {
            setTimeout(() => { 
                this._setup_connection_handlers(this,conf)
            },this.reconnect_wait)
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
    async _shutdown_files_going(promise_buffer) {
        this.files_going = false
        if ( this.send_on_reconnect ) {
            try {
                this.file_output.close()
                if ( this.going_to_file_path ) {
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
                    } catch (e) {}
                }

            } catch (e){}
        }
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

    //
    _message_and_response(message,resolve,reject) {
        let id = this.resp_vector.get_response_id()
        if ( id < 0 ) {
            reject(new Error("send message max out... is server up?"))
        }
        message._response_id = id
        let message_handler = (msg) => { this.resp_vector.unlock_response_id(message._response_id); resolve(msg) }
        this.resp_vector.lock_response_id(id,message_handler)
        //
        // write message
        let flat_message = this.messages.encode_message(message)
        this.socket.write(flat_message);
        //
        let err_handler = (err) => {
            this.socket.removeListener('error',err_handler)
            reject(err);
        }
        this.socket.on('error',err_handler);
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

    // ---- ---- ---- ---- ---- ---- ----
    async publish(topic,path,message) {
        if ( !(topic) || !(path) ) return false
        if ( !(message) ) return false
        message._ps_op = "pub"
        message.topic = topic
        message._m_path = path
        return await this.sendMessage(message)
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
        return await this.sendMessage(message)
    }

    // ---- ---- ---- ---- ---- ---- ----
    async unsubscribe(topic,path) {
        if ( !(topic) || !(path) ) return false
        let handler = this.subcriptions[`update-${topic}-${path}`]
        this.removeListener(`update-${topic}-${path}`,handler)
        delete this.subcriptions[`update-${topic}-${path}`]
        let message = {
            "_ps_op" : "unsub",
            "topic" : topic
        }
        message._m_path = path
        return await this.sendMessage(message)
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

    closeAll() {
        this.socket.destroy();
    }

}

//
module.exports = Client;
