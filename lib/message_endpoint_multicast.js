'use strict';
 
// an intermediate endpoint implementation
//
const UDPServer = require('./message_endpoint_udp')
const dgram = require('dgram')

const DEFAULT_MULTICAST_ADDR = '224.0.0.1'


//
/**
 * 
 */
class ServerMulticast extends UDPServer {
    //
    constructor(conf) {
        super(conf)
        this.multicast_addr = conf.multicast_addr ? conf.multicast_addr : DEFAULT_MULTICAST_ADDR
        this.multicast_port_map = conf.multicast_port_map
        this.all_topic_servers = {}
        //
        this.dgg_count = 0
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    // add_to_topic
    //  any connection that sends a subscription message to this endpoint will be included for possible publication
    /**
     * 
     * @param {string} topic 
     * @param {string} client_name 
     * @param {object} relayer 
     */
    add_to_topic(topic,client_name,relayer) {
        console.log(`add_to_topic -- ${topic} ${client_name} `,this.dgg_count++)
        let tset = this.all_topics[topic]
        if ( tset == undefined ) {
            tset = {}
            this.all_topics[topic] = tset
            //
            let server = dgram.createSocket(this.udp_type); 
            this.all_topic_servers[topic] = server
            //
            let port = this.multicast_port_map[topic]
            //
            server.bind({ 'port' : port },() => {
                server.setBroadcast(true)
                server.setMulticastTTL(128);            
            })
            //
        }
        tset[client_name] = relayer   // this is the Replier that called this method. This means a client somehwere asked for a subscription
        this.app_post_start_subscription(topic,client_name,relayer)
    }


    // send_to_all
    //  send to all connections on the topic except the one that published
    /**
     * Adds to the parent implementation and uses some of its code for the default case.
     * 
     * @param {*} topic 
     * @param {*} msg_obj 
     * @param {*} ignore 
     * @returns 
     */
    async send_to_all(topic,msg_obj,ignore,replier) {     // publish to all conncetions (fan out)
        //
        if ( this.app_can_block_and_respond ) {
            let blocked = await this.app_publication_pre_fan_response(topic,msg_obj,ignore)
            if ( blocked ) return
        }
        let tset = this.all_topics[topic]   // topic map -- all subscription clients
        //
        if ( tset ) {
            let server = this.all_topic_servers[topic]
            if ( server ) {
                let str_msg = replier.encode_message(msg_obj)
                //
                server.send(str_msg, 0, str_msg.length, this.multicast_port_map[topic], this.multicast_addr);
                //
                if ( this.app_handles_subscriptions ) {     // (override) this application acts as an endpoint to the topic
                    this.app_subscription_handler(topic,msg_obj)
                }
            }
        }
        //
    }

}

//
module.exports = ServerMulticast;

