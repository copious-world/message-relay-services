'use strict';
 
// load the Node.js TCP library
const Server = require('./message_endpoint')
const EventEmitter = require('events')
const dgram = require('dgram')

const UDP_TYPE = 'udp4'
const NOISY = false

const BIG_TIMEOUT_INTERVAL = 1000*60*30


class NOOPWriter extends EventEmitter {
    constructor() {}
    write(message) {}
}


/**
 * 
 */
class UDPWriter extends EventEmitter {

    constructor(address,port) {
        super()
        // this is a child process sending generically to the parent the process.send
        this.readyState = (typeof process.send === "function") ? 'open' : 'closed'
        this.con = false
        this.address = address
        this.port = port
    }

    set_connection(socket) {
        this.con = socket
    }

    //
    write(message) {
        if ( !this.con ) return
        let msg = {
            "pid" : process.pid,
            "msg" : message
        }
        this.con.send(msg,this.port,this.address)
    }

}



//
class ServerUDP extends Server {
    //
    constructor(conf) {
        super(conf)
        this.time_out_table = {}
        this.no_op_writer = new NOOPWriter()
        this.no_keeps = conf.no_keeps ? true : false
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    _init_members(conf) {
        super._init_members(conf)
        this.udp_type = conf ? conf.udp4or6 || UDP_TYPE : UDP_TYPE
        this.time_out_interval = setInterval(() => {
            let t = Date.now()
            let removals = []
            for ( let [client_name,access_time] of Object.entries(this.time_out_table) ) {
                if ( t - access_time > BIG_TIMEOUT_INTERVAL*3 ) {
                    this.remove_connection(client_name)
                    removals.push(client_name)
                }
            }
            for ( let cname of removals ) {
                this.remove_connection(cname)
            }
        },BIG_TIMEOUT_INTERVAL)
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    onListenting_func(sock) {
        // // 
        
        this.p_proc_writer.set_connection(sock)

        //
        sock.on('message', async (data, rinfo) => {
            //
            let client_name = `${rinfo.remoteAddress}:${rinfo.remotePort}`;
            if ( NOISY ) console.log(`new client connected: ${client_name}`);
            //
            try {
                let dstr = data.toString()
                let mobj = JSON.parse(dstr)
                //
                let prev_writer = this.has_connection(client_name)
                let save_writer = false
                if ( prev_writer === false ) {
                    let a_writer = mobj._no_resp ? this.no_op_writer : new UDPWriter(rinfo.remoteAddres,rinfo.remotePort);
                    this.add_connection(client_name,a_writer)    
                } else {
                    if ( mobj._no_resp && (prev_writer !== this.no_op_writer) ) {
                        save_writer = prev_writer
                        this.add_connection(client_name,this.no_op_writer)
                    }  // else don't change the writer (it must handle pub/sub)
                }
                //
                await this.add_object_and_react(client_name,mobj)
                if ( save_writer ) {
                    this.add_connection(client_name,save_writer)   
                }
                if ( !this.no_keeps && (save_writer || (mobj._ps_op && ( mobj._ps_op == 'sub' || mobj._ps_op == 'pub' ))) ) {
                    this.time_out_table[client_name] = Date.now()
                } else {
                    this.remove_connection(client_name)
                }
            } catch (e) {}
        });
        //
        sock.on('close', () => {
            sock.end()
        });
        //
        sock.on('error', (err) => {
            console.error(`Connection ${client_name} error: ${err.message}`);
        });
        //
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    _create_connection() {
        //
        this.connection = dgram.createSocket(this.udp_type)

        this.connection.on('listening',() => {
            const address = server.address();
            console.log(`server listening ${address.address}:${address.port}`);
            this.onListenting_func(this.connection)
        })

        this.connection.bind(this.port,this.address)
        //
    }

}

//
module.exports = ServerUDP;
