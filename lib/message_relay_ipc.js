'use strict';

const Communicator = require('./common_communicator')
const {spawn} = require('child_process')


const DEFAULT_MAX_RECONNECT = 20
const DEFAULT_RECONNECT_WAIT = 5


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

function spawn_child(proc_name) {
    let cproc = spawn('node',[proc_name],{ "stdio" : ["pipe","pipe","pipe","ipc"]})
    cproc.stderr.on('data',(data) => {
        console.log(data.toString())
    })
    cproc.stdout.on('data',(data) => {
        console.log(data.toString())
    })
    return cproc
}


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



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

class Client extends Communicator {

    constructor(conf,wrapper) {
        super(conf,wrapper)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _init_members(conf) {
        //
        this._proc = false
        this.c_pid = false
        this.conf = conf
        //----        //----       //----       //----       //----       //----
        this.send_on_reconnect = conf ? conf.send_on_reconnect || false : false
        //
        this.attempt_reconnect = false
        this.reconnect_wait = DEFAULT_RECONNECT_WAIT
        this.max_reconnect = DEFAULT_MAX_RECONNECT
        this.reconnect_count = 0
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    _create_connection(conf) {
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


    //
    _init(conf) {

        if ( conf === undefined ) {
            console.log("message relay client: cannot initialize -- no configuration")
            return;
        }

        this._init_members(conf)
        this._create_connection(conf)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // // // // // // 

    _connection_handler() {
        this.writer = new ProcWriter(this._proc)
        this.wrap_event(this.c_pid)
        this.reconnect_count = 0
        console.log(`Client connected to: ${this.c_pid} :  ${this.port}`);
        if ( this.files_going ) {  // then shunting had to be set to true.. file_only has to be false
            super.restore_send(this.send_on_reconnect)
        }
        this.emit('client-ready',this.c_pid,this.port)
    }

    // CONNECTION
    _connect() {
        // PUBLIC
        this._proc = spawn_child(this.conf.proc_name)
        this.c_pid = this._proc.pid
        this._connection_handler()
        //
    }

    // SET UP CONNECTION AND HANDLERS  on('close'...) on('data'...) on('error'...)
    // _setup_connection_handlers
    //
    _setup_connection_handlers(client,conf) {
        //
        // HANDLERS
        let c_proc = client._proc
        c_proc.on('close', (onErr) => {
            if ( onErr ) {
                console.log(`got a closing error on ${c_proc.pid}  a child process went down`)
            }
            this.unwrap_event(client.c_pid)
            console.log('Client closed');
            if ( client.attempt_reconnect ) {
                client._attempt_reconnect(conf)
            }
        })
        //
        // this process is the parent process of c_proc
        // when the child sends a message back, a message will be unlocked and then resolved
        // when it unsolicite, it will attempt to satisfy a subscription
        process.on('message',(data) => { client.client_add_data_and_react(data.msg) });
        //
        c_proc.on('error',async (err) => {
            this.unwrap_event(client.c_pid)
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
            this._connect()
            this._setup_connection_handlers(this,conf)
        }
    }

    closeAll() {
        this._proc.kill('SIGINT')
    }

}

//
module.exports = Client;
module.exports.Communicator = Communicator
