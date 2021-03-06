'use strict';

const fs = require('fs')
const {EventEmitter} = require('events')
 
const net = require('net');
const { type } = require('os');
const PORT = 1234;
const HOST = 'localhost';
const MAX_UNANSWERED_MESSAGES = 100
const DEFAULT_CONF_WRAP_LIMIT = 100
const DEFAULT_MAX_RECONNECT = 20
const DEFAULT_RECONNECT_WAIT = 5
 
// // 
class Client extends EventEmitter {
    //
    constructor(conf) {
        super()
        this.port = conf ? conf.port || PORT : PORT
        this.address = conf ? conf.address || HOST : HOST
        this.max_unanswered =  conf ? conf.max_pending_messages || MAX_UNANSWERED_MESSAGES : MAX_UNANSWERED_MESSAGES  
        this.file_shunting = conf ? conf.file_shunting || false : false
        this.files_only = false
        this.file_per_message = false
        //
        this.socket = null
        this.files_going = false
        this.attempt_reconnect = false
        //
        this.reconnect_wait = DEFAULT_RECONNECT_WAIT
        this.max_reconnect = DEFAULT_MAX_RECONNECT
        this.reconnect_count = 0
        if ( conf ) this.init(conf);
    }


    connection_processing(client,conf) {
        //
        client.waiting_for_response = new Array(client.max_unanswered)
        client.waiting_for_response.fill(false,0,client.max_unanswered)
        //
        client.socket = new net.Socket();
        //
        client.socket.connect(client.port, client.address, () => {
            client.reconnect_count = 0
            console.log(`Client connected to: ${client.address} :  ${client.port}`);
        });
        //
        client.socket.on('close', (onErr) => {
            if ( onErr ) {
                console.log(`got a closing error on ${client.address} :  ${client.port}`)
            }
            console.log('Client closed');
            if ( client.attempt_reconnect ) {
                client.reconnect_count++
                if ( client.reconnect_count < client.max_reconnect ) {
                    //
                    setTimeout(() => { 
                        client.connection_processing(client,conf)
                    },client.reconnect_wait)
                    //
                }
            }
        });
        //
        client.socket.on('data', (data) => {
            let str = data.toString()
            let message = undefined
            try {
                message = JSON.parse(str)
                if ( message._response_id !== undefined ) {
                    let resolver = client.waiting_for_response[message._response_id]
                    resolver(message)
                    return;
                }
            } catch (e) {
            }
            client.handle_unsolicited(str,message)
        });
        //
        client.socket.on('error',(err) => {
            console.log(__filename)
            console.log(err);
            if ( client.attempt_reconnect ) {
                if ( client.reconnect_count < client.max_reconnect ) {
                    return;
                }
            }
            if ( client.file_shunting ) {
                let output_dir = process.cwd()
                if ( conf.output_dir !== undefined ) {
                    output_dir = conf.output_dir
                }
                let output_file = '/message_relay.txt'
                if ( conf.output_file !== undefined ) {
                    output_file = conf.output_file
                }
                console.log(`falling back to ${output_dir + output_file}`)
                let fpath = output_dir + output_file
                client.file_output = fs.createWriteStream(fpath)
                client.files_going = true
            }
        })
    }

