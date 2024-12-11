const ClientMessageRelay = require('./lib/message_relay_client.js')
const ServerMessageRelay = require('./lib/message_relay.js')
const ServerMessageEndpoint = require('./lib/message_endpoint.js')
const MultiRelayClient = require('./lib/mutli_relay_client')
const MultiPathRelayClient = require('./lib/mutli_path_relay_client')

const MessageRelayStartingPoint = require('./lib/message_relay_startpoint')
//
const {PathHandler,PeerPublishingHandler,ApplicationEndpointHandler,classes} = require('./path-handler/path-handler')

const ServerWithIPC = require('./lib/message_endpoint_as_child_with_ipc')
const IPCClient = require('./lib/message_relay_ipc')
const IPCChildClient = require('./lib/message_relay_ipc_source')
const ParentIPCMessenger = require('./lib/parent_ipc_message_relay.js')
//
const JSONMessageQueue = require('./json-message-queue')
const ResponseVector = require('./response-vector')
//
const UDPClient = require('./lib/message_relay_udp')
const UDPEndpoint = require('./lib/message_endpoint_udp')
const MulticastClient = require('./lib/message_relay_multicast')
const MulticastEndpoint = require('./lib/message_endpoint_multicast')
//
const MessageRelayContainer = require('./client-producer/cprod')
const MessageRelayManager = require('./client-producer/cmanager')
//
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//
module.exports.MessageRelayer = ClientMessageRelay
module.exports.ServeMessageRelay = ServerMessageRelay
module.exports.ServeMessageEndpoint = ServerMessageEndpoint
//
module.exports.PathHandler = PathHandler
module.exports.PeerPublishingHandler = PeerPublishingHandler
module.exports.ApplicationEndpointHandler = ApplicationEndpointHandler
module.exports.path_hanlder_classes = classes
module.exports.MultiRelayClient = MultiRelayClient
module.exports.MultiPathRelayClient = MultiPathRelayClient
//
module.exports.RelayCommunicator = ServerMessageRelay.Communicator
module.exports.EndpointCommunicator = ServerMessageEndpoint.Communicator
module.exports.MessengerCommunicator = ClientMessageRelay.Communicator
module.exports.MessengerCommunicatorAPI = ClientMessageRelay.CommunicatorAPI

module.exports.JSONMessageQueue = JSONMessageQueue
//
module.exports.ResponseVector = ResponseVector
//

//
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//
module.exports.ServerWithIPC = ServerWithIPC
module.exports.IPCClient = IPCClient
module.exports.IPCChildClient = IPCChildClient
module.exports.ParentIPCMessenger = ParentIPCMessenger

module.exports.ServerWithIPCommunicator = ServerWithIPC.Communicator
module.exports.IPCClientCommunicator = IPCClient.Communicator
module.exports.IPCChildClientCommunicator = IPCChildClient.Communicator

module.exports.JsonMessageHandlerRelay = ServerMessageRelay.JsonMessageHandlerRelay
module.exports.EndpointReplier = ServerMessageEndpoint.EndpointReplier

module.exports.UDPClient = UDPClient
module.exports.UDPEndpoint = UDPEndpoint
//
module.exports.MessageRelayContainer = MessageRelayContainer
module.exports.MessageRelayManager = MessageRelayManager
//
module.exports.MulticastClient = MulticastClient
module.exports.MulticastEndpoint = MulticastEndpoint
module.exports.MessageRelayStartingPoint = MessageRelayStartingPoint
//


/**
 * 
 * @param {object} conf 
 * @param {object} wrapper 
 * @param {Function} reporter 
 * @returns 
 */
module.exports.new_client_relay = async (conf,wrapper,reporter) => {
    let relayer = new ClientMessageRelay(conf,wrapper)
    let p = new Promise((resolve,reject) => {
        relayer.on('client-ready',(address,port) => {
            if ( typeof reporter === 'function' ) {
                reporter(address,port)
            }
            resolve(relayer)
        })
    })
    return p
}


/**
 * 
 * @param {object} conf 
 * @param {object} wrapper 
 * @param {Function} reporter 
 * @returns 
 */
module.exports.new_multi_peer_relay = async (conf,wrapper,reporter) => {
    let relayer = new MultiRelayClient(conf,wrapper)
    let p = new Promise((resolve,reject) => {
        relayer.on('peer-ready',(descr) => {
            if ( typeof reporter === 'function' ) {
                reporter(descr.address,descr.port,descrp['configured-address'])
            }
            resolve(relayer)
        })
    })
    return p
}


/**
 * 
 * @param {object} conf 
 * @param {object} wrapper 
 * @param {Function} reporter 
 * @returns 
 */
module.exports.new_multi_path_relay = async (conf,wrapper,reporter) => {
    let relayer = new MultiPathRelayClient(conf,wrapper)
    let p = new Promise((resolve,reject) => {
        relayer.on('peer-ready',(descr) => {
            if ( typeof reporter === 'function' ) {
                reporter(descr.path,descr.address,descr.port,descrp['configured-address'])
            }
            resolve(relayer)
        })
    })
    return p
}
