
class JSONMessageQueue {

    constructor(decoder) {
        this.message_queue = []
        this.last_message = ''
        this.message_paths = []
        this.messenger_connections = {}
        this.subscriptions = {}
        this.current_message = {}
        this.message_decoder = decoder
        if ( decoder === false ) {
            this.message_decoder = this.default_decoder
        }
    }
    
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    set_decoder(decoder) {
        this.message_decoder = decoder
    }

    default_decoder(str) {
        try {
            let m_obj = JSON.parse(str)
            return m_obj
        } catch (e) {
            console.log(e)
        }
        return false
    }
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    add_data(data) {
        this.last_message += data.toString()
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    //
    message_complete() {
        let msg = this.last_message
        msg = msg.trim()
        //console.log(msg)
        if ( !(msg.length) ) return ""
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
                mescon.last_message = rest
            }
        }
        mescon.last_message = ""
    }

    //
    dequeue() {
        this.current_message = this.message_queue.shift()
        return this.current_message
    }

}



module.exports = JSONMessageQueue