    //
    init(conf) {
        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }
        //
        if ( conf.files_only ) {
            this.files_only = true
            this.file_shunting = true
            this.files_going = true
            this.setup_file_output(conf)
        } else {
            this.attempt_reconnect = conf.attempt_reconnect ? conf.attempt_reconnect : false
            if ( this.attempt_reconnect ) {
                this.max_reconnect = conf.max_reconnect ? conf.max_reconnect : this.max_reconnect
                this.reconnect_wait = conf.reconnect_wait ? conf.reconnect_wait : this.reconnect_wait
                if ( typeof this.reconnect_wait === "string" ) {
                    this.reconnect_wait = parseInt(this.reconnect_wait)
                }
                this.reconnect_wait = this.reconnect_wait*1000
                this.reconnect_count = 0
            }
            //
            let client = this;
            this.connection_processing(client,conf) 
            //
        }
        //
    }


    setup_file_output(conf) {
        let output_dir = process.cwd()
        if ( conf.output_dir !== undefined ) {
            output_dir = conf.output_dir
        }
        let output_file = '/message_relay.txt'
        if ( conf.output_file !== undefined ) {
            output_file = conf.output_file
        }
        console.log(`setting file output to ${output_dir + '/' + output_file}`)
        let fpath = output_dir + '/' + output_file
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


    reset_file_stream() {
        this.message_count = 0
        this.file_output.close()
        let file_tag = Math.floor(Math.random()*100)
        fs.renameSync(this.save_fpath,this.save_fpath + '_' + Date.now() + '_' + file_tag)
        this.file_output = fs.createWriteStream(this.save_fpath)
    }

    //
    // get_response_id
    //      looks for a free position in the waiting_for_response array.
    //      Elements in use always contain resolver functions for relaying responses to waiting callers (await ...)
    //      usually found within 'async' functions.
    // 
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

    //
    handle_unsolicited(str,message) {
        if ( message === undefined ) {
            this.emit('update_string',str)
        } else {
            this.emit('update',message)
        }
    }

    send(message) {     // sometimes synonyms help
        return this.sendMessage(message)
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
    // _response_id is specifically generated by get_response_id(). get_response_id returns an index for a space in 
    //  waiting_for_response array.
    //
    sendMessage(message) {   // secondary queuing is possible
        return new Promise((resolve, reject) => {
            if ( this.files_only ) {
                if ( this.files_going ) {
                    if ( this.file_output !== undefined ) {
                        let flat_message = JSON.stringify(message)
                        if ( this.file_per_message ) {
                            this.file_count++
                            let fname = (this.file_output + '_' + this.file_date + '_' + this.file_count)
                            fs.writeFile(fname,flat_message,(err) => {
                                if ( err ) {
                                    console.log(err)
                                }
                            })
                            resolve("OK")
                            return;
                        } else {
                            this.message_count++
                            if ( this.message_count >= this.message_wrap_limit ) {
                                this.reset_file_stream()
                            }
                            this.file_output.write(flat_message,'ascii')
                            resolve("OK")  // can't ask the file to deliver a response
                            return;
                        }
                    }            
                }
            } else {
                let client = this;
                //
                if ( this.files_going ) {       // default to this when connections fail..
                    if ( this.file_output !== undefined ) {
                        let flat_message = JSON.stringify(message)
                        this.file_output.write(flat_message,'ascii')
                        resolve("OK")  // can't ask the file to deliver a response
                        return;
                    }
                } else {
                    let id = this.get_response_id()
                    if ( id < 0 ) {
                        reject(new Error("send message max out... is server up?"))
                    }
                    message._response_id = id
                    //
                    let flat_message = JSON.stringify(message)
                    this.waiting_for_response[message._response_id] = (msg) => {
                        this.waiting_for_response[message._response_id] = false
                        resolve(msg)
                    }
                    client.socket.write(flat_message);
                    //
                    //
                    client.socket.on('error', (err) => {
                        reject(err);
                    });
                    //

                }
            }
        });
    }

    async publish(topic,message) {
        message.ps_op = "pub"
        message.topic = topic
        return await this.sendMessage(message)
    }

    async subscribe(topic,message,handler) {
        if ( handler !== undefined && (typeof handler === "function") ) {
            this.on('update',handler)
        }
        message.ps_op = "sub"
        message.topic = topic
        return await this.sendMessage(message)
    }

    async subscribe_strings(topic,message,handler) {
        if ( handler !== undefined && (typeof handler === "function") ) {
            this.on('update_string',handler)
        }
        message.ps_op = "sub"
        message.topic = topic
        return await this.sendMessage(message)
    }

    

    //
    async sendMail(mail) {
        try {
            let msg = {}
            for ( let ky in mail ) {
                msg[ky] = encodeURIComponent(mail[ky])
            }
            msg['m_path'] = 'app_email'
            let response = await this.sendMessage(msg)
            if ( response.trim() === "OK" ) {
                return(true)
            } else {
                return(false)
            }
        } catch (e) {
            console.error(e)
        }
    }

    closeAll() {
        let client = this;
        client.socket.destroy();
    }

}

//
module.exports = Client;
