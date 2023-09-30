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
10. [**UDPEndpoint**](#udpendpoint-class)
11. [**UDPClient**](#udpclient-class)
12. [**JSONMessageQueue**](#jsonmessagequeue-class)
13. [**MessageRelayContainer**](#relaycontainer-class)
14. [**MessageRelayManager**](#relaymanager-class)

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

#### Clients

* [**MessageRelayer**](#messagerelayer-class)
* [**MultiRelayClient**](#multirelayclient-class)
* [**MultiPathRelayClient**](#multipathrelayclient-class)
* [**IPCClient**](#ipcclient-class)

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
10. [**JSONMessageQueue**](#jsonmessagequeue-class)


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


## Overriding the Message Queue Class

The JSON message queue, which the base class for queue handling in all the servers and clients, is written in a way to provide basic functionality for unloading JSON messages from string buffers and putting them into an object queue. There is no pretention that this class is written with any efficiency or elegance in mind. So, while it works well enough for small JSON objects riding through the clients and servers, it may be awkward for larger data objects, and it might be written more efficiently as well.

There are two possible ways of replacing the class. One is to write a new base class with the same name and depositing it in the directory **json-message-queue** within the module. Another way is to override exposed classes for which it is a bases, changing methods, and then mentioning those new classes in the configuration files for applications.

In other languages than JavaScript, this override might have been done in a different way. Also, there is the possibility of extracting the base class *JSONMessageQueue* and making npm manage differences. Perhaps something like this will be done in the future. For now, changes can be made more locally. It may mean that one or two methods has to be repeated in subclasses. 

* **JsonMessageHandlerRelay**
* **EndpointReplier**
* **JSONMessageQueue**

<a name="reserved-field-names" ></a>
## Reserved Field Names

* **\_m\_path** identifies the path for the message. The set of path tags can be defined by the application. 
* **\_tx\_op** identifies an operation that specifies a limited set of operations identified by a single character. Among these are 'S','G','D' for Set, Get, and Delete
* **\_ps\_op** identifies a **pub/sub** operation.
* **topic** identifies a **pub/sub** topic.
* **\_response\_id** is a field that the MessageRelayer adds to a message object in order to identify responses with message that were sent. Applications should not add this field to the top layer of their application messages.


