# message-relay-services


These classes provide the base classes for managing JSON communication between clients and servers.

* **Communication classes using JSON**
* **Client classes with common communication methods**
* **Server classes**: ***application endpoints*** and ***switching relays***

<a name="top-of-doc"/></a> 

## Package Overview

This javascript package exposes four basic classes, two extension classes, a class for intercepting publication on a path, and two classes for using IPC communication, and finally the message queuing class:

1. [**MessageRelayer**](#messagerelayer-class)
2. [**ServeMessageRelay**](#servemessagerelay-class)
3. [**ServeMessageEndpoint**](#servemessageendpoint-class)
4. [**PathHandler**](#pathhandler-class)
5. [**PeerPublishingHandler**](#peerpublishinghandler-class)
6. [**MultiRelayClient**](#multirelayclient-class)
7. [**MultiPathRelayClient**](#multipathrelayclient-class)
8. [**ServerWithIPC**](#serverwithipc-class)
9. [**IPCClient**](#ipcclient-class)
10. [**UDPClient**](#udpclient-class)
11. [**UDPEndpoint**](#udpendpoint-class)
12. [**MulticastClient**](#multicastclient-class)
13. [**MulticastEndpoint**](#multicastendpoint-class)
14. [**MessageRelayContainer**](#relaycontainer-class)
15. [**MessageRelayManager**](#relaymanager-class)
16. [**JSONMessageQueue**](#jsonmessagequeue-class)
17. [**ResponseVector**](#responsevector-class)
18. [**ResponseVectorTimeout**](#responsevectortimeout-class)


Most of the time, applications should override these classes and create instance methods. Occasionally, the client classes only need special configuration. The server classes will need to be overridden more often. Examples will be given. Other classes, outlined below, which help customization are exposed as well. 

A high level overview of the classes can be found in the [overview](#top-of-overview) section.
The full definition of the classes is in the section, [Classes](#classes-class)


### Install
```
npm install message-relay-services
```

### Purpose

These classes provide the base classes for managing JSON communication between clients and servers. 

Instances of these classes pass **JSON** objects through ***pathways*** from application clients to application server endpoints. There is also a very simple pub/sub mechanism implemented in these classes as well; as it happens, the pub/sub mechanism is sometimes more useful than some of the call and response methods.

The main use of these classes has been for transfering meta data (data about data) from a web dashboards and desktop applications to services that provide information for small servers such as blogs. For example, one current application writes JSON objects to directories on a machine that hosts blog servers. In such applications, some of the meta data may refer to IDs of data which can be used to attain access to larger data objects outside the realm of the cluster.

The JSON messaging expects small JSON objects to be sent from process to process. Attention to the segmentation of large files is not part of the implementation of these classes. As such, large amounts of data are not accounted for. Instead, the objects may refer to larger data which may be transfered through respository gateways. Repository gateways, implemented in other packages, may interface to distributed file systems such as IPFS or bittorent or Chia. Outside references, identification of ownership of data, etc. may be part of the meta data. A number of paragraphs, human written text descriptions of data, may be within the JSON objects. The limits of JSON object size are determined by the networking operating system, node.js parameters, and JavaScript JSON parsing limits. Custom applications, those that override some of the messaging support classes, may find ways to get around these limits.

The network architecture that these classes are meant for is one that is fairly well fixed. For example, these may work well for applications in a cluster. So, preconfiguration of IP addresses is assumed. (*However, the* ***multi*** *classes provide for adding and removing connectors. For instance, in* ***MultiPathRelayClient***, *paths may be added and deleted, each with its own connection.*)

These classes, here in message-relay-services, don't examine meta data objects. They just pass messages. Some might refer to meta data carried in messages to be the "payload" of the message. But, we can say that ***these classes add particular fields to JSON messages to aid in their transport***. The benefit of this is that the application does not have to bother with adding the fields. The drawback can be that the field names are chosen constants which might interfere with an application; however, the have been chosen to make that coincidense unlikely. Please see the section on [reserved field names](#reserved-field-names).

As far as networking and message queue subsystems go, those looking for a much larger suite of capabilities should look elsewhere. The idea here is that these classes supply sufficient communication for bootstrapping a small cluster based website. It may be the case that the classes comprise a simple enough of a framework for language transpilation a well, allowing applications first prototyped in JavaScript to be moved to other languages.

<a name="top-of-overview"></a>
## Overview of Classes

The classes listed above are default Internet classes that provde TCP or TLS clients and servers. Also, the first three modules each expose a [*Communicator*](#communicator-class) class.

The following sections are part of the overview:

* [Classification of Classes](#classification-of-classes)
* [Messages](#oveview-message)
* [Pathways](#oveview-pathways)
* [Multi-path Clients](#oveview-multi-path)
* [Configuration](#oveview-configuration)
* [Special Events](#oveview-special-events)

<a name="classification-of-classes"></a>
[top of oveview](#top-of-overview)
### Classification of Classes

Here is the same list broken down into its subclasses.

#### Servers

* [**ServeMessageRelay**](#servemessagerelay-class)
* [**ServeMessageEndpoint**](#servemessageendpoint-class)
* [**ServerWithIPC**](#serverwithipc-class)
* [**UDPEndpoint**](#udpendpoint-class)
* [**MulticastEndpoint**](#multicastendpoint-class)

#### Clients

* [**MessageRelayer**](#messagerelayer-class)
* [**MultiRelayClient**](#multirelayclient-class)
* [**MultiPathRelayClient**](#multipathrelayclient-class)
* [**IPCClient**](#ipcclient-class)
* [**UDPClient**](#udpclient-class)
* [**MulticastEndpoint**](#multicastendpoint-class)

#### path relay
* [**PathHandler**](#pathhandler-class)
* [**PeerPublishingHandler**](#peerpublishinghandler-class)

#### message buffering and parsing

* [**JSONMessageQueue**](#jsonmessagequeue-class)


#### Communicators

* [**RelayCommunicator**](#communicator-class)
* [**EndpointCommunicator**](#communicator-class)
* [**MessengerCommunicator**](#communicator-class)
* [**MessengerCommunicatorAPI**](#communicator-class)


#### Relay Containers and Managers

* [**MessageRelayContainer**](#relaycontainer-class)
* [**MessageRelayManager**](#relaymanager-class)

#### Resonse Resolution Managers

* [**ResponseVector**](#responsevector-class)
* [**ResponseVectorTimeout**](#responsevectortimeout-class)

<a name="oveview-message"></a>
[top of oveview](#top-of-overview)
#### Messages

With respect to the classes provided here, all messages are **JSON** objects. The JSON objects will have the structure required by the endpoint that consumes them. For the sake of passing the JSON objects through the servers, some particular field will be required. Application code must put in one or two fields with specific values. Some of the class methods will help in adding these fields.

* **\_m\_path** identifies the path for the message. The set of path tags can be defined by the application. 
* **\_tx\_op** identifies an operation that specifies a limited set of operations identified by a single character. Among these are 'S','G','D' for Set, Get, and Delete
* **\_ps\_op** identifies a **pub/sub** operation.
* **topic** identifies a **pub/sub** topic.
* **\_response\_id** is a field that the MessageRelayer adds to a message object in order to identify responses with message that were sent. Applications should not add this field to the top layer of their application messages.

These are the only fields reserved by this package. (Note that *topic* is the only field without the underscore.)

<a name="oveview-pathways"></a>
[top of oveview](#top-of-overview)
### Pathways

A **pathway**, as far as this package is concerned, is a *tagged* pathway from a client to an endpoint though servers. A **tag** is attached to a message.  (The message object field for this is **\_m\_path**.)

The *ServeMessageRelay* instances use the path to hand of messages to downstream servers which might be specialized for handling messages on the paths. Usually, instances of *ServeMessageEndpoint* will provide custom code for handling messages at the end of a path.

The set of path tags can be defined by the application. *ServeMessageRelay* takes a configuration object. In the configuration object, there are two fields that may be used to define paths through the *ServeMessageRelay*  instance.

* **path_types** : [ \<a list of path tags as strings\> ]
* **path\_handler\_factory** : \<the name of a module containing a PathHandler implementation\>

It's up to the application to make the *PathHandler* objects as simple or complex as they want. Perhaps path switching can be done. And, there is nothing stopping an application from chaining instances of *ServeMessageRelay*.

<a name="oveview-multi-path"></a>
[top of oveview](#top-of-overview)
### Multi-path Clients

In this group of modules, *MultiRelayClient* is deemed an extension class. It is a wrapper around a collection of *MessageRelayer* objects. It allows a rough form of load balancing for those applications using more than one peer processor. The class *MultiPathRelayClient* is a wrapper around a collection of MessageRelayer objects, also. This allows for a client to connect on specific paths to some number of endpoints severs without a *MessageRelayer* in between, or it might connect to many different relayers each supporting some subset of paths that it uses.

<a name="oveview-configuration"></a>
[top of oveview](#top-of-overview)
### Configuration

Please refer to the configuration sections within each class description.

#### TLS

Follow the node.js settings for TLS configuration.

For using application supplied keys and certs, configurations include a *tls* field wich is a structure as such: 

Server Version in *ServeMessageRelay* and *ServeMessageEndpoint*:

```
// the configuration JSON
// conf
{
	tls : {
		"server_key" : "server key pem file",
		"server_cert" : "server cert file",
		"client_cert" : "client cert file"
	}
}

// Later these are translated into options: 

this.tls_conf = conf.tls
let base = process.cwd()
const options = {
    key: fs.readFileSync(`${base}/${this.tls_conf.client_key}`),
    cert: fs.readFileSync(`${base}/${this.tls_conf.client_cert}`),
    ca: [ fs.readFileSync(`${base}/${this.tls_conf.server_cert}`) ],
    checkServerIdentity: () => { return null; },
};

```

Client Version in *MessageRelayer*:

```
// the configuration JSON
// conf
{
	tls : {
		"client_key" : "client key pem file",
		"client_cert" : "client cert file",
		"server_cert" : "server cert file"
	}
}

// Later these are translated into options: 

let base = process.cwd()
const tls_options = {
    key: fs.readFileSync(`${base}/${this.tls_conf.client_key}`),
    cert: fs.readFileSync(`${base}/${this.tls_conf.client_cert}`),
    ca: [ fs.readFileSync(`${base}/${this.tls_conf.server_cert}`) ],
    checkServerIdentity: () => { return null; },
};

```

##### <u>Further TLS Options</u>

It is possible to load keys long before communicator object creation. In this case, a runtime object may be attached to the tls option of a configuration object. Most of the time configuration objects will be just the JSON configuration object that was loaded from a JSON formatted text file and parsed. But, keys may be added after parsing and prior to the invokation of the constructor. A field name, *preloaded* may be added (optionally) to the *tls* part of the constructor.

```
// the configuration JSON
// conf
let conf = {
	tls : {
		"client_key" : "client key pem file",
		"client_cert" : "client cert file",
		"server_cert" : "server cert file"
		"preloadd" : false
	}
}


conf.tls.preloaded.client_key = load_file_sync(conf.tls.client_key)
conf.tls.preloaded.client_cert = load_file_sync(conf.tls.client_cert)
conf.tls.preloaded.server_cert = load_file_sync(conf.tls.server_cert)

let client = new Relayer(conf)

```


<a name="oveview-special-events"></a>
[top of oveview](#top-of-overview)
## Special Events

Special events pertain to the following classes:

* **MessageRelayer**
* **MultiRelayClient**
* **MultiPathRelayClient**

There are a few events available at the application level that relay the connection event emitted to a client. Some applications will want to wait for these events before sending messages.

If files contain messages due to a lapse, in connection, messages will begin forwarded before these events are emitted.

* **MessageRelayer** `on('client-ready', (address,port) => { ... })`

> The addess is the connection address and the port is the connection port.

* **MultiRelayClient** `on('peer-ready',(info)=> {...})` 

> Info is the following:
> 
> ```
> {
    'port' : port,
    'address' : addr,
    'configured-address' : address
}
```
>
> *addr* and *address* should be the same.

* **MultiPathRelayClient** `on('path-ready',(info)=> {...})` 

> Info is the following:
> 
>```
> {
    'path' : path,
    'port' : port,
    'address' : addr,
    'configured-address' : address
}
```
>
> *addr* and *address* should be the same.


#### Async Client Relay Factory

This package makes a method available for use in async fucntion contexts, **new\_client\_relay**.

This method takes the same parameters as the constructor for **MessageRelayer**.  This method is a wrapper of the event 'client-ready'.

Here is an example of its use:

```
const {new_client_relay} = require('message-relay-services')

async function com_processings(conf) {
	let relayer = await new_client_relay(conf)
	// now the relay is ready for use
	relayer.subscribe("topic1","a-path", (message) => {})
}

```

Similarly, for each multi connection client class, a methods is available.

* MultiRelayClient -> new\_multi\_peer\_relay
* MultiPathRelayClient -> new\_multi\_path\_relay

Here are examples of their uses:

**MultiRelayClient**

```
const {new_multi_peer_relay} = require('message-relay-services')

async function com_processings(conf) {
	let relayer = await new_multi_peer_relay(conf)
	// now the relay is ready for use
	relayer.subscribe("topic1","a-path", (message) => {})
}

```

**MultiPathRelayClient**

```
const {new_multi_path_relay} = require('message-relay-services')

async function com_processings(conf) {
	let relayer = await new_multi_path_relay(conf)
	// now the relay is ready for use
	relayer.subscribe("topic1","a-path", (message) => {})
}

```



<a name="classes-class"/></a> [back to top](#top-of-doc)
## Classes

The definition of class begins here.


1. [**MessageRelayer**](#messagerelayer-class)
2. [**ServeMessageRelay**](#servemessagerelay-class)
3. [**ServeMessageEndpoint**](#servemessageendpoint-class)
4. [**PathHandler**](#pathhandler-class)
5. [**PeerPublishingHandler**](#peerpublishinghandler-class)
6. [**MultiRelayClient**](#multirelayclient-class)
7. [**MultiPathRelayClient**](#multipathrelayclient-class)
8. [**ServerWithIPC**](#serverwithipc-class)
9. [**IPCClient**](#ipcclient-class)
10. [**UDPClient**](#udpclient-class)
11. [**UDPEndpoint**](#udpendpoint-class)
12. [**MulticastClient**](#multicastclient-class)
13. [**MulticastEndpoint**](#multicastendpoint-class)
14. [**MessageRelayContainer**](#relaycontainer-class)
15. [**MessageRelayManager**](#relaymanager-class)
16. [**JSONMessageQueue**](#jsonmessagequeue-class)
17. [**ResponseVector**](#responsevector-class)
18. [**ResponseVectorTimeout**](#responsevectortimeout-class)

<a name="communicator-class"/></a> [back to top](#top-of-doc)
### Communicator Class

The communicator class provides a basic (vanilla) set of methods for communication that all client class use or override. The classes expect that communications made through writers and message queues will be provided by descendant classes.

The client class provide just enough to send and receive messages provided its descendants implement the appropirate writers,

#### clients communicatos
* [**MessengerCommunicator**](#communicator-class)
* [**MessengerCommunicatorAPI**](#messengercommunicatorapi-class)

#### server communicators
* [**RelayCommunicator**](#communicator-class)
* [**EndpointCommunicator**](#communicator-class)


<a name="messengercommunicatorapi-class" ></a>
#### MessengerCommunicatorAPI *Methods*


*  **async publish(topic,message)**
> Adds the **\_ps\_op** field = 'pub'
> Sets the **topic** filed to topic
> Send the messages

*  **async subscribe(topic,path,message,handler)**
> Subscribes to a topic along the path.
> The message object may be an empty object, or it may contain data for use by an endpoint.
> The handler will run when pulications arrive along this pathway. The handler should have a single parameter for the inbound publication message.

*  **unsubscribe(topic,path)**
> Stop listening to publications to the topic along the path.

*  **send\_on\_path(message,path)**
> Send a message along the path. The **\_m\_path** field will be added.
> When the message relay service is used, it will pick a relay client (networked through a MessageRelayer) that is configured for the path and send the message through it. These client objects are application specific. But, they use general methods expected by ServeMessageRelay. 

*  **send\_op\_on\_path(message,path,op)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = op.

*  **set\_on\_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'S'.

*  **get\_on\_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'G'.

*  **del\_on\_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'D'.



#### Specialized Communicators

The following classes are specialized communicators.

* **RelayCommunicator**
* **EndpointCommunicator**
* **MessengerCommunicator**

The classes make connections with other processes communicating with the type of connection provided by their writer classes.

These classes only know of a **writer** object they are assigned. Otherwise, they have two similar methods, 

1) **add\_data\_and\_react(**client\_name**,**buffer**)** ...for **servers**   
2) **client\_add\_data\_and\_react(**buffer**)** ..for **clients**. 

These methods take in a data buffer which carries some part of a string represenation of a JSON object, brace delimited **\{\}**. Descendants of the these classes may set the **writer** object once communication is established. For example, the default classes include the following line:

```
this.writer = socket // where socket is returned from connect
```

In the IPC classes, the writer object is customized for IPC communication and the startup of child processes. This uses the node.js flavor of launching subproceses along with its exposed message handling between parents and children.


<a name="messagerelayer-class"/></a> [back to top](#top-of-doc)
### 1. **MessageRelayer**

**MessageRelayer** is the class that a client application may use to send a message on its pathway. You may find its implementation in ./lib/message_relay_client.js.

The *MessageRelayer* class may be configured to send messages over its transport (TCP or TLS) connected to one peer. Or, it may be configured to write messages to files. There is also an option to write messages to files when the network connection fails, and another option to send the messages from the file after the connection is reestablished.

Several types of file activity are possible. The *MessageRelayer* instance may write to files while a connection is broken, or it may only ever write to files. If it writes to files, it may write each message to its own file or it may write messages to a single file in a stream. (Files are written to a local directory.) There is also an option to send the messages from the backup file after the connection is reestablished

The *MessageRelayer* **\_response\_id** is generated from a list of free id's stored within the *MessageRelayer* instance. Configurations may include ***max\_pending\_messages*** to set an upper limit on the number of messages waiting for response. If this configuration field is not supplied, the default is 100.

#### *Methods*

*  **closeAll()**
> destroys the socket connection



#### MessageRelays Configuration Example
```
{
    "port" : 5112,
    "address" : "localhost",
    "files_only" : false,
    "output_dir" : "fail_over_persistence",
    "output_file" : "/user_data.json",
    "max_pending_messages" : false,
    "file_shunting" : false,
    "max_reconnect" : 24,
    "reconnect_wait" : 5,
    "attempt_reconnect" : true
}
```

<a name="servemessagerelay-class"/></a> [back to top](#top-of-doc)  
[back to classes](#classes-class)
### 2. **ServeMessageRelay**

A *ServeMessageRelay* instance creates a server (TCP or TLS) when it is constructed. 

An applicatons calls ```let server = new ServeMessageRelay(conf)```. The class first initializes itself from the configuration. Then server starts running at this point. 

The server expects JSON object to be delivered to it by *MessageRelayer* peers.

For each message coming in on a *MessageRelayer* connection, the server finds the path handler, *PathHandler* instance, identified by the \_m\_path field of the message. It then looks at the \_tx\_op and calls the appropriate method of the *PathHandler* instance. If there is no \_tx\_op and no \_ps\_op, the default is to forward the message through the *PathHandler* instance. If the path has a \_ps\_op, the pub/sub operations of the *PathHandler* instance are invoked.

##### Fan in and Fan out
> The clients of the relay, instances of *MessageRelayer*, send messages in a **fan-in** pattern to the the *ServeMessageRelay* instance. The *PathHandler* instances configured for and made by the *ServeMessageRelay* instance send messages along the pathways for which each path type has a client. So, the connections are potentially many to a few configured endpoint client connections.
> 
> **numerical example**:  So, if a 100 clients send messages along 4 pathways, the *ServeMessageRelay* instance is configured to use 4 connections created by the 4 *PathHandler* instances.

#### ServeMessageRelay Configuration Example

This is a relay server that has several path types that can be found in the types from the default PathHandler object. In this example, path types are specified in the configuration and they just happen to be the default path types. Also, there is a field **path\_handler\_factory** which names the class of the PathHandler. It may be best for your application to use the file "path-handler.js" in the directory "path_handler" as a template.

Notice that each path handler configuraion has a *relay* field containing configuration information for the MessageRelayer that the PathHandler instance creates.

In the following, the *tls* field calls out various key and cert files.

```
{
    "port" : 5112,
    "address" : "localhost",
    "tls" : {
    	"server_key" : "my_server_key.pem",
    	"server_cert" : "my_server_cert.pem",
    	"client_cert" : "my_client_cert.pem"
    },
    "path_types" : ["outgo_email","contact","user","persistence"],
    "path_handler_factory" : "MyAppPathHandler",
    "path_types" : {
        "outgo_email" : {
            "relay" : {
                "files_only" : true,
                "file_per_message" : false,
                "output_dir" : "mail",
                "output_file" : "outgoing",
                "wrap_limit" : 50
            }
        },
        "contact" : {
            "relay" : {
                "files_only" : true,
                "file_per_message" : false, 
                "output_dir" :  "contacts",
                "output_file" : "contacts",
                "wrap_limit" : 50
            }
        },
        "user" : {
            "relay" : {
                "files_only" : false,
                "output_dir" : "fail_over_user",
                "output_file" : "/user_data.json",
                "port" : 5114,
                "address" : "localhost",
                "max_pending_messages" : false,
                "file_shunting" : false,
                "max_reconnect" : 24,
                "reconnect_wait" : 5,
                "attempt_reconnect" : true
            }
        },
        "persistence" : {
            "relay" : {
                "files_only" : false,
                "output_dir" : "fail_over_persistence",
                "output_file" : "/user_data.json",
                "port" : 5116,
                "address" : "localhost",
                "max_pending_messages" : false,
                "file_shunting" : false,
                "max_reconnect" : 24,
                "reconnect_wait" : 5,
                "attempt_reconnect" : true
            },
            "types" : [ "assets", "blog", "demo", "ownership", "stream" ]
        }
    }
}

```

<a name="servemessageendpoint-class"/></a> [back to top](#top-of-doc)
### 3. **ServeMessageEndpoint**

An endpoint server may often have the purpose of storing meta data about larger objects such as blog entries, media that may be streamed, images, etc. An endpoint application may store tables listing the meta data files owned by a particular user or entity as part of the bookkeeping associated with storing meta data. In one application, the meta data contains IPFS CIDs which blog services present as links to be retreived by streaming services.

This class always sends a response back to it connecting peer. 

You may find this class's implementation in ./lib/message_endpoints.js.

When the *ServeMesageEndpoint* object dequeues a message, it looks for the field **\_ps\_op**. If the field is not found, the message is passed to the descendant application class. Otherwise, the pub/sub messages are handled. 

#### *Methods*
This class provides three methods that should be implemented by descendant classes:

* **app\_message\_handler(msg_obj)**
> The ServeMessageEndpoint class calls this when it dequeues regular messages (not pub/sub). Applications should override this class to execute their message response.

* **app\_subscription\_handler(topic,msg_obj)**
> When a publication message comes through (**\_ps\_op** === 'pub') ServeMessageEndpoint calls this method after forward the message to all connected subscribers.

* **app\_publish(topic,msg_obj)**
> This method is provided so that a descendant application may intiate publication. This sends the message to all subscribed peers.


#### EndPoints Configuration Example

Each top level field in the object below configures one of two endpoints. The ports are for servers. These configurations are from applications. So, these are the directory structures of applications.

```
{
    "user_endpoint" : {
        "port" : 5114,
        "address" : "localhost",
        "user_directory" : "./user-assets",
        "asset_template_dir" : "./user_templates",
        "all_users" : "users",
        "record_generator" : ["transitions/dashboard","transitions/profile"]
    },
    "persistence_endpoint" : {
        "port" : 5116,
        "address" : "localhost",
        "user_directory" : "./user-assets",
        "directories" : {
            
            "blog" :  "./persistence/blog",
            "stream" :  "./persistence/stream",
            "demo" :  "./persistence/demo",
            "links" :  "./persistence/links",
            
            "contacts" : "./persistence/links",
            "ownership" : "./persistence/ownership",
            "wallet" : "./persistence/wallet",
            "assets" :  "./persistence/assets",
            
            "notification" : "./persistence/notify"
        },
        "create_OK" : true
    }
 }
```


<a name="pathhandler-class"/></a> [back to top](#top-of-doc)
### 4. **PathHandler**

Pathways are required for passing messages through *ServeMessageRelay*. Configuring the pathways helps in organizing an application around services that have been intentionally placed on machines within a cluster. If an application does not use *ServeMessageRelay* and just connects *MessageRelayer* instances to endpoints, *ServeMessageEndpoint* instances, then there will be no use for a PathHandler instance.

An example, default, implementation for a *PathHandler* class can be found in /path-handler/path-handler.js.

The *ServeMessageRelay* makes use of the following methods when calling a *PathHandler* instance:

#### *Methods*
* **async send(message)**
> Forwards the message through the MessageRelay instance

* **get(message)**
> Forwards the message through the MessageRelay instance

* **get(message)**
> Forwards the message through the MessageRelay instance

* **subscribe(topic,msg,handler)**
> Forwards the subscription through the MessageRelayClient instance for the first subscription of the topic. And, sets up a single publication handler for all possible clients expected to subscribe. Installs a handler made by the ServeMessageRelay instance on behalf of each client subscribed to be called by the handler installed in the MessageRelayClient.

* **unsubscribe(topic,handler)**
> Calls the removes the handler from subscription. If there no more handlers, this will call its MessageRelayClient *unsubscribe* method.


<a name="peerpublishinghandler-class"/></a> [back to top](#top-of-doc)
### 5. **PeerPublishingHandler**



<a name="multirelayclient-class"/></a> [back to top](#top-of-doc)
### 6. **MultiRelayClient**

This class wraps around a list of *RelayClient* and exposes methods of the same name as those in *RelayClient*. The only difference is, a *MultiRelayClient* instance will pick a peer connection according to a schedule to send the message to. It is assumed that the endpoints at the ends of the relay are perform the same or similar and mutually beneficial services as their counterparts.

#### MultiRelayClient Configuration Example

The *MultiRelayClient* configures each instance of a *MessageRelayer* the same. Furthermore, it makes no distinction about where messages go by their type. It just picks a peer according to a configured schedule, balance strategy, and sends the message. It attempts to fail over to choosing a live peer connection when other peers fail. If all the peers fail, messages may be shunted to files. Currently, balance_strategy can be **sequence** (like round robin) or **random**. 

```
{
	"peers" : [
		"balance_strategy" : "random",
		{
		    "port" : 5112,
		    "address" : "localhost",
		},
		{
		    "port" : 5112,
		    "address" : "192.168.10.10",
		},
		{
		    "port" : 6118,
		    "address" : "10.10.10.10",
		}
	]
    "files_only" : false,
    "output_dir" : "fail_over_persistence",
    "output_file" : "/user_data.json",
    "max_pending_messages" : false,
    "file_shunting" : false,
    "max_reconnect" : 24,
    "reconnect_wait" : 5,
    "attempt_reconnect" : true
}
```


<a name="multipathrelayclient-class"/></a> [back to top](#top-of-doc)
### 7. **MultiPathRelayClient**

This class wraps around a map of *RelayClient*, path to *RelayClient*. The class exposes methods of the same name as those in *RelayClient*, but the certain methods add a path parameter.

A *MultiPathRelayClient* instance will pick a peer connection according to the path parameter of a method and send a message to the specialized server (an EndpointServer for instance). It is not assumed that the endpoints at the ends of the relay are perform the same or similar as their path counterparts. 


#### MultiPathRelayClient Configuration Example

The * MultiPathRelayClient* configures each instance of a *MessageRelayer* according to path specific parameters.

```
{
	"paths" : [
		{
			"path" : "users",
			"port" : 5112,
			"address" : "localhost",
		},
		{
			"path" : "persistance",
			"port" : 5112,
			"address" : "192.168.10.10"
		},
		{
			"path" : "admin",
			"port" : 6118,
			"address" : "10.10.10.10"
		}
	]
    "files_only" : false,
    "output_dir" : "fail_over_persistence",
    "output_file" : "/user_data.json",
    "max_pending_messages" : false,
    "file_shunting" : false,
    "max_reconnect" : 24,
    "reconnect_wait" : 5,
    "attempt_reconnect" : true
}
```



<a name="serverwithipc-class"/></a> [back to top](#top-of-doc)
### 8. **ServerWithIPC**

The **ServerWithIPC** is subclass of the endpoint server. It does almost everything the same as an endpoint server. But, it extends the class initialization in order to set up a message handler for messages comming from its parent process. Also, it replaces the definition of the **writer** class with that of a **ProcWriter**. The **ProcWriter** has a *write* method that sends messages to the parent process.

<a name="ipcclient-class"/></a> [back to top](#top-of-doc)
### 9. **IPCClient**

The  **IPCClient** is a subclass of the common communicator class. Once messages are injested by this client, it operates the same as the other message relay classes which descend from the common communicator.

This class differs in that it spawns a child processes as part of its initialization. Then, it sets up the IPC responses an installs a child process facing  **ProcWriter**. That is, the  **ProcWriter**  class is local to the **IPCClient** implementation and the **ProcWriter** instances send messages to the child processes they launch. The **ProcWriter** class is initialized (internally) with a handle to the child process. The **ProcWriter** for the server side uses the global variable for the parent process. While, there is **ProcWriter** for each child processes the parent launches.

The configuration for a ** IPCClient** object does not need Internet parameters. It needs the name of a processes or an array containing a process name at the beginning with parameters following.

For example: 

```
    "relay" : {
        "proc_name" : ["global_session", "./sibling.conf"]
    }

```

Or ... for just a node.js processes:

```
    "relay" : {
        "proc_name" : "myprog.js"
    }

```

The **IPCClient** class assumes that the child process implements **ServerWithIPC**.


<a name="udpclient-class"/></a> [back to top](#top-of-doc)
### 10. **UDPClient**

The **UDPClient** is a subclass of the **MessageRelayer** class. It implements the same logic but use UDP (datagram) connections. 

The **UDPClient** can be configured to use ip4 or ip6.

The **UDPClient** sends and makes connections on a best effort basis and does not add logic to account for stream contiguity. Messages sent should be JSON objects small enough in text representation to stay within the limits of UDP packet sizes.

By default the **UDPClient** configures itself to use the **ResponseVectorTimeout** class for its response vector. Since it is more likely that a UDP packete may be lost in response, leaving a promise hanging, a timeout is set for each response. Failed responses report an error. For further reference, see the section on [**ResponseVectorTimeout**](#responsevectortimeout-class).

<a name="udpendpoint-class"/></a> [back to top](#top-of-doc)
### 11. **UDPEndpoint**

The **UDPEndpoint** descends from the **ServeMessageEndpoint** class. It has much of the same operation, hosting pub/sub and application messages. However, it sets up a UDP server instead of TPC or TLS.

By default **UDPEndpoint** keeps track of connecting clients, but has configuration options for controlling how it remembers clients. Also, those clients that subscribe can be remembered for a period of time. 

Then, there is broadcast. A class instance may be configured to use broadcast mode when publishing a topic or it may publish to each client by addess sequentially.

The following is a list of fields that may be included to configure instances of this class:

* conf.`time_out_period` -- The amount of time to keep record of a client even if it has not sent a message. If a client sends a new message, this interval starts over.
* conf.`no_keeps` -- if this is true, the client will remove the record of client after processing a message. This is ignored for subscription and publication.
* conf.`use_broadcast` -- If true, topic publication will be sent out on the broadcast address. The broadcast goes out on the port configured for the server.
* conf.`broadcast_address` --  The address for sending broadcast messages.

These configuration fields apply to all message delivery unless a message specifically requests no to have a reply.

When `use_broadcast` is set to true, the **UDPEndpoint** instance will override the EndpointServer `send_to_all` method and broadcast on ports assigned to various topics.

The use of broadcast can be controlled after configuration by two methods: 

*  `set_use_broadcast(bval)` - sets the broadcast mode of the server port and address. Sets an instance variable as well.
*  `get_use_broadcast`  - returns the state of the instance variable, **true** or **false**

**requesting no response** --

A message can control whether or not a the UDPEndpoint responds if the message contains the field `_no_resp`. If it is included and truthy, the **UDPEndpoint** will not repsond to the message's sender.

All other messages will provide a response indicating that some operation has taken place and perhaps additionally, the response will contain data. For example, 'get' operations return data, but publication operations just report back that publication happened.


<a name="multicastclient-class"/></a> [back to top](#top-of-doc)
### 12. **MulticastClient**

The **MulticastClient** is a subclass of the **UDPClient** class. It forms a connection with a multicast endpoint, **MulticastEndpoint**. The endpoint and the client share (at least in overlap) a table that maps subscription topics to ports. 

This class overrides the communicator class (level) methods, **subscribe** and **unsubscribe**.  These methods manage UDP servers bound to the ports of the topic. The subscribe method has the same parameters as the superclass method. However, the methods include logic to deal with multicast messaging on the ports.

The configuration object passed to the constructor must add in two fields,
`multicast_addr` and `multicast_port_map`.

* **subscribe**

Sets up a UDP server that joins the configured multicast address. This server will receive publication messages on the port to which the server is bound. In particular, `multicast_port_map[topic]` references the table that maps topics to UDP ports.

The subscription server acting on behalf of this client receives messages on the mulitcast address which is (to be clear) not the same messaging pathway to which the UPD client is connected or at least expecting message. Instances of this class are clients in the sense that they send their messages on the UPD pathway available for connection.

* **unsubscribe**

This method access the client associated with the topic and path and then drops its multicast membership and then closes off the server using the topic's port.

<a name="multicastendpoint-class"/></a> [back to top](#top-of-doc)
### 13. **MulticastEndpoint**

The **MulticastEndpoint** class is an extension of the **UDPEndpoint** class. The **MulticastEndpoint** acts in the same way as the **UDPEndpoint** for messages other than pub/sub types of messages. But, for pub/sub messages, the **MulticastEndpoint** implements a topic/port map for pub/sub communication management.

For each topic, the first subscription request causes the **MulticastEndpoint** to create a datagram server and binds it to a port assigned to th topic. Later subscription requests do not try to bind the port again. One the server is bound to the port, the socket is set to use broadcast and the multicast TTL is set to a sizeable number of hops (a constant within the module). This class overrides `add_to_topic(topic,client_name,relayer)` from the **ServeMessageEndpoint** class. 

When a client publishes a message to a topic, the **MulticastEndpoint** broadcasts the message on the port assigned to the topic. It does this by finding the server bound on to the topics' port. **MulticastEndpoint** overrides `send_to_all(topic,msg_obj,ignore,replier)` in order to implement this broadcast. Internally, the following line of code is called to broadcast:

```
server.send(str_msg, 0, str_msg.length, this.multicast_port_map[topic], this.multicast_addr)
```

Here, `this.multicast_port_map[topic]` evaluates to the topics port. 

**required configuration:**

The following fields should be supplied via the configuration object:

* conf.`multicast_port_map` - this maps topic to ports.
* conf.`multicast_addr` - this is a multicast address available to the topic servers



<a name="relaycontainer-class"/></a> [back to top](#top-of-doc)
### 14. **MessageRelayContainer**

The **MessageRelayContainer** is a class that creates a server and waits for a message from a utility that inculdes the IP and PORT of a server for some type of MessageRelay client object to connect to. For instance, **MessageRelayer** could be the class of an object that would like to know the address and port of a server to connect to, but is willing to wait until asn associated UDP service will receive the configuration variable for the connection.

This class implements `app_message_handler(msg_obj)` with code for just the 'S' `_tx_op`. In the 'S' case (the `set_on_path` case), the message relay class (or extension), `app_message_handler` creates the instance for the message relay class instance after altering the configuration with the requested address and port mentioned in the `msg_obj`. The `msg_obj` must have the field `address` and `port` or may have a `paths` object (to be used by the **MultiRelayClient** and/or **MultiPathRelayClient** classes).


Utilties delivering messages to a **MessageRelayManager** instance must include certain fields in their messages:
```
let addr = msg_obj.address
let port = msg_obj.port
let paths = msg_obj.paths // if using a mutlipath or mutlirelay
```

Once connections are made, the client object will emit **'client-ready'** events which the **MessageRelayContainer** intercepts and then emits its own  **'client-ready'**  event which differs from the client event by the inclusion of a parameter, which the relay client object reference. As such: 

```
self.emit('client-ready',ref)
```

In the test code, there is an example that demonstrates the handling of such an event:

```
relay_proxy.on('client-ready',async (relayc) => {  // this is the response for connecting to the perm server
    let result = await relayc.set_on_path({ "command" : "this is a test CPROD" },'big-test')
    console.log(result)
})

```

The **MessageRelayContainer** stops serving once the it establishes the client connection. That is, this class allows just one client connection to be made.


<a name="relaymanager-class"/></a> [back to top](#top-of-doc)
### 15. **MessageRelayManager**

The **MessageRelayManager** is similar to the **MessageRelayContainer**, except that it waits be informed of as many servers as server connections that it plans to make. Each **MultiRelayClient** that is configured to use the **MessageRelayManager** will be mapped to a label which will be included in messages from utilties that inform the **MessageRelayManager** of servers.

Utilties delivering messages to a **MessageRelayManager** instance must include certain fields in their messages:

```
let lable = msg_obj.labels  - identifies the relay client seeking a particular server. 
let addr = msg_obj.address - same as for MessageRelayContainer
let port = msg_obj.port
let paths = msg_obj.paths
```

The instances of this class, **MessageRelayManager**, do not shutdown after a connection is made. But, they remove the label from a the map that can find the relay client that is waiting for a server to connect to. Hence, the client will connect to one server, the first a utility will apprise it of.

Most likely an application will create one **MessageRelayManager** per process and feed it to all the relay clients (and extensions) that will wait for news about servers. Relay clients using the **MessageRelayManager** will be configured to do so. They will need to have special fields set in their configurations. These fields are the following:

* conf.`_connection_manager ` - a reference to the processes instance fo the **MessageRelayManager** 
* conf,`_connect_label ` - the label that will be used to associate the client with some server and known to a utility that informs the **MessageRelayManager** instance with message set on the path determined by the application.

Once the relay client is connected, the configuration parameters that it needs for reconnection and other fault mode handling remains set. So, if the relay client needs to reconnect to the server, it will perform in the same manner as if the **MessageRelayManager** had never been used.

## Helper Classes

<a name="jsonmessagequeue-class"/></a> [back to top](#top-of-doc)
#### JSONMessageQueue
> This class takes in the data buffers delivered by the data handlers listening on sockets. It parses the stream into strings encoding objects, a string per object. It converts each encoding string into JavaScript objects and enqueues them. It maintains a simple queue of objects and provides the *dequeue* method for classes that use it.

Here are its methods:

* **constructor(decoder,encoder)**
> The constructor sets up instance variables and may set a customer encoder or decoder. Pass false for *decoder* and *encoder* for the default methods, which just implement JSON.parse and JSON.stringify.

* **add_data(data)**
> appends string data to the stream

* **message_complete()**
> parses the stream, decodes the messages, and then enqueues it

* **dequeue()**
> Takes the last message off the queue and returns it or false if the queue is empty. 

* **set_decoder(decoder)**
> allow the application to set its own decoder (working on text between braces, {})

* **set_endcoder(encoder)**
> allow the application to set its own encoder (working on text between braces, {})

* **encode_message(message)**
> available to the application to send encode a message that can be decoded by the decoder

* **decode_message(message_str)**
> call the decoder that has been set (default JSON.parse)
> > The last two methods can be used throughout an application given access to a * JSONMessageQueue* object.

###### *possible customizations*
> Looking at this [msgpack](https://github.com/msgpack) for binary (near binary) transfer of messages.

> It is poissible to do payload nesting from the point of view of custom encoders and decoders.


<a name="responsevector-class"/></a> [back to top](#top-of-doc)
#### ResponseVector

When a message is sent to an endpoint or relayserver for any purpose other than publication, the client may wait for a response. In order to track the response, each message is sent with a `_response_id` field. The class **ResponseVector** manages a map of free response identifiers and maps the response id to the callback function which will release a ***Promise***, for use in the async/await form of calls.

Message sent via publication do not request a response identifier and don't wait for a return message.

The server that receives a message will send a message back via TCP (including TLS) or UDP (sent back to the sender address). The sever will retrieve the response identifier from the client's message and include it in the return message to the client. When the client receives the response, the message handling methods retrieve the resolve handler mapped by the response idenifier, and the ResponseVector releases the response ID.

Applications provide configuration objects to the classes descending from the MessageRelay class. The ResponseVector can be configured to have a max range of response by setting the following variable:

* `conf.max_pending_messages`

> **Default** `max_pending_messages` = 100.


***Overriding***: Applications may want to override this class. For example, applications may want to create an ID that is a collision free hash and uses dynamically sized tables. These classes just have to implement the same methods of the **ResponseVector** class, and the new class will have to be mentioned in the configuration of the MessageRelay (or descendant) constructor. Set the following variable in the configuration object:

* `conf.response_vector`

If this configuration field is set, the Communicator class object will create the response vector as follows:

```
	this.resp_vector = new (require(conf.response_vector)
```

That is, the configuration variable `response_vector` must be the name of a module loadable by `node.js`.

<a name="responsevectortimeout-class"/></a> [back to top](#top-of-doc)
#### ResponseVectorTimeout

The **ResponseVectorTimeout** class extends the class **ResponseVector**. It adds an interval timer that checks if messages are awaiting response for too long. If responses take too long to return, the resolver method will be called and the response identifier will be released when the interval passes the expire time for the identifier.

```
conf.max_message_wait_time -- the time until it is deemed there will be no response 
conf.message_age_check_interval -- the period of the interval timer for checking timeout
```




## Overriding the Message Queue Class

The JSON message queue, which the base class for queue handling in all the servers and clients, is written in a way to provide basic functionality for unloading JSON messages from string buffers and putting them into an object queue. There is no pretention that this class is written with any efficiency or elegance in mind. So, while it works well enough for small JSON objects riding through the clients and servers, it may be awkward for larger data objects, and it might be written more efficiently as well.

There are two possible ways of replacing the class. One is to write a new base class with the same name and depositing it in the directory **json-message-queue** within the module. Another way is to override exposed classes for which it is a bases, changing methods, and then mentioning those new classes in the configuration files for applications.

In other languages than JavaScript, this override might have been done in a different way. Also, there is the possibility of extracting the base class *JSONMessageQueue* and making npm manage differences. Perhaps something like this will be done in the future. For now, changes can be made more locally. It may mean that one or two methods has to be repeated in subclasses. 

* **JsonMessageHandlerRelay**
* **EndpointReplier**
* **JSONMessageQueue**

For enpoint servers in particular, the **EndpointReplier** can be overriden and the `dequeue_messages` method would be left as is. For clients, it would be better to just override **JSONMessageQueue**.

<a name="reserved-field-names" ></a>
## Reserved Field Names

* **\_m\_path** identifies the path for the message. The set of path tags can be defined by the application. 
* **\_tx\_op** identifies an operation that specifies a limited set of operations identified by a single character. Among these are 'S','G','D' for Set, Get, and Delete
* **\_ps\_op** identifies a **pub/sub** operation.
* **topic** identifies a **pub/sub** topic.
* **\_response\_id** is a field that the MessageRelayer adds to a message object in order to identify responses with message that were sent. Applications should not add this field to the top layer of their application messages.


