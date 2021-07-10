# message-relay-services
 
This javascript package exposes four basic classes and one luxury class:

1. **MessageRelayer**
2. **ServeMessageRelay**
3. **ServeMessageEndpoint**
4. **PathHandler**
5. **MultiRelayClient**

The application should override these classes and create instance methods.

In this group of modules, MultiRelayClient is deemed a luxury class. It is a wrapper around a collection of MessageRelayer objects. It allows a rough form of load balancing for those applications using more than one peer processor.

### Purpose

These classes pass **JSON** objects through ***pathways*** from application clients to application server endpoints. There is also a very simple pub/sub mechanism implemented in these classes as well.

The network architecture that these classes are meant for is one that is fairly well fixed. For example, these may work well for applications in a cluster. So, preconfiguration of IP addresses is assumed.

The main use of these classes has been for transfering meta data (data about data) from a web dashboards and desktop applications to services that provide information for small servers such as blogs. One current application writes JSON objects to directories on a machine that hosts blog servers. In such applications, some of the meta data may refer to IDs of data which can be used to attain access to larger data objects outside the realm of the cluster. 

However, these classes, here in message-relay-services, don't examine meta data objects. They just pass messages. Some might refer to meta data carried in messages to be the "payload" of the message. But, we can say that ***these classes add particular fields to JSON messages to aid in their transport***.

As far as networking and message queue subsystens go, those looking for a much larger suite of capabilities should look elsewhere. The idea here is that these classes supply sufficient communication for bootstrapping a small cluster based website. The may be a simple enough a framework for language transpilation a well.

#### Servers

*  **ServeMessageRelay**
*  **ServeMessageEndpoint**

#### Clients

* **MessageRelayer**
* **PathHandler** (from within ServeMessageRelay through MessageRelayer)
* **MultiRelayClient**

#### Messages

With respect to the classes provided here, all messages are **JSON** objects. The JSON objects will have the structure required by the endpoint that consumes them. For the sake of passing the JSON objects through the servers, some particular field will be required. Application code must put in one or two fields with specific values. Some of the class methods will help in adding these fields.

* **\_m\_path** identifies the path for the message. The set of path tags can be defined by the application. 
* **\_tx\_op** identifies an operation that specifies a limited set of operations identified by a single character. Among these are 'S','G','D' for Set, Get, and Delete
* **\_ps\_op** identifies a **pub/sub** operation.
* **topic** identifies a **pub/sub** topic.
* **\_response\_id** is a field that the MessageRelayer adds to a message object in order to identify responses with message that were sent. Applications should not add this field to the top layer of their application messages.

These are the only fields reserved by this package. (Note that *topic* is the only field without the underscore.)

### Install
```
npm install message-relay-service
```

### Pathways

A **pathway**, as far as this package is concerned, is a *tagged* pathway from a client to an endpoint though servers. A **tag** is attached to a message.  (The message object field for this is **\_m\_path**.)

The *ServeMessageRelay* instances use the path to hand of messages to downstream servers which might be specialized for handling messages on the paths. Usually, instances of *ServeMessageEndpoint* will provide custom code for handling messages at the end of a path.

The set of path tags can be defined by the application. *ServeMessageRelay* takes a configuration object. In the configuration object, there are two fields that may be used to define paths through the *ServeMessageRelay*  instance.

* **path_types** : [ \<a list of path tags as strings\> ]
* **path_handler_factory** : \<the name of a module containing a PathHandler implementation\>

It's up to the application to make the *PathHandler* objects as simple or complex as they want. Perhaps path switching can be done. And, there is nothing stopping an application from chaining instances of *ServeMessageRelay*.

### Configuration

Please refer to the configuration sections within each class description.


## Classes

Two of the classes provide server functions. Two provde client functions. One class provides multiple clients.

While these classes are very common among networking projects, they provide a fairly straightfoward path for breaking up services on a small gang of really small processors. There is no attempt to serve a generic large distribution of like processors. These are helping bring up services that are planned for interfacing larger scale efforts. Futhermore, these classes provide a framework for introducing replacement code in other languages other than JavaScript.

So, the pub/sub mechanism is based on local JavaScript maps. They also have fairly well planned and configured endpoints. 


### 1. **MessageRelayer**

MessageRelayer is the class that a client application may use to send a message on its pathway. You may find its implementation in ./lib/message_relay_client.js.

The *MessageRelayer* class may be configured to send messages over its transport (TCP or TLS) connected to one peer. Or, it may be configured to write messages to files. There is also an option to write messages to files when the network connection fails, and another option to send the messages from the file after the connection is reestablished.

Several types of file activity are possible. The *MessageRelayer* instance may write to files while a connection is broken, or it may only ever write to files. If it writes to files, it may write each message to its own file or it may write messages to a single file in a stream. (Files are written to a local directory.) There is also an option to send the messages from the backup file after the connection is reestablished

The *MessageRelayer* **\_response\_id** is generated from a list of free id's stored within the *MessageRelayer* instance. Configurations may include ***max\_pending\_messages*** to set an upper limit on the number of messages waiting for response. If this configuration field is not supplied, the default is 100.


#### *Methods*

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

*  **send_on_path(message,path)**
> Send a message along the path. The **\_m\_path** field will be added.
> When the message relay service is used, it will pick a relay client (networked through a MessageRelayer) that is configured for the path and send the message through it. These client objects are application specific. But, they use general methods expected by ServeMessageRelay. 

*  **send_op_on_path(message,path,op)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = op.

*  **set_on_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'S'.

*  **get_on_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'G'.

*  **del_on_path(message,path)**
> Send a message along a path with the expectation that an application will process the operation using the message contents. The **\_tx\_op** field is added = 'D'.

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

```
{
    "port" : 5112,
    "address" : "localhost",
    "tls" : {
    	"server_key" : "my_server_key.pem",
    	"server_cert" : "my_server_cert.pem",
    	"server_key" : "my_server_key.pem",
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
> Forwards the subscription through the MessageRelay instance. Installs a handler made by the ServeMessageRelay instance.

* **unsubscribe(topic,msg)**
> Calls the MessageRelay unsubscribe with this.path for the path parameter.


### 5. **MultiRelayClient**

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

