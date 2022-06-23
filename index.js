const ClientMessageRelay = require('./lib/message_relay_client.js')
const ServerMessageRelay = require('./lib/message_relay.js')
const ServerMessageEndpoint = require('./lib/message_endpoint.js')
const MultiRelayClient = require('./lib/mutli_relay_client')
const MultiPathRelayClient = require('./lib/mutli_path_relay_client')
//
const {PathHandler,PeerPublishingHandler,classes} = require('./path-handler/path-handler')


const ServerWithIPC = require('./lib/message_endpoint_as_child_with_ipc')
const IPCClient = require('./lib/message_relay_ipc')
//
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//
module.exports.MessageRelayer = ClientMessageRelay
module.exports.ServeMessageRelay = ServerMessageRelay
module.exports.ServeMessageEndpoint = ServerMessageEndpoint
//
module.exports.PathHandler = PathHandler
module.exports.PeerPublishingHandler = PeerPublishingHandler
module.exports.path_hanlder_classes = classes
module.exports.MultiRelayClient = MultiRelayClient
module.exports.MultiPathRelayClient = MultiPathRelayClient

module.exports.RelayCommunicator = ServerMessageRelay.Communicator
module.exports.EndpointCommunicator = ServerMessageEndpoint.Communicator
module.exports.MessengerCommunicator = ClientMessageRelay.Communicator


//
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
//
module.exports.ServerWithIPC = ServerWithIPC
module.exports.IPCClient = IPCClient

module.exports.ServerWithIPCommunicator = ServerWithIPC.Communicator
module.exports.IPCClientCommunicator = IPCClient.Communicator