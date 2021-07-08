# message-relay-services
 
This javascript package exposes four basic classes:

1. **MessageRelayer**
2. **ServeMessageRelay**
3. **ServeMessageEndpoint**
4. **PathHandlers**

The application should override these classes and create instance methods.

###Purpose

These classes pass **JSON** objects through ***pathways*** from application clients to application server endpoints. There is also a very simple pub/sub mechanism implemented in these classes as well.

Two of the classes provide server functions. Two provde client functions

####Servers

*  **ServeMessageRelay**
*  **ServeMessageEndpoint**

####Clients

* **MessageRelayer**
* **PathHandlers** (from within ServeMessageRelay through MessageRelayer)

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

Clients and servers have constructor methods that accept a configuration object.

#### MessageRelays
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


#### ServeMessageRelay

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


#### EndPoints

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

##Classes



###1. **MessageRelayer**

MessageRelayer is the class that a client application may use to send a message on its pathway. You may find its implementation in ./lib/message_relay_client.js.

The MessageRelayer class may be configured to send messages over its transport (TCP/TLS). Or, it may be configure to write messages to files. 

Several types of file activity are possible. The MessageRelayer instance may write to files while a connection is broken, or it may only ever write to files. If it writes to files, it may write each message to its own file or it may write messages to a single file in a stream. (Files are written to a local directory.)

If messages are stored in a file while a connection is broken, then the messages may be forwarded when the connection is reestablished.

The client application will 



###2. **ServeMessageRelay**

###3. **ServeMessageEndpoint**

###4. **PathHandlers**




Pathways are required for passing through ServeMessageRelay, but the use of the class is optional. Clients may send directly to endpoints.





The message relayer routes messages through pathway handlers. (See the class in path-handler/index.js.) 

The first class eases the interface to the two types of servers provided by the seconds two classs. Applications requiring the interface to the servers make instances of the MessageRelayer, which provides async methods send, sendMessage, sendMail, publish and subscribe.  The message relayer may be configured to pass messages on, or it may be configured to put messages into spool files or individual files. 

If pathways are used, ServeMessageRelay will pass messages on to the endpoints or other ServeMessageRelay instances according to a field in the object being passed. That field is, m\_path. Also, the message may indentify an operation to be performed at the enpoint. MessageRelayer attents to the field \_tx\_op in the message object. \_tx\_op should be set to 'G' for retrieval, 'D' for deletion, and 'S' or other for setting, storing, updating, publishing or unpublishing.  All settings other than 'G','S','D' are determined by the application endpoint.


For an example of the use of endpoints, please find the repository categorical-handlers.  The module provided there includes intermediate classes for handling common application objects, e.g. users and generic persitences object, which might be blog entries, etc.



 

