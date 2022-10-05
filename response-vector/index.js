// ResponseVector 
// class with no dependencies -- this keeps the response lambdas waiting for data back from a server
// does not address expiration.. does not provide optimization beyon javascript capability



const MAX_UNANSWERED_MESSAGES = 100



class ResponseVector {

    constructor(conf) {
        this.max_unanswered =  conf ? conf.max_pending_messages || MAX_UNANSWERED_MESSAGES : MAX_UNANSWERED_MESSAGES  
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

    setup_response_vector() {
        this.waiting_for_response = new Array(this.max_unanswered)
        this.waiting_for_response.fill(false,0,this.max_unanswered)
    }

    unlock_response_id(id) {
        this.waiting_for_response[id] = false
    }

    lock_response_id(id,fn) {
        this.waiting_for_response[id] = fn
    }
    
    get_response_resolver(id) {
        return this.waiting_for_response[id]
    }  

}




// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
module.exports = ResponseVector
module.exports.ResponseVector = ResponseVector
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
