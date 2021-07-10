# message-relay-services
 
This javascript package exposes four basic classes and one luxury class:

1. **MessageRelayer**
2. **ServeMessageRelay**
3. **ServeMessageEndpoint**
4. **PathHandlers**
5. **MultiRelayClient**

The application should override these classes and create instance methods.

In this group of modules, MultiRelayClient is deemed a luxury class. It is a wrapper around a collection of MessageRelayer objects. It allows a rough form of load balancing for those applications using more than one peer processor.

###Purpose

These classes pass **JSON** objects through ***pathways*** from application clients to application server endpoints. There is also a very simple pub/sub mechanism implemented in these classes as well.

The network architeture that these classes are meant for is one that is fairly well fixed. For example, these may work well for applications in a cluster. So, preconfiguration of IP addresses is assumed.

The main use of these classes has been for transfering meta data (data about data) from a web dashboards and desktop applications to services that provide information for small servers such as blogs. One current application writes JSON object to directories on a machine that hosts blog servers. These directories may become RAM Disk at some point.

Some of the meta data may refer to IDs of data which provide access to larger data outside the realm of the cluster. These classes dont' examine the meta data objects. They just pass messages.

Those looking for a much larger suite of capabilities should look elsewhere.

####Servers

*  **ServeMessageRelay**
*  **ServeMessageEndpoint**

####Clients

* **MessageRelayer**
* **PathHandlers** (from within ServeMessageRelay through MessageRelayer)
* **MultiRelayClient**

####Messages

All messages are **JSON** objects. The JSON objects will have the structure required by the endpoint that consumes them. For the sake of passing the JSON objects through the servers, some particular field will be required. Application code must put in one or two fields with specific values.

* **\_m\_path** identifies the path for the message. The path tag can be defined by the application. 
* **\_tx\_op** identifies an operation that specifies a limited set of operations identified by a single character. Among these are 'S','G','D' for Set, Get, and Delete
* **\_ps\_op** identifies a **pub/sub** operation.
* **topic** identifies a **pub/sub** topic.

Messages that are sent (as opposed to published) expect return values. Internally, the JSON object will be articulated with a helper field **\_response\_id**.

These are the only fields reserved by this package.

###Install
```
npm install message-relay-service
```

###Pathways

A **pathway**, as far as this package is concerned, is a *tagged* pathway from a client to an endpoint though servers. A **tag** is attached to a message 

###Configuration

Please refer to the configuration sections within each class description.


##Classes

Two of the classes provide server functions. Two provde client functions. One class provides multiple clients.

While these classes are very common among networking projects, they provide a fairly straightfoward path for breaking up services on a small gang of really small processors. There is no attempt to serve a generic large distribution of like processors. These are helping bring up services that are planned for interfacing larger scale efforts. Futhermore, these classes provide a framework for introducing replacement code in other languages other than JavaScript.

So, the pub/sub mechanism is based on local JavaScript maps. They also have fairly well planned and configured endpoints. 


###1. **MessageRelayer**

MessageRelayer is the class that a client application may use to send a message on its pathway. You may find its implementation in ./lib/message_relay_client.js.

The MessageRelayer class may be configured to send messages over its transport (TCP/TLS). Or, it may be configured to write messages to files. There is also an option to write messages to files when the network connection fails, and another option to send the messages from the file after the connection is reestablished.

Several types of file activity are possible. The MessageRelayer instance may write to files while a connection is broken, or it may only ever write to files. If it writes to files, it may write each message to its own file or it may write messages to a single file in a stream. (Files are written to a local directory.) There is also an option to send the messages from the backup file after the connection is reestablished





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



### 3. **ServeMessageEndpoint**

An endpoint server may often have the purpose of storing meta data about larger objects such as blog entries, media that may be streamed, images, etc. An endpoint application may store store tables listing the meta data files owned by a particular user or entity as part of the bookkeeping associated with storing meta data. In one application, the meta data contains IPFS CIDs which blog services present as links to be retreived by streaming services.

This class always sends a response back to it conneting peer. 

You may find this class's implementation in ./lib/message_endpoints.js.

When the ServeMesageEndpoint object dequeues a message, it looks for the field **\_ps\_op**. If the field is not found, the message is passed to the descendant application class. Otherwise, the pub/sub messages are handled. 

This class provides three methods that should be implemented by descendant classes:

* **app\_message\_handler(msg_obj)**
> The ServeMessageEndpoint class calls this when it dequeues regular messages (not pub/sub). Applications should override this class to execute their message response.

* **app\_subscription\_handler(topic,msg_obj)**
> When a publication message comes through (**\_ps\_op** === 'pub') ServeMessageEndpoint calls this method after forward the message to all connected subscribers.

* **app\_publish(topic,msg_obj)**
> This method is provided so that a descendant application may intiate publication. This sends the message to all subscribed peers.


#### EndPoints Configuration Example

Each field top level field in the next object configures one of two endpoints. The ports are for servers.  These configurations are from applications. So, these are the directory structures of applications.

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



### 4. **PathHandlers**

Pathways are required for passing through ServeMessageRelay, but the use of the class is optional. Clients may send directly to endpoints.


### 5. **MultiRelayClient**








The message relayer routes messages through pathway handlers. (See the class in path-handler/index.js.) 

The first class eases the interface to the two types of servers provided by the seconds two classs. Applications requiring the interface to the servers make instances of the MessageRelayer, which provides async methods send, sendMessage, sendMail, publish and subscribe.  The message relayer may be configured to pass messages on, or it may be configured to put messages into spool files or individual files. 

If pathways are used, ServeMessageRelay will pass messages on to the endpoints or other ServeMessageRelay instances according to a field in the object being passed. That field is, m\_path. Also, the message may indentify an operation to be performed at the enpoint. MessageRelayer attents to the field \_tx\_op in the message object. \_tx\_op should be set to 'G' for retrieval, 'D' for deletion, and 'S' or other for setting, storing, updating, publishing or unpublishing.  All settings other than 'G','S','D' are determined by the application endpoint.


For an example of the use of endpoints, please find the repository categorical-handlers.  The module provided there includes intermediate classes for handling common application objects, e.g. users and generic persitences object, which might be blog entries, etc.



###Configuration

Clients and servers have constructor methods that accept a configuration object.

#### MessageRelays Example
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


#### ServeMessageRelay Example

This is a relay server that has several path types that can be found in the types from the default PathHandler object. In this example, path types are specified in the configuration and they just happen to be the default path types. Also, there is a field **path\_handler\_factory** which names the class of the PathHandler. It may be best for your application to use the file "path-handler.js" in the directory "path_handler" as a template.

```
{
    "port" : 5112,
    "address" : "localhost",
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

#### EndPoints Example

Each field top level field in the next object configure one of two endpoints. The ports are for servers.

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

#### MultiRelayClient Example

The MultiRelayClient configures each instance of a MessageRelayer the same. Furthermore, it makes no distinction about where messages go by their type. It just picks a peer according to a configured schedule, balance strategy, and sends the message. It attempts to fail over to choosing a live peer connection when other peers fail. If all the peers fail, messages may be shunted to files. Currently, balance_strategy can be "sequence" (like round robin) or "random". 

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


 

