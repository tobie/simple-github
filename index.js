"use strict";

var util = require("util"),
    EventEmitter = require("events"),
    request = require("request"),
    urlModule = require("url"),
    URITemplate = require("urijs/src/URITemplate"),
    pkg = require("./package");

module.exports = function (options) {
    return new GH(options);
}

var HTTP_METHODS = "HEAD|GET|POST|PATCH|PUT|DELETE|head|get|post|patch|put|delete";
var HTTP_METHODS_REGEXP = new RegExp(HTTP_METHODS);
var STARTS_WITH_HTTP_METHODS_REGEXP = new RegExp("^(" + HTTP_METHODS + ")\\s+");
var URL_REGEXP = new RegExp("^(?:" + HTTP_METHODS + ")?\\s*(.*)$");

module.exports.BASE_URL = "https://api.github.com/";

module.exports.GH = GH;
function GH(options) {
    this.options = options || {};
}

GH.prototype.mergeOptions = function mergeOptions(options) {
    var output = {};

    if (this.options.repo) {
        output.repo = this.options.repo;
    }

    if (this.options.owner) {
        output.owner = this.options.owner;
    }

    if (this.options.debug) {
        output.debug = this.options.debug;
    }
    
    if (this.options.cache) {
        output.cache = this.options.cache;
    }

    if (options) {
        for (var k in options) {
            output[k] = options[k];
        }
    }

    // defaults
    output.limit = output.limit || Infinity;

    return output;
};

GH.prototype.request = function(url, options) {
    return new Promise((resolve, reject) => {
        if (typeof url == "object") {
            options = url;
            url = options.url || options.uri;
        }
        options = this.mergeOptions(options);
        var headers = this.headers(options);
        var method =  this.method(url, options);
        url = this.url(url, options);
        var output;
        
        const onresponse = response => {
            var link = response.headers.link;
            if (!link) {
                return output || response.body;
            }
            
            link = this.parseLinkHeader(link);
            output = output || [];
            output.push.apply(output, response.body);
            
            if (output.length >= options.limit) {
                output.length = options.limit;
                return output;
            }
            
            if (link.next) {
                return this.httpRequest(method, link.next, headers, options.body, options).then(onresponse);
            }
            
            return output;
        };
        
        return this.httpRequest(method, url, headers, options.body, options).then(onresponse);
    });
};

GH.prototype.requestList = function(url, options) {
    if (typeof url == "object") {
        options = url;
        url = options.url || options.uri;
    }
    options = this.mergeOptions(options);
    var headers = this.headers(options);
    var method =  this.method(url, options);
    url = this.url(url, options);
    var emitter = new GHEmitter(options);
    
    const onerror = err => emitter.emit("error", err);

    const onresponse = (response) => {
        var link = response.headers.link;
        if (!link) {
            emitter.emit("error", new TypeError("Not a valid list endpoint " + url));
            return;
        }
        link = this.parseLinkHeader(link);
        while (!emitter.stopped && emitter.count < options.limit && response.body.length) {
            emitter.count++;
            emitter.emit("data", response.body.shift());
        }
        if (emitter.stopped) {
            return;
        }
        if (emitter.count >= options.limit || !link.next) {
            emitter.emit("end");
            return;
        }
        
        this.httpRequest(method, link.next, headers, null, options).then(onresponse, onerror);
    };
    
    this.httpRequest(method, url, headers, null, options).then(onresponse, onerror);
    return emitter;
};

GH.prototype.headers = function headers(options) {
    var headers = {};
    options = options || {};
    if (options.headers) {
        for (var k in options.headers) {
            headers[k] = options.headers[k];
        }
    }

    if (options.token) {
        headers["Authorization"] = "token " + options.token.replace(/token\s+/, "");
    }
    headers["User-Agent"] = options.userAgent || pkg.name + "/" + pkg.version;
    return headers;
};

GH.prototype.method = function method(url, options) {
    url = toString(url);
    var m = url.match(STARTS_WITH_HTTP_METHODS_REGEXP);

    if (m) {
        return m[1].toLowerCase();
    }

    m = options && options.method;

    if (m) {
        return this.isHttpMethod(m) ? m.toLowerCase() : null;
    }

    return null;
};

GH.prototype.url = function url(url, options) {
    url = toString(url).trim();
    var m = url.match(URL_REGEXP);
    if (m && m[1]) {
        url = m[1];
    }
    var baseURL = this.options.baseURL || module.exports.BASE_URL;
    
    // Handle urls found in the GitHub API doc of the form:
    // //repos/:user/:repo/commits
    url = url.split("?");
    url[0] = url[0].replace(/:([a-z-_]+)/gi, function(m, m1) {
        if (m1 in options) {
            return options[m1];
        }
        throw new Error("Missing property " + m1);
    });
    url = url.join("?");
    
    // Handle RFC 6570 urls, e.g.: /foo{/bar/}
    url = new URITemplate(url).expand(options, { strict: true });
    return urlModule.resolve(baseURL, url);
};

GH.prototype.httpRequest = function httpRequest(method, url, headers, body, options) {
    if (options.debug) { log("", method, url, headers); }
    return new Promise((resolve, reject) => {
        let requestOptions = {
            method: method,
            url: url,
            headers: headers,
        }
        if (body) {
            requestOptions.body = typeof body == "object" ? JSON.stringify(body) : body;
        }
        
        if (options.cache) {
            
        }
        request(requestOptions, (err, response, responseBody) => {
            if (options.debug) {
                log("Response for ", method, url, response.headers);
            }
            if (err) {
                reject(err);
                return;
            }
            
            responseBody = JSON.parse(responseBody); // TODO base on content type
            
            if (response.statusCode < 200 || response.statusCode >= 400) {
                let err = new Error(responseBody.message);
                err.url = url;
                if (responseBody.errors) { err.errors = responseBody.errors; }
                reject(err);
                return;
            }
            
            resolve({
                headers: response.headers,
                body: responseBody
            });
        });
    });
};

GH.prototype.isHttpMethod = function isHttpMethod(method) {
    return HTTP_METHODS_REGEXP.test(toString(method));
};

GH.prototype.parseLinkHeader = function parseLinkHeader(str) {
    // This assumes rel are unique in a given Link header.
    var output = {};
    toString(str).split(",").forEach(function(pair) {
        pair = pair.match(/<([^>]+)>; rel="([^"]+)"/);
        if (pair) {
            output[pair[2]] = pair[1];
        }
    });
    return output;
};

function log(prefix, method, url, headers) {
    var _headers = Object.keys(headers).map(function(k) {
        var v = "    " + k + ": " + headers[k];
        var first = v.substr(0, 82);
        v = v.substr(82).split(/(.{74})/);
        v.unshift(first);
        return v.filter(function(s) { return s; }).join(" \\\n        ");
    }).join("\n");
    console.log(prefix + method.toUpperCase() + " " + url + "\n" + _headers);
}

function toString(str) {
    return str == null ? "" : String(str);
}

function GHEmitter(options) {
    this.stopped = false;
    this.count = 0;
    this.limit = options.limit;
    EventEmitter.call(this);
}

util.inherits(GHEmitter, EventEmitter);

GHEmitter.prototype.stop = function() {
    this.stopped = true;
    EventEmitter.prototype.emit.call(this, "end");
};

GHEmitter.prototype.emit = function() {
    if (this.stopped) return;
    EventEmitter.prototype.emit.apply(this, arguments);
};