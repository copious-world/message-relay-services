# message-relay-services
 
This javascript package exposes three basic classes:

1. MessageRelayer
2. ServeMessageRelay
3. ServeMessageEndpoint

The application should override these classes and create instance methods.

These classes pass JSON objects through pathways. Pathways are required for passing through ServeMessageRelay, but the use of the class is optional. Clients may send directly to endpoints. 

The message relayer routes messages through pathway handlers. (See the class in path-handler/index.js.) 

The first class eases the interface to the two types of servers provided by the seconds two classs. Applications requiring the interface to the servers make instances of the MessageRelayer, which provides async methods send, sendMessage, sendMail, publish and subscribe.  The message relayer may be configured to pass messages on, or it may be configured to put messages into spool files or individual files. 

If pathways are used, ServeMessageRelay will pass messages on to the endpoints or other ServeMessageRelay instances according to a field in the object being passed. That field is, m\_path. Also, the message may indentify an operation to be performed at the enpoint. MessageRelayer attents to the field \_tx\_op in the message object. \_tx\_op should be set to 'G' for retrieval, 'D' for deletion, and 'S' or other for setting, storing, updating, publishing or unpublishing.  All settings other than 'G','S','D' are determined by the application endpoint.


For an example of the use of endpoints, please find the repository categorical-handlers.  The module provided there includes intermediate classes for handling common application objects, e.g. users and generic persitences object, which might be blog entries, etc.



 

