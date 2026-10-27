
// 

class JSONMessageQueue {

    constructor(decoder,encoder) {
        this.message_queue = []
        this.last_message = ''
        this.current_message = {}
        //
        if ( (decoder === undefined) || (decoder === false) ) {
            this.message_decoder = this.default_decoder
        } else if ( decoder !== this.decode_message ) {
            this.message_decoder = decoder
        } else {
            this.message_decoder = this.default_decoder
        }
        //
        if ( (encoder === undefined) || (encoder === false) ) {
            this.message_encoder = this.default_encoder
        } else if ( encoder !== this.message_encoder ) {
            this.message_encoder = encoder
        } else {
            this.message_encoder = this.default_encoder
        }
    }
    
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    set_decoder(decoder) {
        this.message_decoder = decoder
    }

    set_encoder(encoder) {
        this.message_encoder = encoder
    }

    default_decoder(str) {
        try {
            let m_obj = JSON.parse(str)
            return m_obj
        } catch (e) {
            console.error(e)
        }
        return false
    }

    default_encoder(j_obj) {
        return JSON.stringify(j_obj)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    add_data(data) {
        this.last_message += data.toString()
    }

    add_object(m_obj) {
        this.message_queue.push(m_obj)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    message_complete() {
        let msg = this.last_message
        this.last_message = ""
        //
        msg = msg.trim()
        //
        if ( !(msg.length) ) return
        //
        msg = msg.replace(/\}\s+\{/g,'}{')
        let raw_m_list = msg.split('}{')
        let rest = ""
        let n = raw_m_list.length
        for ( let i = 0; i < n; i++ ) {
            rest = raw_m_list[i]
            let str = rest
            if ( i < (n-1) ) str += '}'
            if ( i > 0 ) str = '{' + str
            let m_obj = this.message_decoder(str)
            if ( m_obj ) {
                this.message_queue.push(m_obj)              /// enqueue
            } else {
                if ( rest[0] === '{' ) { // this is the first message
                    this.last_message = rest
                } else {
                    this.last_message = '{' + rest
                }
            }
        }
    }

    //
    dequeue() {
        this.current_message = this.message_queue.shift()
        return this.current_message
    }


    encode_message(message) {
        return this.message_encoder(message)
    }

    decode_message(message_str) {
        return this.message_decoder(message_str)
    }

}




// For pub/sub, this is an endpoint server. So, there is no forwarding, as with a relayer. Any path semantics ends here.
// If this were an MQTT server, this would be enough to be a server (except for omitted parts of the standard)
// When a sub message comes in, it means that a client somewhere upstream sent a request to receive publication.
// When a publish message comes in, it mean that a client somewhere upstream sent a request for the message to go out 
// to all the subscribers to the topic.

/**
 * 
 */
class Replier extends JSONMessageQueue {

    //
    constructor(pars) {
        super(false,false)
        this.writer = pars.writer
        this.server = pars.server
        this.client_name = pars.client_name
    }

    //
    /**
     * Takes objects off the message queue and then uses their required messages fields to select
     * the operation that will be performed. 
     * Those messages with `_ps_op` values will work a pub/sub operations.
     * Otherwise, the server `app_message_handler` will be invoked for application specific operations.
     * All types of message will call upon the writer to send responses back to the server...
     */
    async dequeue_messages() {
        if ( this.message_queue.length ) {
            let msg_obj = this.dequeue()
            if (  msg_obj ) {  // pub/sub message category
                if ( (typeof msg_obj._ps_op !== undefined) && msg_obj._ps_op ) {
                    let topic = msg_obj.topic
                    let state = "OK"
                    let response_id = msg_obj._response_id      // send back what came in (if it is keep track of replies)
                    // _ps_op a pub/sub operation
                    switch ( msg_obj._ps_op ) {
                        case 'sub' : {      // this client will receive 
                            this.server.add_to_topic(topic,this.client_name,this)  // this.writer... keep track 
                            break;
                        }
                        case 'pub' : {  // came in on this client and will fan out to others
                            let ignore = this.writer
                            delete msg_obj._response_id
                            await this.server.send_to_all(topic,msg_obj,ignore,this)
                            break;
                        }
                        case 'unsub' : {        // remove from possible subscriptions
                            this.server.remove_from_topics(topic,this.client_name)
                            break;
                        }
                        default: {  // not in pub/sub vocab
                            state = "ERR"
                        }
                    }
                    let response = { "_response_id" : response_id, "state" : state }
                    let return_msg = this.encode_message(response)
                    this.writer.write(return_msg)     // actual reply
                } else {
                    let response_id = msg_obj._response_id
                    let response = await this.server.app_message_handler(msg_obj)
                    response._response_id = response_id
                    let return_msg = this.encode_message(response)
                    this.writer.write(return_msg)
                }
            }
        }
    }
}



module.exports = JSONMessageQueue
module.exports.Replier = Replier
