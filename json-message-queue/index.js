
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
                this.last_message = '{' + rest
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



module.exports = JSONMessageQueue
