const {Communicator} = require('./message_endpoint')



class ParentIPCMessenger extends Communicator {

    constructor(proc_conf) {
        super(proc_conf)
        this.attempt_reconnect = proc_conf.attempt_reconnect
        this.proc_name = proc_conf.name
        this.conf = proc_conf
        this.resolver = false
        this.child_proc = false
    }

    _init(conf) {}

    get(any) {
        console.log("descendants of ParentIPCMessenger must implement get")
        process.exit(1)
    }

    set(hash,v,op_msg) {
        console.log("descendants of ParentIPCMessenger must implement set")
        process.exit(1)
    }

    del(any) {
        console.log("descendants of ParentIPCMessenger must implement del")
        process.exit(1)
    }

    client_add_data_and_react(op_msg) {
        if ( typeof op_msg === "string" ) {
            op_msg = JSON.parse(op_msg)
        }
        switch ( op_msg._tx_op ) {
            case "G" : {
                let v = this.get(op_msg.hash,op_msg)
                if ( v !== undefined ) {
                    this.send_back({ "hash" : op_msg.hash, "v" : v, "_response_id" : op_msg._response_id })
                } else {
                    this.send_back({ "hash" : op_msg.hash, "err" : "none", "_response_id" : op_msg._response_id  })
                }
                break;
            }
            case "S" : {
                let status = this.set(op_msg.hash,op_msg.v,op_msg)
                this.send_back({ "hash" : op_msg.hash, "OK" : status, "_response_id" : op_msg._response_id  })
                break;
            }
            case "D" : {
                let status = this.del(op_msg.hash,op_msg)
                this.send_back({ "hash" : op_msg.hash, "OK" : status, "_response_id" : op_msg._response_id  })
                break;
            }
            case "M" : {
                let v = this.get(op_msg.hash,op_msg)
                if ( v !== undefined ) {
                    let status = this.set(op_msg.hash,op_msg.v,op_msg)
                    this.send_back({ "hash" : op_msg.hash, "OK" : status, "_response_id" : op_msg._response_id  })
                }
                break;
            }
        }
    }

    _attempt_reconnect(conf) {
        // decendant sets policy
    }

    // ---- ---- ---- ---- ---- ---- ----
    //
    child_controls(client,c_proc) {
        if ( c_proc ) {
            this.running = true
            //
            c_proc.on('close', (onErr) => {
                console.log(`Process ${this.proc_name} stopped...`)
                if ( this.resolver !== false ) {
                    this.resolver()
                }
                if ( onErr ) {
                    console.log(`got a closing error on ${c_proc.pid}  a child process went down`)
                }
                this.running = false
                console.log('Client closed');
                if ( client.attempt_reconnect ) {
                    client._attempt_reconnect(this.conf)
                }
            })
            //
            // this process is the parent process of c_proc
            // when the child sends a message back, a message will be unlocked and then resolved
            // when it unsolicite, it will attempt to satisfy a subscription
            c_proc.on('message',(data) => {
                client.client_add_data_and_react(data.msg)
            });
            //
            c_proc.on('error',async (err) => {
                console.log(__filename)
                console.log(err);
            })
            //
        }
    }


    send_back(msg_obj) {
        let c_proc = this.child_proc
        if ( !c_proc ) return
        let com_msg = {     // comes of mimicing network messages.
            "msg" : JSON.stringify(msg_obj)
        }
        c_proc.send(com_msg)
    }


    set_child_process(a_child_proc) {
        this.child_proc = a_child_proc
    }

    // ---- ---- ---- ---- ---- ---- ---- ----
}


module.exports = ParentIPCMessenger

