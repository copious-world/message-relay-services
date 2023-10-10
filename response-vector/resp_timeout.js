// ResponseVector 
// class with no dependencies -- this keeps the response lambdas waiting for data back from a server
// does not address expiration.. does not provide optimization beyon javascript capability



const MAX_UNANSWERED_MESSAGES = 100
const MAX_MESSAGES_WAIT_TIME = 1000*60*5 // 5 minutes
const CHECK_RATE = 10000*3  // 30 seconds



class ResponseVectorTimeout {  // there are enough changes that ResponseVector is not extended

    constructor(conf) {
        this.max_unanswered =  conf ? conf.max_pending_messages || MAX_UNANSWERED_MESSAGES : MAX_UNANSWERED_MESSAGES
        this.max_age = conf ? conf.max_message_wait_time || MAX_MESSAGES_WAIT_TIME : MAX_MESSAGES_WAIT_TIME
        this.rate_of_check = conf ? conf.message_age_check_interval || CHECK_RATE : CHECK_RATE
        this.aging_messages = {}
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
                this.aging_messages[try_index] = Date.now()
                return(try_index)
            }
            try_index++
        }
        try_index = 0
        while ( try_index < first_try ) {
            if ( this.waiting_for_response[try_index] === false ) {
                this.aging_messages[try_index] = Date.now() + this.max_age
                return(try_index)
            }
            try_index++
        }
        return(-1) // server might be down
    }

    setup_response_vector() {
        this.waiting_for_response = new Array(this.max_unanswered)
        this.waiting_for_response.fill(false,0,this.max_unanswered)
        setInterval(() => {
            let cur_time = Date.now()
            let removals = []
            for ( let [id,expire_time] of Object.entries(this.aging_messages) ) {
                if ( expire_time > cur_time ) {
                    removals.push(id)
                }
            }
            if ( removals.length ) {
                for ( let remid of removals ) {
                    delete this.aging_messages[remid]
                    let resolver = this.get_response_id(remid)
                    resolver({ "status" : "Err" , "reason" : "timeout"})
                    this.unlock_response_id(remid)
                }
            }
        },this.rate_of_check)
    }

    unlock_response_id(id) {
        this.waiting_for_response[id] = false
        if ( this.aging_messages[id] !== undefined ) {
            delete this.aging_messages[id]
        }
    }

    lock_response_id(id,fn) {
        this.waiting_for_response[id] = fn
    }
    
    get_response_resolver(id) {
        return this.waiting_for_response[id]
    }  

}




// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
module.exports = ResponseVectorTimeout
module.exports.ResponseVectorTimeout = ResponseVectorTimeout
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
