/**
 * Copyright 2020 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class SignalkClient {

    constructor(host, port, options={}) {
        if ((options) && (options.debug)) console.log("SignalkClient(%s,%d,%s)...", host, port, options);

        this.host = host;
        this.port = parseInt(port);

        this.ws = null;
        this.directory = {};

        if ((host !== undefined) && (port !== undefined)) {
		    console.log("SignalkClient: opening websocket connection to %s on port %s", host, port);
       	    this.ws = new WebSocket("ws://" + host + ":" + port + "/signalk/v1/stream?subscribe=none");
            var _this = this;
            this.ws.onopen = function(evt) {
                console.log("SignalkClient: connection established");
            }.bind(this);
            this.ws.onerror = function(evt) {
                console.log("SignalkClient: connection failed");
                this.ws = null;
            }.bind(this);
            this.ws.onmessage = function(evt) { 
                //console.log("SignalK: websocket message received %s", JSON.stringify(evt.data));
                var data = JSON.parse(evt.data);
                if ((data.updates !== undefined) && (data.updates.length > 0)) {
                    data.updates.forEach(update => {
                        var source = update["$source"];
                        var timestamp = update["timestamp"];
   	                    if ((update.values !== undefined) && (update.values.length > 0)) {
                            update.values.forEach(updateValue => {
   		                        var path = updateValue.path;
   		                        var value = updateValue.value;
   		                        if ((path !== undefined) && (value !== undefined) && (this.directory[path] !== undefined)) {
                                    this.directory[path].forEach(callback => callback({ "source": source, "timestamp": timestamp, "value": value }));
                                }
                            });
                        }
                    });
                }
            }.bind(this);
        } else {
            console.log("SignalkClient: invalid host specification");
        }
    }

    getHost() {
        return(this.host);
    }

    getPort() {
        return(this.port);
    }

    isConnected() {
        return(this.ws != null);
    }

    waitForConnection(timeout=500) {
        const poll = resolve => {
            if (this.ws.readyState === WebSocket.OPEN) { resolve(); } else { setTimeout(_ => poll(resolve), timeout); }
        }
        return new Promise(poll);
    }

    getEndpoints(callback) {
        var everything = this.getValue("", undefined, v=>v);
        callback(this.getPath(everything, "", []));
    }
        
    getPath(tree, value, accumulator) {
        if ((tree) && (typeof tree === "object")) {
            var keys = Object.keys(tree);
            if ((keys.length > 0) && (!keys.includes("value"))) {
                keys.forEach(key => {
                    accumulator = this.getPath(tree[key], (value + ((value.length > 0)?".":"") + key), accumulator);
                });
            } else {
                accumulator.push(value);
            }
        } else {
            accumulator.push(value);
        }
        return(accumulator);
    }

    registerCallback(path, callback, filter) {
        //console.log("registerCallback(%s,%s,%s)...", path, callback, filter);

        if (this.ws != null) {
            if (this.directory[path] === undefined) {
                this.directory[path] = [];
                var subscriptions = [ { "path": path, "minPeriod": 1000, "policy": "instant" } ];
                var msg = { "context": "vessels.self", "subscribe": subscriptions };
                this.ws.send(JSON.stringify(msg));
        	}

            if (!this.directory[path].includes(callback)) {
                this.directory[path].push((v) => {
                    v = (filter)?filter(v):((v.value !== undefined)?v.value:v);
                    switch (typeof callback) {
                        case "object": callback.update(v); break;
                        case "function": callback(v); break;
                        default: break;
                    }
                });
            } else {
                console.log("SignalK: refusing to register a duplicate callback");
            }
        } else {
            console.log("SignalK: cannot register callback because websocket is not open");
        }
    }

    registerInterpolation(path, element, filter) {
        //console.log("registerInterpolation(%s,%s,%s)...", path, element, filter);
 
        this.registerCallback(path, function(v) { element.innerHTML = v; }.bind(this), filter);
    }

    getValue(path, callback, filter) {
        //console.log("getValue(%s,%s,%s)...", path, callback, filter);

        var retval = null
        
        SignalkClient.httpGet(SignalkClient.normalisePath(path), (callback !== undefined), (v) => {
            v = JSON.parse(v);
            v = (filter)?filter(v):((v.value !== undefined)?v.value:v);
            if (callback !== undefined) {
                switch (typeof callback) {
                    case "object": callback.update(v); break;
                    case "function": callback(v); break;
                    default: break;
                }
            } else {
                retval = v;
            }
        });
        return(retval);
    }

    interpolateValue(path, element, filter) {
        //console.log("interpolateValue(%s,%s,%s)...", path, element, filter);

        this.getValue(path, function(v) { element.innerHTML = v; }.bind(this), filter);
    }

    static httpGet(theUrl, async, callback) {
        var xmlHttp = new XMLHttpRequest();
        if (async) {
            xmlHttp.onreadystatechange = function() {
                if (xmlHttp.readyState == 4 && xmlHttp.status == 200) callback(xmlHttp.responseText);
            }
        }
        xmlHttp.open("GET", theUrl, async);
        xmlHttp.send();
        if (!async) {
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200) callback(xmlHttp.responseText);
        }
    }

    static normalisePath(path) {
        var retval = "/signalk/v1/api/vessels/self/";
        var parts = path.split("[");
        retval += parts[0].replace(/\./g, "/");
        if (parts[1] !== undefined) retval += ("[" + parts[1]);
        return(retval);
    }


}
