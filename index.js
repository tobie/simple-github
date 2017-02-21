"use strict";

var EventEmitter = require("events"),
    request = require("request"),
    urlModule = require("url"),
    uriTemplate = require('uritemplate'),
    q = require("q"),
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
    if (typeof url == "object") {
        options = url;
        url = options.url || options.uri;
    }
    options = this.mergeOptions(options);
    var self = this;
    var headers = this.headers();
    var method =  this.method(url, options);
    url = this.url(url, options);
    var body = typeof options.body == "object" ? JSON.stringify(options.body) : options.body;
    var deferred = q.defer();
    var output;
    if (options.debug) { log("", method, url, headers); }

    function onResponse(err, response, responseBody) {
        if (options.debug) {
            var req = response.req;
            log("Response for ", req.method, req.path, response.headers);
        }
        if (err) {
            deferred.reject(err);
        } else if (response.statusCode >= 200 && response.statusCode < 300) {
            var link = response.headers.link;
            responseBody = JSON.parse(responseBody);
            if (link) {
                link = self.parseLinkHeader(link);
                output = output || [];
                output.push.apply(output, responseBody);
                if (output.length >= options.limit) {
                    output.length = options.limit;
                    deferred.resolve(output);
                } else if (link.next) {
                    request({
                        url: link.next,
                        headers: headers,
                        method: method,
                        body: body
                    }, onResponse);
                } else {
                    deferred.resolve(output);
                }
            } else {
                deferred.resolve(output || responseBody);
            }
        } else {
            deferred.reject(errFrom(responseBody, url));
        }
    }
    request({
        url: url,
        headers: headers,
        method: method,
        body: body
    }, onResponse);
    return deferred.promise;
};

GH.prototype.requestList = function(url, options) {
    if (typeof url == "object") {
        options = url;
        url = options.url || options.uri;
    }
    options = this.mergeOptions(options);
    var self = this;
    var headers = this.headers();
    var method =  this.method(url, options);
    url = this.url(url, options);
    var emitter = new EventEmitter();
    var count = 0;
    if (options.debug) { log("", method, url, headers); }

    function onResponse(err, response, responseBody) {
        if (options.debug) {
            var req = response.req;
            log("Response for ", req.method, req.path, response.headers);
        }
        if (err) {
            emitter.emit("error", err);
        } else if (response.statusCode >= 200 && response.statusCode < 300) {
            var link = response.headers.link;
            if (!link) {
                emitter.emit("error", new TypeError("Not a valid list endpoint " + url));
                return;
            }
            responseBody = JSON.parse(responseBody);
            link = self.parseLinkHeader(link);
            while (count < options.limit && responseBody.length) {
                count++;
                emitter.emit("data", responseBody.shift());
            }
            if (count >= options.limit || !link.next) {
                emitter.emit("end");
            } else {
                request({
                    url: link.next,
                    headers: headers,
                    method: method,
                    body: body
                }, onResponse);
            }
        } else {
            emitter.emit("error", errFrom(responseBody, url));
        }
    }
    request({
        url: url,
        headers: headers,
        method: method,
        body: body
    }, onResponse);
    return emitter;
};

GH.prototype.headers = function headers() {
    var options = this.options,
        headers = {};
    
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
    var baseURL = this.options.baseURL || module.exports.BASE_URL
    
    // Handle urls found in the GitHub API doc of the form:
    // //repos/:user/:repo/commits
    url = url.split("?");
    url[0] = url[0].replace(/:([a-z-_]+)/gi, function(m, m1) {
        return options[m1];
    });
    url = url.join("?");
    
    // Handle RFC 6570 urls, e.g.: /foo{/bar/}
    url = uriTemplate.parse(url).expand(options);
    return urlModule.resolve(baseURL, url);
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

function errFrom(body) {
    body = JSON.parse(body);
    var err = new Error(body.message);
    if (body.errors) { err.errors = body.errors; }
    return err;
}

function toString(str) {
    return str == null ? "" : String(str);
}
