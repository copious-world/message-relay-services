

class JSONMessageQueue {

    constructor() {
        this.message_queue = []
        this.last_message = ''
        this.message_paths = []
        this.messenger_connections = {}
        this.subscriptions = {}
    }
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
            try {
                let m_obj = JSON.parse(str)
                this.message_queue.push(m_obj)              /// enqueue
            } catch (e) {
                console.log(e)
                mescon.last_message = rest
            }
        }
        mescon.last_message = ""
    }

    //
    dequeue() {
        this.current_message = this.message_queue.shift()
    }

}



module.exports = JSONMessageQueue